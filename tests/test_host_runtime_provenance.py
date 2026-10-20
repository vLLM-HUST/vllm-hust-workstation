"""No GPU imports/process mutations. Test the collector's strict source boundary."""
import importlib.util
import os
from pathlib import Path
import tempfile
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('host_observer', Path(__file__).parents[1] / 'scripts/inspect_host_runtime.py')
observer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(observer)


class SourceEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'vllm').mkdir()
        self.py = self.root / 'vllm/__init__.py'
        self.native = self.root / 'vllm/_C.so'
        self.py.write_text('version = "test"')
        self.native.write_bytes(b'native-test-only')
        for f in (self.py, self.native): os.utime(f, (100, 100))

    def observe(self, remote=observer.CANONICAL, dirty=''):
        def git(*args, **kwargs):
            if args[1] == 'remote': return remote
            if args[1] == 'rev-parse': return 'a' * 40
            if args[1] == 'status': return dirty
            if args[1] == 'ls-files':
                if '--ignored' in args:
                    return '\0'.join(str(p.relative_to(self.root))
                                     for p in self.root.joinpath('vllm').rglob('*')
                                     if p.is_file() and p != self.py)
                return 'vllm/__init__.py\0'
            raise AssertionError(args)
        with patch.object(observer, 'run', side_effect=git):
            return observer.source_evidence(self.root, 200)

    def test_canonical_clean_source_and_native_bytes(self):
        value = self.observe()
        self.assertEqual(value['trackedAndNativeFiles'], 2)
        self.assertEqual(value['nativeArtifacts'], 1)
        self.assertFalse(value['dirty'])
        self.assertEqual(value['sourceDigest'], self.observe(remote='git@github.com:vLLM-HUST/vllm-hust')['sourceDigest'])

    def test_dirty_tree_rejected_not_relabelled_as_base_commit(self):
        with self.assertRaisesRegex(ValueError, 'uncommitted'):
            self.observe(dirty=' M vllm/__init__.py')

    def test_noncanonical_rejected(self):
        with self.assertRaisesRegex(ValueError, 'canonical'):
            self.observe(remote='https://github.com/legacy/vllm')

    def test_source_modified_after_process_start_rejected(self):
        os.utime(self.py, (300, 300))
        with self.assertRaisesRegex(ValueError, 'after serving'):
            self.observe()

    def test_native_artifacts_required(self):
        self.native.unlink()
        with self.assertRaisesRegex(ValueError, 'native artifacts missing'):
            self.observe()

    def test_native_bytes_participate_in_digest(self):
        first = self.observe()['sourceDigest']
        self.native.write_bytes(b'different-native-bytes')
        os.utime(self.native, (100, 100))
        self.assertNotEqual(first, self.observe()['sourceDigest'])

    def test_ignored_python_build_input_participates_in_digest(self):
        helper = self.root / 'vllm/generated_helper.py'
        helper.write_text('value = 1')
        os.utime(helper, (100, 100))
        first = self.observe()['sourceDigest']
        helper.write_text('value = 2')
        os.utime(helper, (100, 100))
        self.assertNotEqual(first, self.observe()['sourceDigest'])

    def test_ignored_build_input_modified_after_start_rejected(self):
        helper = self.root / 'vllm/generated_helper.py'
        helper.write_text('value = 1')
        os.utime(helper, (300, 300))
        with self.assertRaisesRegex(ValueError, 'after serving'):
            self.observe()

    def test_bytecode_cache_is_not_source_identity(self):
        first = self.observe()['sourceDigest']
        cache = self.root / 'vllm/__pycache__/generated.cpython-312.pyc'
        cache.parent.mkdir()
        cache.write_bytes(b'runtime cache')
        self.assertEqual(first, self.observe()['sourceDigest'])

    def test_symlink_source_rejected(self):
        self.py.unlink()
        self.py.symlink_to(self.native)
        with self.assertRaisesRegex(ValueError, 'symlink'):
            self.observe()

    def test_invalid_service_rejected_before_system_calls(self):
        with patch.object(observer, 'identity', side_effect=AssertionError('must not inspect')):
            with self.assertRaisesRegex(ValueError, 'invalid configured service'):
                observer.observe('unit;echo secret', '/unused', 'router.service')

    def test_routes_bound_to_running_gateway_configuration(self):
        routes = self.root / 'routes.json'
        routes.write_text('{"models": []}')
        os.utime(routes, (100, 100))
        _, _, _, value = observer.read_bound_routes(routes, routes, 200)
        self.assertEqual(value, {'models': []})
        with self.assertRaisesRegex(ValueError, 'differs from running gateway'):
            observer.read_bound_routes(routes, self.root / 'different.json', 200)

    def test_route_disk_change_after_gateway_start_rejected(self):
        routes = self.root / 'routes.json'
        routes.write_text('{"models": []}')
        os.utime(routes, (300, 300))
        with self.assertRaisesRegex(ValueError, 'after gateway started'):
            observer.read_bound_routes(routes, routes, 200)


class DeployPreflightTests(unittest.TestCase):
    def preflight(self, changes=None):
        source = (Path(__file__).parents[1] / 'scripts/deploy_workstation.sh').read_text()
        function = source.split('capture_runtime_provenance() {', 1)[1].split('\n}\n', 1)[0]
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            python = root / 'python3'
            trace = root / 'args'
            python.write_text('#!/bin/sh\nprintf "%s\\n" "$@" > "$PREFLIGHT_TRACE"\n')
            python.chmod(0o700)
            env = {'PATH': f'{root}:/usr/bin:/bin', 'SCRIPT_DIR': '/trusted/scripts',
                   'PREFLIGHT_TRACE': str(trace), 'WORKSTATION_HOST_RUNTIME_SERVICE': 'engine.service',
                   'WORKSTATION_HOST_RUNTIME_ROUTER_SERVICE': 'router.service',
                   'WORKSTATION_HOST_RUNTIME_ROUTES_FILE': '/trusted/routes.json'}
            env.update(changes or {})
            result = subprocess.run(['bash', '-c', 'set -eu\ncapture_runtime_provenance() {' + function + '\n}\ncapture_runtime_provenance'],
                                    env=env, text=True, capture_output=True)
            return result, trace.read_text() if trace.exists() else ''

    def test_host_deploy_preflights_live_observer_not_old_receipt(self):
        result, args = self.preflight()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(args.splitlines(), ['/trusted/scripts/inspect_host_runtime.py',
            '--service', 'engine.service', '--router-service', 'router.service',
            '--routes-file', '/trusted/routes.json'])

    def test_ambiguous_host_container_config_rejected(self):
        result, args = self.preflight({'WORKSTATION_RUNTIME_CONTAINER': 'old-container'})
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(args, '')

    def test_missing_router_config_rejected(self):
        result, args = self.preflight({'WORKSTATION_HOST_RUNTIME_ROUTER_SERVICE': ''})
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(args, '')


if __name__ == '__main__': unittest.main()
