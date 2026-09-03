"""Thin JSON client for the fixed dev-hub producer, with zero default-off effects.

No locks, approvals, registration or deployment state live in Workstation.
The producer's source lock is build provenance, not host authorization.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
PROTOCOL = "vllm-hust.instance-control/v1"
LOCK = "deploy/instance-control-source-lock.json"
ENTRY = "scripts/instance_control_entry.py"


class InstanceClientError(ValueError):
    pass


def producer(root=ROOT):
    """Verify packaged producer bytes even in a standalone build without .git."""
    module = root / "deps/vllm-hust-dev-hub"
    lock_file = root / LOCK
    if not lock_file.is_file() or lock_file.resolve() != lock_file:
        raise InstanceClientError("producer_lock_missing")
    lock = json.loads(lock_file.read_text())
    if lock.get("protocol") != PROTOCOL or lock.get("entrypoint") != ENTRY:
        raise InstanceClientError("producer_protocol_mismatch")
    if not module.is_dir() or module.resolve() != module:
        raise InstanceClientError("producer_not_installed")
    for relative, expected in lock["files"].items():
        if relative.startswith("/") or ".." in relative.split("/"):
            raise InstanceClientError("invalid_producer_lock")
        file = module / relative
        if not file.is_file() or file.resolve() != file or hashlib.sha256(file.read_bytes()).hexdigest() != expected:
            raise InstanceClientError("producer_source_mismatch")
    if ENTRY not in lock["files"]:
        raise InstanceClientError("invalid_producer_lock")
    return module / ENTRY


def call(action, parameters, *, enabled=False, root=ROOT, execute=subprocess.run):
    if enabled is not True:
        if action == "inspect":
            return {"protocol": PROTOCOL, "authorityAvailable": False, "reason": "disabled"}
        raise InstanceClientError("instance_control_disabled")
    if not isinstance(parameters, dict) or set(parameters) & {"schema", "action"}:
        raise InstanceClientError("invalid_request")
    request = json.dumps({"schema": PROTOCOL, "action": action, **parameters}, allow_nan=False)
    if len(request.encode()) > 4096:
        raise InstanceClientError("request_too_large")
    entry = producer(root)
    result = execute([sys.executable, "-I", str(entry)], input=request, text=True,
                     capture_output=True, timeout=10, cwd=str(entry.parent),
                     env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"})
    # Never echo the child's stderr or opaque approval token to logs/UI.
    if result.returncode:
        raise InstanceClientError("instance_authority_unavailable")
    if len(result.stdout) > 16384:
        raise InstanceClientError("invalid_producer_response")
    value = json.loads(result.stdout)
    if not isinstance(value, dict) or value.get("protocol") != PROTOCOL:
        raise InstanceClientError("invalid_producer_response")
    return value


def main():
    # Diagnostic only: no mutation CLI or environment-derived host authority.
    instance = sys.argv[1] if len(sys.argv) == 2 else "workstation-current"
    print(json.dumps(call("inspect", {"instance_id": instance},
                          enabled=os.environ.get("WORKSTATION_INSTANCE_CONTROL_ENABLED") == "1")))


if __name__ == "__main__":
    main()
