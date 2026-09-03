"""Real producer protocol smoke; lifecycle remains unavailable, no hardware calls."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("instance_client", ROOT / "scripts/instance_control_client.py")
client = importlib.util.module_from_spec(spec)
spec.loader.exec_module(client)


class ClientTests(unittest.TestCase):
    def test_disabled_has_no_process_or_filesystem_dependency(self):
        run = Mock()
        result = client.call("inspect", {}, root=Path("/missing"), execute=run)
        self.assertFalse(result["authorityAvailable"])
        with self.assertRaisesRegex(client.InstanceClientError, "disabled"):
            client.call("apply", {}, execute=run)
        run.assert_not_called()

    def test_pinned_producer_reports_closed_gate(self):
        result = client.call("inspect", {"instance_id": "fixture"}, enabled=True)
        self.assertFalse(result["authorityAvailable"])
        self.assertFalse(result["productionBackendQualified"])
        self.assertEqual(result["instanceId"], "fixture")

    def test_source_lock_matches_parent_gitlink(self):
        lock = json.loads((ROOT / client.LOCK).read_text())
        staged = subprocess.run(["git", "ls-files", "--stage", "--", "deps/vllm-hust-dev-hub"],
                                cwd=ROOT, check=True, text=True, capture_output=True).stdout.split()
        self.assertEqual(staged[0], "160000")
        self.assertEqual(staged[1], lock["sourceSha"])
        self.assertEqual(client.producer(), ROOT / "deps/vllm-hust-dev-hub" / client.ENTRY)

    def test_caller_owner_or_command_never_grants_authority(self):
        for action, parameters in [("approve", {"plan_id": "a" * 64, "owner_id": "root"}),
                                   ("apply", {"plan_id": "a" * 64, "approval": "SECRET_CANARY" * 3}),
                                   ("plan", {"instance_id": "fixture", "argv": ["sh"]})]:
            with self.assertRaisesRegex(client.InstanceClientError, "authority_unavailable") as error:
                client.call(action, parameters, enabled=True)
            self.assertNotIn("SECRET_CANARY", str(error.exception))

    def test_tampered_or_redirected_producer_is_not_executed(self):
        with tempfile.TemporaryDirectory(prefix="instance-client-") as tmp:
            root = Path(tmp)
            entry = root / "deps/vllm-hust-dev-hub" / client.ENTRY
            entry.parent.mkdir(parents=True)
            entry.write_text("raise SystemExit(0)\n")
            lock = root / client.LOCK
            lock.parent.mkdir()
            lock.write_text(json.dumps({"protocol": client.PROTOCOL, "entrypoint": client.ENTRY,
                "files": {client.ENTRY: hashlib.sha256(b"different").hexdigest()}}))
            run = Mock()
            with self.assertRaisesRegex(client.InstanceClientError, "source_mismatch"):
                client.call("inspect", {"instance_id": "fixture"}, enabled=True, root=root, execute=run)
            run.assert_not_called()

    def test_coordinator_exists_only_in_dev_hub(self):
        self.assertFalse((ROOT / "scripts/mod_deployment.py").exists())
        source = (ROOT / "scripts/instance_control_client.py").read_text()
        for forbidden in ("import sqlite3", "flock(", "def approve(", "def recover("):
            self.assertNotIn(forbidden, source)


if __name__ == "__main__":
    unittest.main()
