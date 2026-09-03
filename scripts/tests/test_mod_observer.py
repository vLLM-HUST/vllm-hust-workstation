"""Worker witness contract tests with fake Mod methods, not NPU inference."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import Mock, patch
import uuid
import zipfile

scripts = Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("worker_witness", scripts / "runtime/workstation_mod_runtime/__init__.py")
witness = importlib.util.module_from_spec(spec)
spec.loader.exec_module(witness)
spec = importlib.util.spec_from_file_location("observer_builder", scripts / "build_mod_observer.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class WorkerWitnessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="mod-witness-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.context = {"deploymentId": str(uuid.uuid4()), "targetId": "workstation", "configurationHash": "a" * 64,
                        "workerCount": 1, "targetModel": "target", "draftModel": "draft", "speculativeTokens": 3}
        self.artifact = {"modId": "diffspec", "sourceSha": "b" * 40, "wheelSha256": "c" * 64, "version": "0.2.0", "componentFileSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
        for mock in [patch.object(witness, "EVIDENCE_ROOT", self.root), patch.object(witness, "installed_identity", return_value=self.artifact),
                     patch.object(witness, "rank_identity", return_value={"rank": 0, "worldSize": 1})]:
            mock.start(); self.addCleanup(mock.stop)
        fake_module = ModuleType("diffspec.proposer")
        fake_module.__file__ = __file__
        mock = patch.dict(sys.modules, {"diffspec.proposer": fake_module})
        mock.start(); self.addCleanup(mock.stop)
        config = SimpleNamespace(model_config=SimpleNamespace(model="target"), speculative_config=SimpleNamespace(model="draft", num_speculative_tokens=3, draft_context_policy="diffspec"))

        class AscendDiffSpecEagleProposer:
            __module__ = "diffspec.proposer"

            def __init__(self):
                self.vllm_config = config
                self.diffspec_cache = None
                self.fail_load = False
                self.fail_draft = False

            def load_model(self, value):
                if self.fail_load:
                    raise RuntimeError("original model failure")
                self.diffspec_cache = object()
                return value

            def _run_merged_draft(self, value):
                if self.fail_draft:
                    raise RuntimeError("original draft failure")
                return value

        self.proposer = AscendDiffSpecEagleProposer
        fake_module.AscendDiffSpecEagleProposer = self.proposer
        witness.instrument(self.proposer, self.context, self.artifact)
        self.instance = self.proposer()

    def collect(self):
        return witness.collect(self.context)

    def record_file(self):
        return next((self.root / self.context["deploymentId"]).glob("*.json"))

    def test_import_or_constructor_never_proves_load(self):
        result = self.collect()
        self.assertFalse(result["materializationVerified"])
        self.assertFalse(result["inferenceVerified"])
        self.assertEqual(result["workers"], [])

    def test_successful_load_and_draft_are_distinct_and_keep_return_values(self):
        token = object()
        self.assertIs(self.instance.load_model(token), token)
        loaded = self.collect()
        self.assertTrue(loaded["materializationVerified"])
        self.assertFalse(loaded["draftExecutionObserved"])
        self.assertIs(self.instance._run_merged_draft(token), token)
        executed = self.collect()
        self.assertTrue(executed["draftExecutionObserved"])
        self.assertFalse(executed["inferenceVerified"])
        self.assertEqual(executed["workers"][0]["process"], witness.process_identity(os.getpid()))
        self.assertEqual(executed["workers"][0]["componentFileSha256"], hashlib.sha256(Path(__file__).read_bytes()).hexdigest())
        self.assertEqual(self.record_file().stat().st_mode & 0o777, 0o600)
        before = self.record_file().read_bytes()
        self.instance._run_merged_draft(token)
        self.assertEqual(self.record_file().read_bytes(), before)

    def test_failed_draft_does_not_become_success(self):
        self.instance.load_model(None)
        self.instance.fail_draft = True
        with self.assertRaisesRegex(RuntimeError, "original draft failure"):
            self.instance._run_merged_draft(None)
        self.assertFalse(self.collect()["draftExecutionObserved"])

    def test_failed_reload_removes_previous_success(self):
        self.instance.load_model(None)
        self.instance._run_merged_draft(None)
        self.instance.fail_load = True
        with self.assertRaisesRegex(RuntimeError, "original model failure"):
            self.instance.load_model(None)
        self.assertFalse(self.collect()["materializationVerified"])

    def test_recording_error_never_changes_algorithm_result(self):
        with patch.object(witness, "publish", side_effect=OSError("private details")), patch("sys.stderr"):
            self.assertEqual(self.instance.load_model("model"), "model")
            self.assertEqual(self.instance._run_merged_draft("tokens"), "tokens")
        self.assertFalse(self.collect()["materializationVerified"])

    def test_wrong_policy_model_tokens_or_topology_produces_no_evidence(self):
        spec = self.instance.vllm_config.speculative_config
        for field, value in [("draft_context_policy", "full"), ("model", "wrong"), ("num_speculative_tokens", 4)]:
            old = getattr(spec, field)
            with self.subTest(field=field), patch("sys.stderr"):
                setattr(spec, field, value)
                self.instance.load_model(None)
                self.assertFalse(self.collect()["materializationVerified"])
            setattr(spec, field, old)
        with patch.object(witness, "rank_identity", return_value={"rank": 0, "worldSize": 2}), patch("sys.stderr"):
            self.instance.load_model(None)
        self.assertFalse(self.collect()["materializationVerified"])

    def test_stale_pid_start_boot_context_and_artifact_are_rejected(self):
        self.instance.load_model(None)
        file = self.record_file()
        original = file.read_text()
        for section, key, value in [("process", "startTicks", 0), ("process", "bootId", "wrong"), ("context", "configurationHash", "d" * 64), ("artifact", "wheelSha256", "d" * 64)]:
            record = json.loads(original); record[section][key] = value
            file.write_text(json.dumps(record))
            self.assertFalse(self.collect()["materializationVerified"])
        file.write_text(original)
        with patch.object(witness, "process_identity", side_effect=FileNotFoundError):
            self.assertFalse(self.collect()["materializationVerified"])

    def test_partial_worker_set_is_not_materialized(self):
        self.context["workerCount"] = 2
        with patch.object(witness, "rank_identity", return_value={"rank": 0, "worldSize": 2}):
            self.instance.load_model(None)
        self.assertFalse(self.collect()["materializationVerified"])
        self.assertEqual(len(self.collect()["workers"]), 1)

    def test_evidence_symlink_and_public_permissions_rejected(self):
        self.instance.load_model(None)
        file = self.record_file(); original = file.read_bytes()
        file.chmod(0o644)
        self.assertFalse(self.collect()["materializationVerified"])
        other = self.root / "other"; other.write_bytes(original)
        file.unlink(); file.symlink_to(other)
        self.assertFalse(self.collect()["materializationVerified"])

    def test_idempotent_instrumentation_refuses_rebinding(self):
        method = self.proposer.load_model
        witness.instrument(self.proposer, self.context, self.artifact)
        self.assertIs(self.proposer.load_model, method)
        with self.assertRaisesRegex(ValueError, "another deployment"):
            witness.instrument(self.proposer, {**self.context, "deploymentId": str(uuid.uuid4())}, self.artifact)

    def test_default_off_entrypoint_does_not_inspect_artifacts_or_import_engine(self):
        before = set(sys.modules)
        with patch.dict(os.environ, {}, clear=True):
            witness.register()
        witness.installed_identity.assert_not_called()
        self.assertFalse(set(sys.modules) - before)

    def test_invalid_context_and_missing_allowlists_rejected(self):
        for value in [{}, {**self.context, "workerCount": True}, {**self.context, "deploymentId": "../../tmp"}, {**self.context, "configurationHash": "latest"}]:
            with self.assertRaises(ValueError):
                witness.validate_context(value)
        with patch.dict(os.environ, {witness.CONTEXT_ENV: json.dumps(self.context)}, clear=True):
            with self.assertRaisesRegex(ValueError, "explicitly enabled"):
                witness.register()
        witness.installed_identity.assert_not_called()

    def test_explicit_entrypoint_observes_but_never_registers_canonical_mod(self):
        lazy = ModuleType("diffspec.lazy_patch")
        lazy.patch_after_import = Mock()
        plugin = ModuleType("diffspec.plugin")
        plugin.register = Mock()
        environment = {witness.CONTEXT_ENV: json.dumps(self.context), "VLLMHUST_EXT_ENABLED_BUNDLES": witness.BUNDLE,
                       "VLLM_PLUGINS": "ascend,diffspec,workstation_mod_runtime"}
        with patch.dict(os.environ, environment, clear=True), patch.object(witness, "_REGISTERED", False), patch.dict(sys.modules, {"diffspec.lazy_patch": lazy, "diffspec.plugin": plugin}):
            witness.register()
            witness.register()
            plugin.register.assert_not_called()
            lazy.patch_after_import.assert_called_once()
            name, callback = lazy.patch_after_import.call_args.args
            self.assertEqual(name, "diffspec.proposer")
            callback()
        self.assertFalse(self.collect()["materializationVerified"])

    def test_observer_cannot_bypass_canonical_host_allowlist(self):
        for plugins in ("ascend,workstation_mod_runtime", "ascend,diffspec", ""):
            environment = {witness.CONTEXT_ENV: json.dumps(self.context),
                           "VLLMHUST_EXT_ENABLED_BUNDLES": witness.BUNDLE,
                           "VLLM_PLUGINS": plugins}
            with self.subTest(plugins=plugins), patch.dict(os.environ, environment, clear=True):
                with self.assertRaisesRegex(ValueError, "canonical Mod"):
                    witness.register()
        witness.installed_identity.assert_not_called()

    def test_tampered_artifact_cannot_register_hooks(self):
        environment = {witness.CONTEXT_ENV: json.dumps(self.context), "VLLMHUST_EXT_ENABLED_BUNDLES": witness.BUNDLE,
                       "VLLM_PLUGINS": "ascend,diffspec,workstation_mod_runtime"}
        with patch.dict(os.environ, environment, clear=True), patch.object(witness, "_REGISTERED", False), patch.object(witness, "installed_identity", side_effect=ValueError("artifact mismatch")):
            with self.assertRaisesRegex(ValueError, "artifact mismatch"):
                witness.register()

    def test_wrong_component_extra_fields_future_and_non_boolean_results_rejected(self):
        self.instance.load_model(None)
        file = self.record_file(); original = file.read_text()
        for field, value in [("componentFileSha256", "d" * 64), ("privateEnv", "must not leak"), ("recordedAt", float("nan")), ("recordedAt", 999999999999), ("draftExecutionObserved", "true"), ("worldSize", True)]:
            record = json.loads(original); record[field] = value
            file.write_text(json.dumps(record))
            result = self.collect()
            self.assertFalse(result["materializationVerified"])
            self.assertEqual(result["workers"], [])
            self.assertNotIn("must not leak", json.dumps(result))

    def test_process_exit_during_collection_invalidates_the_snapshot(self):
        self.instance.load_model(None)
        process = witness.process_identity(os.getpid())
        with patch.object(witness, "process_identity", side_effect=[process, FileNotFoundError()]):
            self.assertFalse(self.collect()["materializationVerified"])

    def test_observer_wheel_is_deterministic_pinned_and_namespace_owned(self):
        other = self.root / "second"; other.mkdir()
        first = builder.build(self.root, self.artifact)
        second = builder.build(other, self.artifact)
        self.assertEqual(first, second)
        with zipfile.ZipFile(self.root / first["filename"]) as wheel:
            self.assertEqual(json.loads(wheel.read("workstation_mod_runtime/identity.json")), self.artifact)
            self.assertTrue(all(name.startswith(("workstation_mod_runtime/", f"workstation_mod_runtime-{builder.VERSION}.dist-info/")) for name in wheel.namelist()))
            metadata = wheel.read(f"workstation_mod_runtime-{builder.VERSION}.dist-info/METADATA")
            self.assertIn(f"Version: {builder.VERSION}\n".encode(), metadata)
            self.assertIn(b"workstation_mod_runtime:register", wheel.read(f"workstation_mod_runtime-{builder.VERSION}.dist-info/entry_points.txt"))
        with self.assertRaises(FileExistsError):
            builder.build(self.root, self.artifact)
        with self.assertRaisesRegex(ValueError, "no reviewed"):
            builder.build(other, {**self.artifact, "modId": "bidkv"})


if __name__ == "__main__":
    unittest.main()
