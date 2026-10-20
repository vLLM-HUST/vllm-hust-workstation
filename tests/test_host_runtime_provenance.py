"""No GPU imports/process mutations. Test the collector's strict source boundary."""
import importlib.util
import os
from pathlib import Path
import tempfile
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
            if args[1] == 'ls-files': return 'vllm/__init__.py\0'
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

    def test_symlink_source_rejected(self):
        self.py.unlink()
        self.py.symlink_to(self.native)
        with self.assertRaisesRegex(ValueError, 'symlink'):
            self.observe()

    def test_invalid_service_rejected_before_system_calls(self):
        with patch.object(observer, 'identity', side_effect=AssertionError('must not inspect')):
            with self.assertRaisesRegex(ValueError, 'invalid configured service'):
                observer.observe('unit;echo secret', '/unused')


if __name__ == '__main__': unittest.main()
