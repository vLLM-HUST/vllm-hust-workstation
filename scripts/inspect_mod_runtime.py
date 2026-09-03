#!/usr/bin/env python3
"""Read-only, identity-bound Mod adaptation inventory. Never imports the engine.

Missing static symbols identify porting work; present symbols do NOT prove runtime
compatibility. No package installation, device access or service mutation occurs.
"""
import argparse
import datetime
import json
from pathlib import Path
import re
import subprocess


COLLECTOR = r'''
import ast
import hashlib
import importlib.metadata as metadata
import json
from pathlib import Path

packages = {}
roots = {}
for key, name, module in [("core", "vllm", "vllm"), ("ascend", "vllm-ascend", "vllm_ascend")]:
    dist = metadata.distribution(name)
    roots[key] = Path(dist.locate_file(module))
    direct = json.loads(dist.read_text("direct_url.json") or "{}")
    packages[key] = {"version": dist.version, "wheelSha256": direct.get("archive_info", {}).get("hashes", {}).get("sha256")}

# Exact symbols used by the reviewed adapters; this is an inventory, not a
# replacement for signature, behavior, graph, model and rollback acceptance.
surfaces = {
    "bidkv.scheduler_contract": ("core", "plugins/contracts.py", "DomainContract"),
    "diffspec.speculative_config": ("core", "config/speculative.py", "SpeculativeConfig"),
    "diffspec.engine_args": ("core", "engine/arg_utils.py", "EngineArgs.create_speculative_config"),
    "diffspec.eagle3_decoder": ("core", "model_executor/models/llama_eagle3.py", "LlamaDecoderLayer"),
    "diffspec.ascend_runner": ("ascend", "worker/model_runner_v1.py", "NPUModelRunner"),
    "diffspec.forward_proxy": ("ascend", "ascend_forward_context.py", "_ExtraForwardContextProxy"),
    "diffspec.spec_decode_factory": ("ascend", "spec_decode/__init__.py", "get_spec_decode_method"),
    "diffspec.attention": ("ascend", "attention/attention_v1.py", "AscendAttentionBackendImpl.forward_fused_infer_attention"),
}
inventory = {}
for name, (key, relative, symbol) in surfaces.items():
    source = roots[key] / relative
    entry = {"package": key, "file": relative, "symbol": symbol, "present": False}
    if source.is_file():
        raw = source.read_bytes()
        entry["sha256"] = hashlib.sha256(raw).hexdigest()
        try:
            nodes = ast.parse(raw).body
            for part in symbol.split("."):
                node = next((n for n in nodes if isinstance(n, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == part), None)
                if node is None:
                    break
                nodes = node.body
            else:
                entry["present"] = True
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    entry["signature"] = {
                        "positional": [a.arg for a in [*node.args.posonlyargs, *node.args.args]],
                        "keywordOnly": [a.arg for a in node.args.kwonlyargs],
                        "varargs": node.args.vararg.arg if node.args.vararg else None,
                        "kwargs": node.args.kwarg.arg if node.args.kwarg else None,
                    }
        except (SyntaxError, ValueError):
            entry["parseError"] = True
    inventory[name] = entry

lock_path = Path("/opt/vllm-hust-runtime/production-lock.json")
lock_status = "unavailable"
if lock_path.is_file():
    try:
        lock = json.loads(lock_path.read_text())
        lock_status = "matched"
        for key, lock_key in [("core", "vllm_core"), ("ascend", "vllm_ascend")]:
            pin = lock[lock_key]
            packages[key]["commit"] = pin["commit"]
            if packages[key]["version"] != pin["package_version"] or packages[key]["wheelSha256"] != pin["artifact"]["sha256"]:
                lock_status = "mismatch"
    except (KeyError, TypeError, ValueError):
        lock_status = "invalid"
print(json.dumps({"packages": packages, "lockStatus": lock_status, "surfaces": inventory}))
'''


def invoke(argv, *, input_text=None):
    result = subprocess.run(argv, input=input_text, text=True, capture_output=True, timeout=25, check=True)
    if len(result.stdout) > 2_000_000:
        raise ValueError("inspection output exceeds limit")
    return result.stdout


def identity(container):
    return (container["Id"], container["Image"], container["State"]["StartedAt"], container["State"]["Running"])


def inspect(name, command, run=invoke, *, python_bin="python3"):
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}", name):
        raise ValueError("invalid container name")
    if python_bin != "python3" and (not re.fullmatch(r"/[A-Za-z0-9_./-]+/python[0-9.]*", python_bin) or "/../" in python_bin):
        raise ValueError("invalid serving interpreter")
    before = json.loads(run([*command, "inspect", "--type", "container", name]))[0]
    if not before["State"]["Running"]:
        raise ValueError("target container is not running")
    # Always collect through the immutable ID, not a name that can be reassigned.
    data = json.loads(run([*command, "exec", "-i", before["Id"], python_bin, "-"], input_text=COLLECTOR))
    after = json.loads(run([*command, "inspect", "--type", "container", name]))[0]
    if identity(before) != identity(after):
        raise ValueError("target changed during inspection; discard this inventory")
    if data.get("lockStatus") != "matched":
        admissible = False
    else:
        admissible = True
    return {
        "schema": "workstation.mod-runtime-inventory/v1",
        "capturedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "evidenceLevel": "static-container-inspection",
        "container": {"name": name, "id": before["Id"], "imageId": before["Image"], "startedAt": before["State"]["StartedAt"]},
        "artifactIdentityVerified": admissible,
        "runtimeActivationVerified": False,
        "packages": data["packages"],
        "lockStatus": data["lockStatus"],
        "surfaces": data["surfaces"],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("container")
    parser.add_argument("--sudo", action="store_true", help="Use non-interactive sudo for Docker read access")
    parser.add_argument("--output", type=Path, help="Create a new evidence file; never overwrite existing evidence")
    args = parser.parse_args()
    try:
        rendered = json.dumps(inspect(args.container, ["sudo", "-n", "docker"] if args.sudo else ["docker"]), indent=2)
        if args.output:
            with args.output.open("x", encoding="utf-8") as stream:
                stream.write(rendered + "\n")
        else:
            print(rendered)
    except (ValueError, KeyError, TypeError, subprocess.SubprocessError):
        # Never emit Docker inspect contents, container env or subprocess stderr.
        parser.exit(1, "Runtime inspection failed or target identity changed; no state was modified.\n")


if __name__ == "__main__":
    main()
