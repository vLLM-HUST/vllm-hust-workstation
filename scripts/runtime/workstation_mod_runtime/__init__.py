"""Opt-in worker witness for reviewed Mods; no device imports during collection.

The witness observes successful Mod methods, not Python package installation.
It is process-owned evidence, not cryptographic proof against a malicious runtime.
An owner adapter must still bind the container/image and verify bounded inference.
"""
import functools
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
import time
import uuid

CONTEXT_ENV = "WORKSTATION_MOD_CONTEXT"
BUNDLE = "org.vllm-hust.diffspec"
EVIDENCE_ROOT = Path("/tmp/workstation-mod-evidence")
_REGISTERED = False


def validate_context(value):
    keys = {"deploymentId", "targetId", "configurationHash", "workerCount", "targetModel", "draftModel", "speculativeTokens"}
    if not isinstance(value, dict) or set(value) != keys:
        raise ValueError("invalid worker witness context")
    identifier = value["deploymentId"]
    if not isinstance(identifier, str) or str(uuid.UUID(identifier)) != identifier:
        raise ValueError("invalid deployment identity")
    for key, pattern in (("targetId", r"[a-z][a-z0-9-]{0,63}"), ("configurationHash", r"[a-f0-9]{64}")):
        if not isinstance(value[key], str) or not re.fullmatch(pattern, value[key]):
            raise ValueError("invalid target or configuration identity")
    for key in ("workerCount", "speculativeTokens"):
        if type(value[key]) is not int or not 1 <= value[key] <= 64:
            raise ValueError("invalid worker or speculative token count")
    for key in ("targetModel", "draftModel"):
        if not isinstance(value[key], str) or not 1 <= len(value[key]) <= 1024 or any(ord(c) < 32 for c in value[key]):
            raise ValueError("invalid model identity")
    return value


def installed_identity():
    identity = json.loads(Path(__file__).with_name("identity.json").read_text())
    if set(identity) != {"modId", "sourceSha", "wheelSha256", "version", "componentFileSha256"} or identity["modId"] != "diffspec":
        raise ValueError("unsupported witness artifact identity")
    for key, length in (("sourceSha", 40), ("wheelSha256", 64), ("componentFileSha256", 64)):
        if not isinstance(identity[key], str) or not re.fullmatch(r"[a-f0-9]{%d}" % length, identity[key]):
            raise ValueError("invalid witness artifact pin")
    dist = importlib.metadata.distribution("vllm-diffspec")
    direct = json.loads(dist.read_text("direct_url.json") or "{}")
    if dist.version != identity["version"] or direct.get("archive_info", {}).get("hashes", {}).get("sha256") != identity["wheelSha256"]:
        raise ValueError("installed Mod differs from witness artifact")
    component = Path(dist.locate_file("diffspec/proposer.py"))
    if hashlib.sha256(component.read_bytes()).hexdigest() != identity["componentFileSha256"]:
        raise ValueError("installed component differs from reviewed wheel")
    return identity


def process_identity(pid):
    # comm can contain spaces and ')'; the fields follow the final closing ')'.
    fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
    if fields[0] in {"Z", "X", "x"}:
        raise ValueError("worker has exited")
    return {"pid": pid, "startTicks": int(fields[19]), "bootId": Path("/proc/sys/kernel/random/boot_id").read_text().strip()}


def private_directory(path, create=False):
    if create:
        path.mkdir(mode=0o700, exist_ok=True)
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or path.resolve() != path or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError("witness directory must be private and process-owned")


def runtime_configuration(instance):
    config = instance.vllm_config
    spec = config.speculative_config
    return {"targetModel": config.model_config.model, "draftModel": spec.model,
            "speculativeTokens": spec.num_speculative_tokens, "policy": spec.draft_context_policy}


def rank_identity():
    # Do not initialize distributed state or import Torch for diagnostics.
    distributed = sys.modules.get("torch.distributed")
    if distributed is None or not distributed.is_initialized():
        raise ValueError("worker distributed identity unavailable")
    return {"rank": distributed.get_rank(), "worldSize": distributed.get_world_size()}


