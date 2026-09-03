import copy
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
import fcntl
from unittest.mock import Mock

scripts = Path(__file__).parents[1]
sys.path.insert(0, str(scripts))
try:
    spec = importlib.util.spec_from_file_location("mod_runtime_worker", scripts / "mod_runtime_worker.py")
    worker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(worker)
finally:
    sys.path.remove(str(scripts))


class RuntimePreparationWorkerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="runtime-worker-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.library = self.root / "library"; self.library.mkdir(mode=0o700)
        self.spec = {"target": {"id": "current", "containerName": "actual", "pythonBin": "/serving/bin/python"},
                     "library": str(self.library), "mod": {"id": "diffspec", "sha": "a" * 40}, "managerSha": "b" * 40}
        self.identity = {"id": "c" * 64, "imageId": "sha256:" + "d" * 64, "startedAt": "2026-09-03T00:00:00Z"}
        self.task = {"targetId": "current", "modId": "diffspec", "sourceSha": "a" * 40, "managerSha": "b" * 40, "baseImageId": self.identity["imageId"], "expectedIdentity": self.identity}
        self.snapshot = {"artifactIdentityVerified": True, "container": {"name": "actual", **self.identity}}
        self.inventory = Mock(return_value=copy.deepcopy(self.snapshot))
        self.build = Mock(return_value={"imageId": "sha256:" + "e" * 64, "receiptPath": "/private/prepared/receipt.json"})
        self.install = Mock()
        self.logs = []

    def execute(self):
        worker.execute(self.root, self.task, self.spec, self.logs.append, inventory=self.inventory, build=self.build, install=self.install)

    def test_prepares_current_target_with_exact_interpreter_and_no_serving_action(self):
        self.execute()
        self.assertEqual(self.task["status"], "prepared")
        self.install.assert_called_once()
        self.assertEqual(self.install.call_args.args[1], {"action": "install"})
        self.assertEqual(self.inventory.call_count, 2)
        self.assertEqual(self.inventory.call_args.kwargs, {"python_bin": "/serving/bin/python"})
        self.assertEqual(self.build.call_args.args[5], self.identity["imageId"])
        self.assertEqual(self.build.call_args.kwargs, {"python_bin": "/serving/bin/python"})

    def test_reuses_library_without_overwriting_existing_artifacts(self):
        (self.library / "diffspec").mkdir()
        self.execute()
        self.install.assert_not_called()

    def test_changed_target_or_unverified_artifacts_fail_before_install_build(self):
        for change in [{"artifactIdentityVerified": False}, {"container": {**self.snapshot["container"], "id": "f" * 64}}]:
            self.inventory.return_value = {**self.snapshot, **change}
            with self.assertRaises(ValueError):
                self.execute()
        self.install.assert_not_called(); self.build.assert_not_called()

    def test_target_change_after_build_retains_candidate_but_marks_superseded(self):
        self.inventory.side_effect = [self.snapshot, {**self.snapshot, "container": {**self.snapshot["container"], "imageId": "sha256:" + "f" * 64}}]
        self.execute()
        self.assertEqual(self.task["status"], "superseded")
        self.assertEqual(self.task["imageId"], "sha256:" + "e" * 64)

    def test_post_build_inspection_failure_does_not_claim_current_preparation(self):
        self.inventory.side_effect = [self.snapshot, TimeoutError()]
        self.execute()
        self.assertEqual(self.task["status"], "superseded")

    def test_shares_library_lock_with_install_uninstall_worker(self):
        with (self.library / ".worker.lock").open("w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):
                self.execute()
        self.build.assert_not_called(); self.install.assert_not_called()

    def test_pin_mismatch_and_symlink_library_are_refused(self):
        self.task["sourceSha"] = "f" * 40
        with self.assertRaises(ValueError):
            self.execute()
        self.task["sourceSha"] = "a" * 40
        link = self.root / "link"; link.symlink_to(self.library)
        self.spec["library"] = str(link)
        with self.assertRaises(ValueError):
            self.execute()
        self.inventory.assert_not_called()

    def test_no_runtime_commands_in_worker_source(self):
        source = (scripts / "mod_runtime_worker.py").read_text()
        self.assertNotIn("systemctl", source)
        self.assertNotIn('"restart"', source)
        self.assertNotIn('"stop"', source)
        self.assertNotIn("DeploymentController", source)


if __name__ == "__main__":
    unittest.main()
