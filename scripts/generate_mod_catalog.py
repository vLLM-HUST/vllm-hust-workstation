#!/usr/bin/env python3
"""Generate Workstation presentation data from the pinned dev-hub feed."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEVHUB = ROOT / "deps" / "vllm-hust-dev-hub"
FEED = DEVHUB / "config" / "extension-catalog-v1.json"

CATEGORIES = {
    "adaptive-quantized-kv": ["capacity", "throughput"],
    "bidkv": ["capacity", "latency"],
    "clm-lifecycle": ["capacity", "observability"],
    "diffspec": ["latency", "throughput"],
    "knorm": ["latency", "throughput"],
    "kv-tiering": ["capacity"],
    "kv-transfer-observability": ["observability"],
    "kvcompress": ["capacity"],
    "latchmoe": ["capacity"],
    "mapped-kv-offload": ["capacity"],
    "pegaflow": ["capacity", "observability"],
    "pipeline-microbatch": ["latency", "throughput"],
    "prefix-router": ["latency", "throughput"],
    "pyramidkv": ["capacity"],
    "qos-scheduler": ["latency", "throughput"],
    "quantized-kv-cache": ["capacity", "throughput"],
    "scheduler-policy-lab": ["latency", "throughput", "observability"],
    "simllm": ["observability"],
    "slicegpt": ["capacity", "throughput"],
}

PACKAGES = {
    "bidkv": "bidkv",
    "diffspec": "vllm-diffspec",
    "latchmoe": "vllm-moe-offload-ascend",
    "pipeline-microbatch": "vllm-hust-pipeline-microbatch",
}

APPLICABILITY = {
    "bidkv": ("applicable", "当前模型适用", True),
    "diffspec": ("requires-configuration", "需匹配 Draft", True),
    "latchmoe": ("not-applicable", "当前 dense 模型不适用", False),
    "pipeline-microbatch": ("not-applicable", "当前 TP4/PP1 部署不适用", False),
}


def git_head(path: Path) -> str:
    return subprocess.run(
        ["git", "-C", str(path), "rev-parse", "HEAD"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


def effectiveness(entry: dict) -> dict[str, str]:
    effects = entry["tested_effects"]
    negative = [
        effect
        for effect in effects
        if effect["status"] == "not-recommended-for-tested-cell"
    ]
    selected = negative or effects
    if not selected:
        return {
            "status": "unverified",
            "label": "收益待验证",
            "scope": "No matched performance evidence.",
            "detail": "目录可见性不构成性能声明。",
        }
    effect = selected[0]
    statuses = {
        "not-recommended-for-tested-cell": (
            "not-beneficial-in-tested-cell",
            "已测单元不具收益",
        ),
        "inconclusive": ("inconclusive", "结果不确定"),
        "beneficial": ("beneficial", "已测单元具收益"),
        "neutral": ("inconclusive", "已测单元中性"),
    }
    status, label = statuses[effect["status"]]
    return {
        "status": status,
        "label": label,
        "scope": effect["cell"],
        "detail": effect["summary"],
    }


def recommendation(entry: dict) -> dict[str, str]:
    level = entry["recommendation"]["level"]
    if "not-recommended" in level:
        status, label = "not-recommended-tested-cell", "已测配置不推荐"
    elif level.startswith("experimental"):
        status, label = "experimental", "实验预览"
    else:
        status, label = "scenario-dependent", "按场景评估"
    return {
        "status": status,
        "label": label,
        "reason": entry["recommendation"]["reason"],
    }


def transform(entry: dict) -> dict:
    identifier = entry["id"]
    installation = entry["installation"]
    availability = entry["availability"]
    function = entry["functional_qualification"]
    if identifier in APPLICABILITY:
        applicability, applicability_label, current = APPLICABILITY[identifier]
    elif availability == "external":
        applicability, applicability_label, current = "external", "需外部端点", None
    else:
        applicability, applicability_label, current = "unknown", "待核验", None
    functional_labels = {
        "passed": "功能验收通过",
        "unverified": "功能待验收",
        "external": "外部管理",
    }
    deployment = None
    if installation is not None:
        deployment = {
            "sourceSha": installation["commit"],
            "bundle": installation["entrypoint"]["name"],
            "package": PACKAGES[identifier],
        }
    availability_labels = {
        "available": "可用",
        "preview": "预览",
        "external": "外部服务",
    }
    reason = (
        entry["recommendation"]["reason"]
        if availability == "available"
        else entry["enablement"]["blocker"]
    )
    qualification = {
        "status": function["status"],
        "label": functional_labels[function["status"]],
        "scope": function["scope"],
    }
    if function["evidence"]:
        qualification["evidence"] = function["evidence"][0]
    scenarios = [item["description"] for item in entry["expected_scenarios"]]
    return {
        "id": identifier,
        "name": entry["name"],
        "kind": "external" if availability == "external" else "runtime",
        "description": entry["resource_tradeoff"]["benefit"],
        "source": {
            "repository": entry["repository"],
            "defaultBranch": entry["source"]["ref"],
            "sourceSha": entry["source"]["commit"],
        },
        "deployment": deployment,
        "managerManifest": {
            "path": installation["manifest_path"] if installation else None,
            "status": "present" if installation else "missing",
        },
        "availability": {
            "status": availability,
            "label": availability_labels[availability],
            "reason": reason,
        },
        "applicability": {
            "status": applicability,
            "label": applicability_label,
            "scope": "; ".join(entry["runtime_requirements"]["models"]),
            "currentModelApplicable": current,
        },
        "functionalQualification": qualification,
        "effectiveness": effectiveness(entry),
        "recommendation": recommendation(entry),
        "categories": CATEGORIES[identifier],
        "scenarios": scenarios,
        "actions": {
            "prepare": availability == "available",
            "configure": availability == "available",
            "externalHealth": False,
        },
    }


def generate() -> dict:
    feed = json.loads(FEED.read_text(encoding="utf-8"))
    devhub_sha = git_head(DEVHUB)
    return {
        "schemaVersion": 1,
        "source": (
            "https://github.com/vLLM-HUST/vllm-hust-dev-hub/blob/"
            f"{devhub_sha}/config/extension-catalog-v1.json"
        ),
        "manager": {
            "repository": "https://github.com/vLLM-HUST/extension-manager",
            "defaultBranch": "main",
            "sourceSha": feed["source"]["commit"],
        },
        "entries": [transform(entry) for entry in feed["extensions"]],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output", type=Path, default=ROOT / "config" / "mod-catalog.v1.json"
    )
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(generate(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
