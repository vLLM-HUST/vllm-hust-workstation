"""Prepare fixed Mod artifacts for an enrolled target. No serving transitions."""
from contextlib import ExitStack
import datetime
import fcntl
import json
import os
from pathlib import Path
import re
import sys

from mod_deployment import atomic_write
from mod_worker import execute as library_execute
from inspect_mod_runtime import inspect
from prepare_mod_image import prepare, validate_python


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def private_root(value):
    root = Path(value)
    info = root.lstat()
    if not root.is_absolute() or root == Path("/") or root.resolve() != root or not root.is_dir() or root.is_symlink() or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError("private operator-owned directory required")
    return root


def check_target(task, target, snapshot):
    expected = task["expectedIdentity"]
    container = snapshot["container"]
    if task["targetId"] != target["id"] or container["name"] != target["containerName"] or not snapshot["artifactIdentityVerified"] or task["baseImageId"] != expected["imageId"]:
        raise ValueError("target binding or artifact identity mismatch")
    if {key: container[key] for key in ("id", "startedAt", "imageId")} != expected:
        raise ValueError("target changed since preparation was requested")


def execute(root, task, spec, report, *, inventory=inspect, build=prepare, install=library_execute):
    target = spec["target"]
    mod = spec["mod"]
    if task["modId"] != mod["id"] or task["sourceSha"] != mod["sha"] or task["managerSha"] != spec["managerSha"]:
        raise ValueError("task source pins changed")
    validate_python(target["pythonBin"])
    library = private_root(spec["library"])
    command = ["sudo", "-n", "docker"]
    # Use the enrolled serving interpreter, not a host or container default Python.
    snapshot = inventory(target["containerName"], command, python_bin=target["pythonBin"])
    check_target(task, target, snapshot)
    report("实例身份及运行制品已核验。")
    with ExitStack() as stack:
        for directory, name in ((root, ".prepare.lock"), (library, ".worker.lock")):
            fd = os.open(directory / name, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
            lock = stack.enter_context(os.fdopen(fd, "w"))
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        target_library = library / mod["id"]
        if not target_library.exists():
            report("获取固定源码并构建制品；不安装或替换推理引擎。")
            install(library, {"action": "install"}, {"mod": mod, "managerSha": spec["managerSha"]}, report)
        output = root / "images"
        output.mkdir(mode=0o700, exist_ok=True)
        private_root(output)
        report("构建实例候选镜像；推理服务保持运行。")
        result = build(library, output, mod["id"], mod["sha"], spec["managerSha"], task["baseImageId"], command, python_bin=target["pythonBin"])
        task["imageId"] = result["imageId"]
        task["receiptPath"] = result["receiptPath"]
        try:
            check_target(task, target, inventory(target["containerName"], command, python_bin=target["pythonBin"]))
        except Exception:
            task["status"] = "superseded"
            report("候选镜像已保留，但目标实例已变化或无法复核；需重新评估。")
            return
        task["status"] = "prepared"
        report("候选镜像准备完成；尚未应用，兼容性与运行验收待完成。")


def main():
    root = private_root(sys.argv[1])
    identifier = sys.argv[2]
    if not re.fullmatch(r"[a-f0-9-]{36}", identifier):
        raise ValueError("invalid preparation ID")
    directory = private_root(root / "tasks")
    file = directory / (identifier + ".json")
    if file.is_symlink():
        raise ValueError("invalid preparation task file")
    task = json.loads(file.read_text())
    if task["id"] != identifier or task["schema"] != "workstation.mod-preparation-task/v1" or task["status"] != "queued":
        raise ValueError("preparation task is not queued")

    def report(message):
        task["logs"] = [*task["logs"], now() + " " + message][-80:]
        task["updatedAt"] = now()
        atomic_write(file, task)

    try:
        payload = sys.stdin.read(25001)
        if len(payload) > 25000:
            raise ValueError("preparation input exceeds limit")
        spec = json.loads(payload)
        task["status"] = "preparing"
        task["workerPid"] = os.getpid()
        report("执行器已启动；只准备制品，不切换实例。")
        execute(root, task, spec, report)
    except Exception:
        task["status"] = "failed"
        report("准备未完成：请检查目标身份、制品或执行器权限；推理实例未切换。")


if __name__ == "__main__":
    main()
