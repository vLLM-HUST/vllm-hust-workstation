import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch

SPEC = importlib.util.spec_from_file_location("mod_worker", Path(__file__).parents[1] / "mod_worker.py")
worker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(worker)


class ModWorkerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="mod-worker-test-")
        self.root = Path(self.temp.name)
        self.target = self.root / "bidkv"
        self.target.mkdir()
        self.spec = {"mod": {"id": "bidkv", "sha": "a" * 40, "repository": "https://github.com/vLLM-HUST/vllm-hust-bidkv", "bundle": "org.vllm-hust.bidkv"}, "managerSha": "b" * 40, "configuration": {}}
        self.receipt = {"sha": "a" * 40, "enabled": False, "configured": False}
        worker.atomic_json(self.target / "receipt.json", self.receipt)

    def tearDown(self):
        self.temp.cleanup()

    def execute(self, action):
        worker.execute(self.root, {"action": action, "id": "test-task"}, self.spec, lambda _: None)

    def test_install_refuses_overwrite(self):
        with self.assertRaisesRegex(ValueError, "禁止覆盖"):
            self.execute("install")

    def test_unreviewed_source_and_id_rejected(self):
        self.spec["mod"]["repository"] = "https://evil.example/repo"
        with self.assertRaisesRegex(ValueError, "来源"):
            self.execute("install")
        self.spec["mod"]["id"] = "../../etc"
        with self.assertRaisesRegex(ValueError, "未审核"):
            self.execute("install")

    def test_unpinned_source_rejected(self):
        self.spec["mod"]["sha"] = "main"
        with self.assertRaisesRegex(ValueError, "SHA"):
            self.execute("install")

    def test_run_never_starts_a_process(self):
        with patch.object(worker.subprocess, "Popen") as spawn:
            with self.assertRaisesRegex(ValueError, "不提供运行"):
                self.execute("run")
            spawn.assert_not_called()

    def test_forged_health_or_compatibility_rejected(self):
        self.spec["configuration"] = {"host_version": "0.23", "healthy": True}
        with self.assertRaisesRegex(ValueError, "伪造"):
            self.execute("configure")

    def test_configuration_failure_restores_prior_intent(self):
        prior = {"schema_version": 2, "extensions": {"old": {"enabled": True, "configuration": {}}}}
        worker.atomic_json(self.target / "manager.json", prior)
        process = MagicMock()
        process.__enter__.return_value = process
        process.communicate.return_value = (b"", b"fixture failure")
        process.returncode = 1
        with patch.object(worker.subprocess, "Popen", return_value=process):
            with self.assertRaisesRegex(ValueError, "fixture failure"):
                self.execute("configure")
        self.assertEqual(json.loads((self.target / "manager.json").read_text()), prior)
        self.assertEqual(json.loads((self.target / "receipt.json").read_text()), self.receipt)

    def test_enabled_uninstall_is_refused(self):
        worker.atomic_json(self.target / "receipt.json", {**self.receipt, "enabled": True})
        with self.assertRaisesRegex(ValueError, "先停用"):
            self.execute("uninstall")
        self.assertTrue(self.target.exists())

    def test_uninstall_is_recoverable_and_preserves_unrelated_files(self):
        unrelated = self.root / "user-data"
        unrelated.write_text("preserve")
        self.execute("uninstall")
        self.assertFalse(self.target.exists())
        self.assertTrue((self.root / "archive/bidkv-test-task/receipt.json").is_file())
        self.assertEqual(unrelated.read_text(), "preserve")

    def test_symlink_target_refused(self):
        (self.root / "linked").symlink_to(self.target, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "路径"):
            worker.safe_child(self.root, "linked")


if __name__ == "__main__":
    unittest.main()