def publish(instance, context, artifact, *, executed):
    config = runtime_configuration(instance)
    expected = {key: context[key] for key in ("targetModel", "draftModel", "speculativeTokens")}
    if config != {**expected, "policy": "diffspec"} or instance.diffspec_cache is None:
        raise ValueError("Mod runtime configuration differs from approved context")
    rank = rank_identity()
    if rank["worldSize"] != context["workerCount"] or not 0 <= rank["rank"] < rank["worldSize"]:
        raise ValueError("worker topology differs from approved context")
    component = sys.modules["diffspec.proposer"]
    component_hash = hashlib.sha256(Path(component.__file__).read_bytes()).hexdigest()
    if component_hash != artifact["componentFileSha256"]:
        raise ValueError("runtime component differs from reviewed wheel")
    process = process_identity(os.getpid())
    record = {"schema": "workstation.mod-worker/v1", "context": context, "artifact": artifact,
              "process": process, **rank, "configuration": config,
              "component": "diffspec.proposer.AscendDiffSpecEagleProposer",
              "componentFileSha256": component_hash, "modelLoaded": True,
              "draftExecutionObserved": executed, "recordedAt": time.time()}
    private_directory(EVIDENCE_ROOT, create=True)
    directory = EVIDENCE_ROOT / context["deploymentId"]
    private_directory(directory, create=True)
    fd, temporary = tempfile.mkstemp(prefix=".worker-", dir=directory)
    try:
        with os.fdopen(fd, "w") as stream:
            os.fchmod(stream.fileno(), 0o600)
            json.dump(record, stream, allow_nan=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, directory / f"{process['pid']}-{process['startTicks']}.json")
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def instrument(proposer, context, artifact):
    if proposer.__module__ != "diffspec.proposer" or proposer.__name__ != "AscendDiffSpecEagleProposer":
        raise ValueError("unexpected Mod component")
    if getattr(proposer, "_workstation_witness_context", None) is not None:
        if proposer._workstation_witness_context != context:
            raise ValueError("worker witness already bound to another deployment")
        return
    original_load = proposer.load_model
    original_draft = proposer._run_merged_draft

    def emit(instance, executed):
        try:
            publish(instance, context, artifact, executed=executed)
            instance._workstation_witness_executed = executed
        except Exception:
            # Observation failure must not alter the algorithm's return/exception.
            # No record means the deployment verifier cannot accept this worker.
            if not getattr(instance, "_workstation_witness_warned", False):
                print("Workstation Mod witness unavailable; deployment remains unverified", file=sys.stderr)
                instance._workstation_witness_warned = True

    @functools.wraps(original_load)
    def load_model(instance, *args, **kwargs):
        # A failed reload must not leave a previous success for this PID behind.
        try:
            process = process_identity(os.getpid())
            directory = EVIDENCE_ROOT / context["deploymentId"]
            private_directory(EVIDENCE_ROOT)
            private_directory(directory)
            (directory / f"{process['pid']}-{process['startTicks']}.json").unlink(missing_ok=True)
        except FileNotFoundError:
            pass
        result = original_load(instance, *args, **kwargs)
        instance._workstation_witness_executed = False
        emit(instance, False)
        return result

    @functools.wraps(original_draft)
    def run_draft(instance, *args, **kwargs):
        result = original_draft(instance, *args, **kwargs)
        if not getattr(instance, "_workstation_witness_executed", False):
            emit(instance, True)
        return result

    proposer.load_model = load_model
    proposer._run_merged_draft = run_draft
    proposer._workstation_witness_context = dict(context)


