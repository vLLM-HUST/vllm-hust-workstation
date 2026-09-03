"""Durable, target-scoped Mod deployment transactions.

Adapters are supplied by trusted server code, never selected by a browser command.
The adapter must implement actual target ownership, materialization and inference
verification. This coordinator does not turn package metadata into runtime proof.
"""
from contextlib import contextmanager
import copy
import datetime
import fcntl
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import tempfile
import time
import uuid


class DeploymentError(ValueError):
    pass


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def timestamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def atomic_write(path, value):
    fd, temporary = tempfile.mkstemp(prefix=".deployment-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as stream:
            os.fchmod(stream.fileno(), 0o600)
            json.dump(value, stream, ensure_ascii=False, allow_nan=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        parent = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def validate_revision(revision):
    if not isinstance(revision, dict) or set(revision) != {"imageId", "configurationHash", "mods"}:
        raise DeploymentError("invalid immutable revision")
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", revision["imageId"]):
        raise DeploymentError("image must be immutable")
    if not re.fullmatch(r"[a-f0-9]{64}", revision["configurationHash"]):
        raise DeploymentError("configuration must be frozen")
    mods = revision["mods"]
    if not isinstance(mods, list) or len(mods) > 1:
        raise DeploymentError("this adapter supports at most one Mod per revision")
    for mod in mods:
        if not isinstance(mod, dict) or set(mod) != {"id", "sourceSha", "wheelSha256"}:
            raise DeploymentError("invalid Mod identity")
        if mod["id"] not in {"bidkv", "diffspec", "latchmoe"}:
            raise DeploymentError("unreviewed Mod")
        if not re.fullmatch(r"[a-f0-9]{40}", mod["sourceSha"]) or not re.fullmatch(r"[a-f0-9]{64}", mod["wheelSha256"]):
            raise DeploymentError("Mod source and artifact must be immutable")


def validate_observation(observation):
    required = {"targetId", "identity", "revision", "healthy", "activationVerified", "inferenceVerified", "observedAt"}
    if not isinstance(observation, dict) or set(observation) != required:
        raise DeploymentError("incomplete runtime observation")
    validate_revision(observation["revision"])
    identity = observation["identity"]
    if not isinstance(identity, dict) or set(identity) != {"containerId", "startedAt", "ownerGeneration"}:
        raise DeploymentError("incomplete target identity")
    if not re.fullmatch(r"[a-f0-9]{64}", identity["containerId"]) or not identity["startedAt"] or not identity["ownerGeneration"]:
        raise DeploymentError("invalid target identity")


class DeploymentController:
    """One host-local journal and lock per enrolled target.

    Adapter contract:
      inspect() -> fresh observation; no service mutation
      preflight(candidate) -> {ready: bool, reasons: list[str]}; no mutation
      activate(candidate, deployment_id, deadline) -> None
      owns_transition(deployment_id) -> bool (fresh ownership check)
      verify(candidate, deployment_id, deadline) -> fresh observation
      restore(previous, deployment_id, deadline) -> None

    All deadlines are absolute monotonic values. Adapter methods must bound every
    subprocess and health probe by the remaining budget. A mere timeout does not
    authorize another activation. Interrupted transitions require explicit recovery.
    """

    def __init__(self, root, adapters, *, clock=time.time, monotonic=time.monotonic):
        self.root = Path(root)
        if not self.root.is_absolute() or self.root == Path("/") or self.root.is_symlink() or self.root.resolve() != self.root:
            raise DeploymentError("deployment store must be an explicit real directory")
        self.root.mkdir(mode=0o700, parents=False, exist_ok=True)
        if self.root.stat().st_uid != os.getuid() or self.root.stat().st_mode & 0o077:
            raise DeploymentError("deployment store must be private and operator-owned")
        self.adapters = adapters
        self.clock = clock
        self.monotonic = monotonic

    def target_dir(self, target_id):
        if not isinstance(target_id, str) or not re.fullmatch(r"[a-z][a-z0-9-]{0,63}", target_id) or target_id not in self.adapters:
            raise DeploymentError("target is not enrolled")
        directory = self.root / target_id
        if directory.is_symlink():
            raise DeploymentError("symlink target store refused")
        directory.mkdir(mode=0o700, exist_ok=True)
        return directory

    @contextmanager
    def lock(self, target_id):
        directory = self.target_dir(target_id)
        descriptor = os.open(directory / ".lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, "w") as stream:
            try:
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as error:
                raise DeploymentError("target has an executing operation") from error
            yield directory

    def load(self, directory, deployment_id):
        if not isinstance(deployment_id, str) or not re.fullmatch(r"[a-f0-9-]{36}", deployment_id):
            raise DeploymentError("invalid deployment ID")
        file = directory / f"{deployment_id}.json"
        if file.is_symlink():
            raise DeploymentError("symlink journal refused")
        data = json.loads(file.read_text())
        if data["id"] != deployment_id or data["plan"]["targetId"] != directory.name:
            raise DeploymentError("journal belongs to another target or deployment")
        if fingerprint(data["plan"]) != data["planHash"]:
            raise DeploymentError("deployment plan changed after preparation")
        return data

    def save(self, directory, data, phase):
        data["phase"] = phase
        data["history"].append({"phase": phase, "at": timestamp()})
        atomic_write(directory / f"{data['id']}.json", data)

    def assert_no_interrupted_transition(self, directory):
        for file in directory.glob("*.json"):
            if file.is_symlink():
                raise DeploymentError("symlink journal refused")
            data = json.loads(file.read_text())
            if data.get("phase") in {"applying", "verifying", "rolling_back", "rollback_failed"}:
                raise DeploymentError("unfinished transition requires explicit recovery")

    def fresh(self, target_id, observation):
        validate_observation(observation)
        if observation["targetId"] != target_id:
            raise DeploymentError("observation belongs to another target")
        age = self.clock() - observation["observedAt"]
        if not 0 <= age <= 30:
            raise DeploymentError("runtime observation is stale")
        return observation

    def plan(self, target_id, candidate, *, operation="apply"):
        if operation not in {"apply", "disable", "rollback"}:
            raise DeploymentError("invalid deployment operation")
        validate_revision(candidate)
        candidate = copy.deepcopy(candidate)
        if operation == "disable" and candidate["mods"]:
            raise DeploymentError("disable revision still contains a Mod")
        with self.lock(target_id) as directory:
            self.assert_no_interrupted_transition(directory)
            adapter = self.adapters[target_id]
            current = self.fresh(target_id, adapter.inspect())
            # A failed/unverified current service is not an accepted rollback.
            if not all(current[key] is True for key in ("healthy", "activationVerified", "inferenceVerified")):
                raise DeploymentError("current revision is not a verified rollback baseline")
            if candidate == current["revision"]:
                raise DeploymentError("candidate is already the observed revision")
            result = adapter.preflight(copy.deepcopy(candidate))
            if result.get("ready") is not True:
                raise DeploymentError("preflight requires adaptation or acceptance: " + "; ".join(result.get("reasons", [])))
            identifier = str(uuid.uuid4())
            approval = secrets.token_urlsafe(32)
            plan = {"targetId": target_id, "operation": operation, "previous": current["revision"], "expectedIdentity": current["identity"], "candidate": candidate, "createdAt": self.clock(), "expiresAt": self.clock() + 600}
            data = {"schema": "workstation.mod-deployment/v1", "id": identifier, "plan": plan, "planHash": fingerprint(plan), "approvalHash": hashlib.sha256(approval.encode()).hexdigest(), "history": []}
            self.save(directory, data, "awaiting_approval")
            return {"id": identifier, "plan": plan, "planHash": data["planHash"], "approval": approval}

    def require_approval(self, data, approval, plan_hash, restart_confirmed):
        if data["phase"] != "awaiting_approval":
            raise DeploymentError("approval already consumed or invalid")
        if restart_confirmed is not True:
            raise DeploymentError("explicit restart confirmation required")
        if not isinstance(approval, str) or not hmac.compare_digest(hashlib.sha256(approval.encode()).hexdigest(), data["approvalHash"]):
            raise DeploymentError("invalid approval")
        if not isinstance(plan_hash, str) or not hmac.compare_digest(plan_hash, data["planHash"]):
            raise DeploymentError("approval belongs to a different plan")
        if not data["plan"]["createdAt"] <= self.clock() < data["plan"]["expiresAt"]:
            raise DeploymentError("approval expired")

    def verified(self, target_id, adapter, revision, identifier, deadline):
        if self.monotonic() >= deadline:
            raise DeploymentError("verification deadline already exhausted")
        observation = self.fresh(target_id, adapter.verify(copy.deepcopy(revision), identifier, deadline))
        if self.monotonic() > deadline:
            raise DeploymentError("verification exceeded its deadline")
        if observation["revision"] != revision or not all(observation[key] is True for key in ("healthy", "activationVerified", "inferenceVerified")):
            raise DeploymentError("runtime materialization and inference not verified")
        if not adapter.owns_transition(identifier):
            raise DeploymentError("target ownership changed")
        return observation

    def apply(self, target_id, deployment_id, approval, plan_hash, *, restart_confirmed=False):
        with self.lock(target_id) as directory:
            self.assert_no_interrupted_transition(directory)
            data = self.load(directory, deployment_id)
            self.require_approval(data, approval, plan_hash, restart_confirmed)
            plan = data["plan"]
            adapter = self.adapters[target_id]
            current = self.fresh(target_id, adapter.inspect())
            if current["identity"] != plan["expectedIdentity"] or current["revision"] != plan["previous"]:
                self.save(directory, data, "superseded")
                raise DeploymentError("target changed; prepare and approve a new plan")
            if not all(current[key] is True for key in ("healthy", "activationVerified", "inferenceVerified")):
                self.save(directory, data, "superseded")
                raise DeploymentError("rollback baseline is no longer verified")
            if adapter.preflight(copy.deepcopy(plan["candidate"])).get("ready") is not True:
                self.save(directory, data, "superseded")
                raise DeploymentError("admission changed since approval")
            # Persist consumption and recovery baseline before the first mutation.
            self.save(directory, data, "applying")
            try:
                deadline = self.monotonic() + 900
                adapter.activate(copy.deepcopy(plan["candidate"]), deployment_id, deadline)
                self.save(directory, data, "verifying")
                data["observation"] = self.verified(target_id, adapter, plan["candidate"], deployment_id, deadline)
                if data["observation"]["identity"] == plan["expectedIdentity"]:
                    raise DeploymentError("serving process generation did not change")
                self.save(directory, data, "effective")
            except Exception:
                # Raw adapter exception text may contain credentials or commands.
                data["failure"] = "application or verification failed"
                self.rollback(directory, data, adapter)
            return self.public_record(data)

    def rollback(self, directory, data, adapter):
        if not adapter.owns_transition(data["id"]):
            try:
                current = self.fresh(data["plan"]["targetId"], adapter.inspect())
                if current["identity"] == data["plan"]["expectedIdentity"] and current["revision"] == data["plan"]["previous"] and all(current[key] is True for key in ("healthy", "activationVerified", "inferenceVerified")):
                    self.save(directory, data, "failed")
                    return
            except Exception:
                pass
            self.save(directory, data, "rollback_failed")
            return
        self.save(directory, data, "rolling_back")
        try:
            deadline = self.monotonic() + 900
            adapter.restore(copy.deepcopy(data["plan"]["previous"]), data["id"], deadline)
            data["observation"] = self.verified(data["plan"]["targetId"], adapter, data["plan"]["previous"], data["id"], deadline)
            self.save(directory, data, "rolled_back")
        except Exception:
            self.save(directory, data, "rollback_failed")

    def recover(self, target_id, deployment_id, *, rollback_confirmed=False):
        """Operator-requested rollback of an interrupted transition; never re-apply."""
        if rollback_confirmed is not True:
            raise DeploymentError("explicit recovery confirmation required")
        with self.lock(target_id) as directory:
            data = self.load(directory, deployment_id)
            if data["phase"] not in {"applying", "verifying", "rolling_back", "rollback_failed"}:
                raise DeploymentError("deployment does not need recovery")
            self.rollback(directory, data, self.adapters[target_id])
            return self.public_record(data)

    @staticmethod
    def public_record(data):
        return {key: data[key] for key in ("id", "plan", "planHash", "phase", "history", "observation", "failure") if key in data}
