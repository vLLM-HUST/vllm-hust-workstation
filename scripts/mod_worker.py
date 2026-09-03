#!/usr/bin/env python3
"""Bounded package/intent worker. Never launches vLLM, Docker or systemctl.

All paths live in an operator-owned Mod library. Runtime authority is intentionally
absent: Manager enable is saved intent, not proof of serving-process activation.
"""
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile
import time


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def atomic_json(target, value):
    fd, name = tempfile.mkstemp(prefix=".mod-", dir=target.parent)
    with os.fdopen(fd, "w") as stream:
        json.dump(value, stream, ensure_ascii=False)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(name, target)


def safe_child(root, name):
    child = root / name
    if child.is_symlink() or child.resolve().parent != root:
        raise ValueError("拒绝非独立 Mod 路径")
    return child


def execute(root, task, spec, report):
    mod = spec["mod"]
    ident = mod["id"]
    if ident not in {"bidkv", "diffspec", "latchmoe"}:
        raise ValueError("未审核的 Mod")
    if not re.fullmatch(r"[a-f0-9]{40}", mod["sha"]) or not re.fullmatch(r"[a-f0-9]{40}", spec["managerSha"]):
        raise ValueError("必须固定完整源码 SHA")
    if not re.fullmatch(r"https://github.com/vLLM-HUST/[A-Za-z0-9-]+", mod["repository"]):
        raise ValueError("未审核的源码来源")
    target = safe_child(root, ident)
    action = task["action"]
    started = time.monotonic()
    env = {"PATH": "/usr/local/bin:/usr/bin:/bin", "LANG": "C.UTF-8", "PIP_CONFIG_FILE": "/dev/null", "PIP_NO_INPUT": "1", "PIP_DISABLE_PIP_VERSION_CHECK": "1", "PIP_NO_CACHE_DIR": "1", "PYTHONNOUSERSITE": "1"}

    def run(args, location):
        remaining = 900 - (time.monotonic() - started)
        if remaining <= 0:
            raise ValueError("任务超过 15 分钟限制")
        child_env = {**env, "HOME": str(location), "TMPDIR": str(location), "VLLM_HUST_EXT_CONFIG": str(location / "manager.json")}
        with subprocess.Popen([str(a) for a in args], cwd=location, env=child_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True) as process:
            try:
                stdout, stderr = process.communicate(timeout=min(300, remaining))
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.communicate()
                raise ValueError("子任务超时；已终止该任务进程组") from None
            if process.returncode:
                # Children inherit no credentials. Keep errors bounded; config is
                # never supplied on argv or printed by this worker.
                message = stderr.decode(errors="replace")[-2000:]
                raise ValueError(f"执行失败 (exit {process.returncode}): {message}")
            return stdout.decode()

    def manager(location, command, *args):
        return run([location / "env/bin/python", "-c", "from vllm_hust_ext.cli import main; raise SystemExit(main())", "extension", command, mod["bundle"], *args], location)

    if action == "install":
        if target.exists():
            raise ValueError("Mod 目录已存在；请先检查或卸载，禁止覆盖")
        if os.statvfs(root).f_bavail * os.statvfs(root).f_frsize < 2 * 1024**3:
            raise ValueError("Mod 库至少需要 2 GiB 可用空间")
        stage = Path(tempfile.mkdtemp(prefix=f".install-{ident}-", dir=root))
        report("创建独立环境；失败时不替换现有安装。")
        run([sys.executable, "-m", "venv", stage / "env"], stage)
        python = stage / "env/bin/python"
        pip = [python, "-m", "pip", "install", "--no-deps", "--index-url", "https://pypi.org/simple"]
        report("安装固定版本的 Manager 运行依赖。")
        run([*pip, "packaging==24.2", "platformdirs==4.3.6"], stage)
        wheels = stage / "wheels"
        wheels.mkdir()
        for name, url, sha in [("manager", "https://github.com/vLLM-HUST/extension-manager", spec["managerSha"]), ("mod", mod["repository"], mod["sha"])]:
            report(f"构建 {name} 固定源码 {sha[:12]}；不安装推理引擎依赖。")
            # GitHub's immutable commit archive avoids flaky Git smart-HTTP
            # negotiation and does not resolve a moving branch or execute hooks.
            repository = url.removeprefix("https://github.com/")
            source = f"https://codeload.github.com/{repository}/zip/{sha}"
            run([python, "-m", "pip", "wheel", "--no-deps", "--wheel-dir", wheels, "--index-url", "https://pypi.org/simple", source], stage)
        artifacts = sorted(wheels.glob("*.whl"))
        if len(artifacts) != 2:
            raise ValueError("构建制品数量不符")
        run([*pip, *artifacts], stage)
        report("通过 Extension Manager 检查安装态 manifest；不会加载推理插件。")
        manifest = json.loads(manager(stage, "validate"))
        if manifest["bundle_id"] != mod["bundle"]:
            raise ValueError("安装制品身份不匹配")
        receipt = {"installed": True, "enabled": False, "configured": False, "version": manifest["distribution_version"], "sha": mod["sha"], "managerSha": spec["managerSha"], "installedAt": now(), "wheels": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in artifacts}, "manifest": manifest, "runtime": "unverified"}
        atomic_json(stage / "receipt.json", receipt)
        stage.rename(target)
        report("安装已验证并入库；尚未配置或在任何推理服务中生效。")
        return

    if not target.is_dir():
        raise ValueError("请先安装 Mod")
    receipt = json.loads((target / "receipt.json").read_text())
    if receipt["sha"] != mod["sha"]:
        raise ValueError("安装 SHA 与审核目录不一致")
    config_path = target / "manager.json"
    previous = config_path.read_bytes() if config_path.exists() else None
    try:
        if action == "configure":
            configuration = spec.get("configuration")
            if not isinstance(configuration, dict):
                raise ValueError("配置必须为 JSON 对象")
            # Do not accept caller-supplied compatibility/health claims.
            if set(configuration) - {"launch_options"}:
                raise ValueError("仅允许 launch_options；兼容性和健康证据不能手工伪造")
            if ident == "diffspec" and not configuration.get("launch_options", {}).get("speculative_config", {}).get("model"):
                raise ValueError("DiffSpec 需要 launch_options.speculative_config.model")
            atomic_json(target / "input.json", configuration)
            manager(target, "configure", "--file", target / "input.json")
            manager(target, "plan")
            receipt["configured"] = True
            report("配置经 Manager plan 校验；尚未应用到推理实例。")
        elif action == "enable":
            if not receipt.get("configured"):
                raise ValueError("请先保存配置")
            manager(target, "enable")
            manager(target, "plan")
            receipt["enabled"] = True
            report("已保存启用意图；需要绑定兼容目标和单独审批，当前服务未改变。")
        elif action == "disable":
            manager(target, "disable")
            receipt["enabled"] = False
            report("已清除库内启用意图；未改变任何运行中的服务。")
        elif action == "uninstall":
            if receipt.get("enabled"):
                raise ValueError("请先停用库内意图再卸载")
            if config_path.exists():
                manager(target, "forget")
            archive = safe_child(root, "archive")
            archive.mkdir(exist_ok=True, mode=0o700)
            target.rename(archive / f"{ident}-{task['id']}")
            report("已移出 Mod 库并保留可恢复归档；没有删除模型、KV 数据或共享服务。")
            return
        else:
            raise ValueError("执行器不提供运行或服务管理命令")
        atomic_json(target / "receipt.json", receipt)
    except Exception:
        if previous is not None:
            # Recover the exact previous Manager intent on configure/enable failure.
            atomic_json(config_path, json.loads(previous))
        elif config_path.exists():
            config_path.unlink()
        raise


def main():
    root = Path(sys.argv[1])
    job = sys.argv[2]
    if not root.is_absolute() or root == Path("/") or root.is_symlink() or root.resolve() != root:
        raise ValueError("无效 Mod 根目录")
    if not re.fullmatch(r"[a-f0-9-]{36}", job):
        raise ValueError("无效任务 ID")
    file = root / "tasks" / f"{job}.json"
    task = json.loads(file.read_text())

    def report(message):
        task["logs"] = [*task["logs"], f"{now()} {message}"][-80:]
        task["updatedAt"] = now()
        atomic_json(file, task)

    with (root / ".worker.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            task["status"] = "running"
            report("执行器已取得独占锁。")
            spec = json.loads(sys.stdin.read(25000))
            execute(root, task, spec, report)
            task["status"] = "succeeded"
            report("任务完成。")
        except Exception as error:
            task["status"] = "failed"
            report(str(error))


if __name__ == "__main__":
    main()
