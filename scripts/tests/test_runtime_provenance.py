"""Collector integration tests with fake Docker; never contact a real container."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
CORE = "a" * 40
PLUGIN = "b" * 40
IMAGE = "sha256:" + "c" * 64
CONTAINER = "d" * 64

MOCK_DOCKER = '''#!/usr/bin/env python3
import json, os, pathlib, sys, time
args = sys.argv[1:]
root = pathlib.Path(os.environ["FAKE_ROOT"])
mode = os.environ.get("FAKE_MODE", "success")
with (root / "calls").open("a") as f:
    f.write(json.dumps(args) + "\\n")
if args[:2] == ["inspect", "-f"]:
    if args[2] == "{{.Image}}":
        print("sha256:" + "c" * 64)
    else:
        print(("e" if mode == "replaced" and (root / "executed").exists() else "d") * 64)
elif args[0] == "inspect":
    print((root / "container.json").read_text())
elif args[:2] == ["image", "inspect"]:
    print((root / "image.json").read_text())
elif args[0] == "exec":
    sys.stdin.read()
    (root / "executed").touch()
    if mode == "artifact-failure":
        sys.exit(42)
    if mode == "slow":
        time.sleep(0.25)
    print((root / "artifacts.json").read_text())
else:
    sys.exit("Unexpected Docker command: " + repr(args))
'''


class ReceiptRefreshTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="workstation-receipt-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        binary = self.root / "bin"
        binary.mkdir()
        for name, content in {
            "docker": MOCK_DOCKER,
            # A test must never fall back to host sudo or write to the host journal.
            "sudo": "#!/bin/sh\nexit 99\n",
            "logger": "#!/bin/sh\nexit 0\n",
        }.items():
            path = binary / name
            path.write_text(content)
            path.chmod(0o755)
        self.receipt = self.root / "receipt.json"
        self.status = self.root / "receipt.refresh-status.json"
        self.env = {
            **os.environ,
            "PATH": str(binary) + os.pathsep + os.environ["PATH"],
            "FAKE_ROOT": str(self.root),
            "WORKSTATION_PROVENANCE_ENV_FILE": str(self.root / "absent.env"),
            "WORKSTATION_RUNTIME_CONTAINER": "fixture-runtime",
            "WORKSTATION_RUNTIME_PROVENANCE_FILE": str(self.receipt),
        }
        labels = {
            "ai.vllm-hust.runtime-lock.schema": "vllm-hust.production-runtime-lock/v2",
            "ai.vllm-hust.source-mode": "immutable-wheels",
            "ai.vllm-hust.compatibility.base": "fixture compatibility base",
            "ai.vllm-hust.compatibility.stable-release": "v0.23.0",
            "ai.vllm-hust.compatibility.source-profile": "fixture-snapshot",
            "org.opencontainers.image.created": "2026-09-01T00:00:00Z",
        }
        artifacts = {}
        for key, component, repository, commit in [
            ("core", "vllm-core", "vllm-hust", CORE),
            ("plugin", "vllm-ascend", "vllm-ascend-hust", PLUGIN),
        ]:
            for field, value in {
                "repository": "https://github.com/vLLM-HUST/" + repository,
                "commit": commit,
                "package-version": "1.0.0",
                "source-version": "1.0.0",
            }.items():
                labels[f"ai.vllm-hust.{component}.{field}"] = value
            artifacts[key] = {
                "version": "1.0.0", "commit": commit,
                "moduleOrigin": "/site-packages/fixture/__init__.py",
                "wheelSha256": "f" * 64,
            }
        self.write("container.json", [{
            "Id": CONTAINER, "Name": "/fixture-runtime", "Image": IMAGE,
            "Config": {"Image": "fixture:locked"},
            "State": {"Status": "running", "StartedAt": "2026-09-01T00:00:00Z"},
        }])
        self.write("image.json", [{
            "Id": IMAGE, "Created": "2026-09-01T00:00:00Z",
            "Config": {"Labels": labels}, "RepoDigests": ["fixture@" + IMAGE],
        }])
        self.write("artifacts.json", artifacts)

    def write(self, name, value):
        (self.root / name).write_text(json.dumps(value))

    def run_refresh(self, mode="success"):
        return subprocess.run(
            ["bash", str(ROOT / "scripts/refresh_runtime_provenance.sh")],
            env={**self.env, "FAKE_MODE": mode}, capture_output=True, text=True, timeout=15,
        )

    def test_success_records_verified_receipt_and_status(self):
        result = self.run_refresh()
        self.assertEqual(result.returncode, 0, result.stderr)
        receipt = json.loads(self.receipt.read_text())
        self.assertEqual(receipt["container"]["id"], CONTAINER)
        self.assertEqual(receipt["image"]["digest"], IMAGE)
        self.assertEqual(receipt["components"]["core"]["commit"], CORE)
        status = json.loads(self.status.read_text())
        self.assertEqual(status["result"], "success")
        self.assertEqual(status["attemptedAt"], status["lastSuccessAt"])
        self.assertEqual(self.receipt.stat().st_mode & 0o777, 0o644)
        calls = [json.loads(line) for line in (self.root / "calls").read_text().splitlines()]
        self.assertTrue(all(call[0] in ("inspect", "image", "exec") for call in calls))

    def test_artifact_failure_preserves_receipt_and_last_success(self):
        self.assertEqual(self.run_refresh().returncode, 0)
        receipt = self.receipt.read_bytes()
        success = json.loads(self.status.read_text())["lastSuccessAt"]
        result = self.run_refresh("artifact-failure")
        self.assertEqual(result.returncode, 42)
        self.assertEqual(self.receipt.read_bytes(), receipt)
        status = json.loads(self.status.read_text())
        self.assertEqual(status["result"], "failure")
        self.assertEqual(status["exitCode"], 42)
        self.assertEqual(status["lastSuccessAt"], success)

    def test_changed_container_is_rejected(self):
        self.assertNotEqual(self.run_refresh("replaced").returncode, 0)
        self.assertFalse(self.receipt.exists())

    def test_stopped_container_is_rejected(self):
        container = json.loads((self.root / "container.json").read_text())
        container[0]["State"]["Status"] = "exited"
        self.write("container.json", container)
        self.assertNotEqual(self.run_refresh().returncode, 0)
        self.assertFalse(self.receipt.exists())

    def test_mismatched_lock_commit_is_rejected(self):
        artifacts = json.loads((self.root / "artifacts.json").read_text())
        artifacts["core"]["commit"] = "e" * 40
        self.write("artifacts.json", artifacts)
        self.assertNotEqual(self.run_refresh().returncode, 0)
        self.assertFalse(self.receipt.exists())

    def test_timeout_records_failure_without_replacing_receipt(self):
        self.receipt.write_text("previous receipt")
        timeout = self.root / "bin/timeout"
        timeout.write_text("#!/bin/sh\nexit 124\n")
        timeout.chmod(0o755)
        self.assertEqual(self.run_refresh().returncode, 124)
        self.assertEqual(self.receipt.read_text(), "previous receipt")
        status = json.loads(self.status.read_text())
        self.assertEqual(status["exitCode"], 124)
        self.assertIsNone(status["lastSuccessAt"])

    def test_invalid_name_never_reaches_docker(self):
        self.env["WORKSTATION_RUNTIME_CONTAINER"] = "--all"
        self.assertNotEqual(self.run_refresh().returncode, 0)
        self.assertFalse((self.root / "calls").exists())

    def test_parallel_collectors_serialize_atomic_replacement(self):
        command = ["bash", str(ROOT / "scripts/capture_runtime_provenance.sh")]
        env = {**self.env, "FAKE_MODE": "slow"}
        with subprocess.Popen(command, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE) as first:
            with subprocess.Popen(command, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE) as second:
                first.communicate(timeout=15)
                second.communicate(timeout=15)
                self.assertEqual(first.returncode, 0)
                self.assertEqual(second.returncode, 0)
        self.assertEqual(json.loads(self.receipt.read_text())["container"]["id"], CONTAINER)
        self.assertFalse(self.receipt.with_suffix(".json.tmp").exists())


if __name__ == "__main__":
    unittest.main()