def register():
    """vLLM general-plugin entrypoint, deliberately default-off."""
    global _REGISTERED
    raw = os.getenv(CONTEXT_ENV)
    if not raw:
        return
    if len(raw) > 8192:
        raise ValueError("worker context exceeds limit")
    context = validate_context(json.loads(raw))
    enabled = {item.strip() for item in os.getenv("VLLMHUST_EXT_ENABLED_BUNDLES", "").split(",") if item.strip()}
    if enabled != {BUNDLE}:
        raise ValueError("witness requires one explicitly enabled reviewed Mod")
    plugins = os.getenv("VLLM_PLUGINS", "").split(",")
    if "workstation_mod_runtime" not in plugins:
        raise ValueError("witness requires an explicit plugin allowlist")
    if _REGISTERED:
        return
    artifact = installed_identity()
    from diffspec.lazy_patch import patch_after_import
    from diffspec.plugin import register as register_diffspec

    patch_after_import("diffspec.proposer", lambda: instrument(sys.modules["diffspec.proposer"].AscendDiffSpecEagleProposer, context, artifact))
    register_diffspec()
    _REGISTERED = True


def collect(context):
    """Read only. Must execute in the selected container's PID namespace."""
    validate_context(context)
    artifact = installed_identity()
    result = {"schema": "workstation.mod-worker-collection/v1", "context": context, "artifact": artifact,
              "collectedAt": time.time(), "workers": [], "issues": [],
              "materializationVerified": False, "draftExecutionObserved": False, "inferenceVerified": False}
    try:
        private_directory(EVIDENCE_ROOT)
        directory = EVIDENCE_ROOT / context["deploymentId"]
        private_directory(directory)
        files = list(directory.glob("*.json"))
    except FileNotFoundError:
        result["issues"].append("worker evidence missing")
        return result
    if len(files) > 64:
        raise ValueError("worker evidence count exceeds limit")
    seen = set()
    for file in files:
        try:
            info = file.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_uid != os.getuid() or info.st_size > 16384:
                raise ValueError("invalid witness file")
            record = json.loads(file.read_text())
            if set(record) != {"schema", "context", "artifact", "process", "rank", "worldSize", "configuration", "component", "componentFileSha256", "modelLoaded", "draftExecutionObserved", "recordedAt"}:
                raise ValueError("unexpected worker evidence fields")
            process = record["process"]
            pid = process["pid"]
            if type(pid) is not int or pid <= 0 or process != process_identity(pid):
                raise ValueError("stale process identity")
            if file.name != f"{pid}-{process['startTicks']}.json" or record["schema"] != "workstation.mod-worker/v1":
                raise ValueError("invalid witness identity")
            if record["context"] != context or record["artifact"] != artifact:
                raise ValueError("witness belongs to another deployment")
            if record["configuration"] != {**{key: context[key] for key in ("targetModel", "draftModel", "speculativeTokens")}, "policy": "diffspec"}:
                raise ValueError("runtime options differ")
            rank = record["rank"]
            if type(rank) is not int or not 0 <= rank < context["workerCount"] or rank in seen or type(record["worldSize"]) is not int or record["worldSize"] != context["workerCount"]:
                raise ValueError("worker rank incomplete or ambiguous")
            if record["modelLoaded"] is not True or type(record["draftExecutionObserved"]) is not bool:
                raise ValueError("component not materialized")
            if record["component"] != "diffspec.proposer.AscendDiffSpecEagleProposer" or record["componentFileSha256"] != artifact["componentFileSha256"]:
                raise ValueError("invalid component evidence")
            if type(record["recordedAt"]) not in (int, float) or not 0 < record["recordedAt"] <= result["collectedAt"] + 5:
                raise ValueError("invalid witness timestamp")
            seen.add(rank)
            result["workers"].append(record)
        except (KeyError, TypeError, ValueError, OSError):
            result["issues"].append("stale, invalid or mismatched worker evidence")
    complete = not result["issues"] and seen == set(range(context["workerCount"]))
    if complete:
        try:
            complete = all(worker["process"] == process_identity(worker["process"]["pid"]) for worker in result["workers"])
        except (ValueError, OSError):
            complete = False
    result["materializationVerified"] = complete
    result["draftExecutionObserved"] = complete and all(worker["draftExecutionObserved"] for worker in result["workers"])
    if not complete and not result["issues"]:
        result["issues"].append("worker set incomplete")
    return result
