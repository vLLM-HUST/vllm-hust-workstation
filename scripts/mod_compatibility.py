"""Source-pinned advisory preflight, never runtime qualification or admission.

Old host-version declarations are historical. Executable launch constraints are
reported as adaptation work, not permanent incompatibility with future ports.
"""
import hashlib
import argparse
import json
import os
from pathlib import Path
import zipfile

from prepare_mod_image import artifacts


DIFFSPEC_SOURCE = "c78f55c7e4923da342f2fc52c2cb509c150e5363"
DIFFSPEC_VALIDATOR = "1ceeb18c4fa7c3c1832f090b55194cecb888930ba30e1e68aa2014dfe4539d91"


def assess(snapshot, mod_id, source_sha, validator_hash):
    report = {"schema": "workstation.mod-preflight/v1", "evidenceLevel": "source-and-command-line",
              "modId": mod_id, "sourceSha": source_sha, "validatorSha256": validator_hash,
              "container": snapshot.get("container"), "capturedAt": snapshot.get("capturedAt"),
              "ready": False, "runtimeQualified": False, "status": "unverified", "checks": []}
    checks = report["checks"]
    if snapshot.get("artifactIdentityVerified") is not True:
        checks.append({"id": "artifact", "status": "unknown", "message": "运行制品身份未核验。"})
        return report
    if mod_id != "diffspec" or source_sha != DIFFSPEC_SOURCE or validator_hash != DIFFSPEC_VALIDATOR:
        checks.append({"id": "source", "status": "unknown", "message": "该固定源码的运行约束尚未完成审查。"})
        return report
    launch = snapshot.get("launch", {})
    if launch.get("available") is not True or launch.get("evidenceLevel") != "process-command-line":
        checks.append({"id": "launch", "status": "unknown", "message": "未取得唯一、稳定的推理进程启动参数。"})
        return report
    report["process"] = {key: launch[key] for key in ("pid", "startTicks")}
    options = launch.get("options", {})
    rules = [
        ("tensorParallel", 4, "当前资格画像要求 TP=4"),
        ("pipelineParallel", 1, "固定 DiffSpec 实现要求 PP=1"),
        ("maxNumSeqs", 4, "已验证并发与取消/恢复画像要求 max-num-seqs=4"),
        ("asyncScheduling", False, "固定 DiffSpec 实现要求关闭异步调度"),
        ("enforceEager", False, "正式资格画像要求 graph mode，禁止 eager 降级"),
        ("prefixCaching", False, "固定 DiffSpec 实现要求关闭 prefix cache"),
        ("dtype", "bfloat16", "固定 DiffSpec 实现要求 target BF16"),
        ("quantization", None, "固定 DiffSpec 实现不接受量化模型；需核验实际模型配置"),
    ]
    for key, expected, message in rules:
        value = options.get(key)
        # Absent flags and implicit runtime defaults are always unknown.
        status = "unknown" if value is None else "pass" if type(value) is type(expected) and value == expected else "adaptation-required"
        checks.append({"id": key, "status": status, "observed": value, "message": message})
    checks.append({"id": "model-and-draft", "status": "unknown", "message": "资格制品绑定 Qwen3.8-27B 与 VirVen/Qwen3.5-27B-EAGLE3-v2（checkpoint SHA256 a57cefc4…）；仍需核验当前实例实际文件哈希。"})
    checks.append({"id": "tp4-runtime-evidence", "status": "unknown", "message": "候选已通过 TP4 graph 矩阵，但命令行匹配不能让当前实例继承四 rank、接受/拒绝、KV、并发和恢复见证。"})
    if any(check["status"] == "adaptation-required" for check in checks):
        report["status"] = "adaptation-required"
    # Never turns all present CLI checks passing into compatibility or permission.
    return report


def preflight(library, mod_id, source_sha, manager_sha, snapshot):
    validated = artifacts(library, mod_id, source_sha, manager_sha)
    validator_hash = None
    if mod_id == "diffspec":
        artifact = next(item for item in validated if item["package"] == "vllm-diffspec")
        with zipfile.ZipFile(artifact["path"]) as wheel:
            validator_hash = hashlib.sha256(wheel.read("diffspec/runtime.py")).hexdigest()
    return assess(snapshot, mod_id, source_sha, validator_hash)


def main():
    from inspect_mod_runtime import inspect
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--library", type=Path, required=True)
    parser.add_argument("--mod", choices=["bidkv", "diffspec", "latchmoe"], required=True)
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--manager-sha", required=True)
    parser.add_argument("--container", required=True)
    parser.add_argument("--python-bin", required=True)
    parser.add_argument("--sudo", action="store_true")
    parser.add_argument("--output", type=Path, help="New private evidence file; never overwrite")
    args = parser.parse_args()
    snapshot = inspect(args.container, ["sudo", "-n", "docker"] if args.sudo else ["docker"], python_bin=args.python_bin)
    report = preflight(args.library, args.mod, args.source_sha, args.manager_sha, snapshot)
    rendered = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        parent = args.output.parent
        info = parent.stat()
        if not args.output.is_absolute() or parent.resolve() != parent or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError("evidence parent must be private and operator-owned")
        fd = os.open(args.output, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "w") as stream:
            stream.write(rendered)
            stream.flush()
            os.fsync(stream.fileno())
    else:
        print(rendered, end="")


if __name__ == "__main__":
    main()
