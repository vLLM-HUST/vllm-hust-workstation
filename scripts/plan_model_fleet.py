#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


def parse_gpu_index_filter(value: object) -> list[int] | None:
    if value is None:
        return None
    if isinstance(value, int):
        return [value]
    if isinstance(value, list):
        result = []
        for item in value:
            result.append(int(item))
        return result
    raise TypeError(f"Unsupported GPU index filter: {value!r}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Plan multi-model GPU placement for vllm-hust services")
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args()


def read_manifest(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def detect_gpus() -> list[dict]:
    result = subprocess.run(
        [
            "nvidia-smi",
            "--query-gpu=index,name,memory.total,memory.used,memory.free",
            "--format=csv,noheader,nounits",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    gpus = []
    for line in result.stdout.strip().splitlines():
        if not line.strip():
            continue
        parts = [part.strip() for part in line.split(",")]
        if len(parts) != 5:
            continue
        gpus.append(
            {
                "index": int(parts[0]),
                "name": parts[1],
                "total_mb": int(parts[2]),
                "used_mb": int(parts[3]),
                "free_mb": int(parts[4]),
                "planned_mb": 0,
                "planned_models": [],
            }
        )
    return gpus


def model_cache_available(model_id: str) -> bool:
    if model_id.startswith("/"):
        return Path(model_id).exists()
    cache_root = Path.home() / ".cache" / "huggingface" / "hub"
    cache_dir = cache_root / f"models--{model_id.replace('/', '--')}"
    snapshots_dir = cache_dir / "snapshots"
    blobs_dir = cache_dir / "blobs"
    if not snapshots_dir.is_dir() or not any(path.is_dir() for path in snapshots_dir.iterdir()):
        return False
    if blobs_dir.is_dir() and any(blobs_dir.glob("*.incomplete")):
        return False
    return True


def pick_gpu_group(
    gpus: list[dict],
    required_mb_per_gpu: int,
    gpu_count: int,
    reserve_mb: int,
    max_models_per_gpu: int,
    allowed_gpu_indices: list[int] | None,
) -> list[dict] | None:
    candidates: list[tuple[int, int, dict]] = []
    for gpu in gpus:
        if allowed_gpu_indices is not None and gpu["index"] not in allowed_gpu_indices:
            continue
        remaining_mb = gpu["free_mb"] - gpu["planned_mb"]
        if remaining_mb < required_mb_per_gpu + reserve_mb:
            continue
        if len(gpu["planned_models"]) >= max_models_per_gpu:
            continue
        candidates.append((remaining_mb, gpu["index"], gpu))
    if len(candidates) < gpu_count:
        return None
    candidates.sort(key=lambda item: (-item[0], item[1]))
    return [item[2] for item in candidates[:gpu_count]]


def build_plan(manifest: dict, gpus: list[dict]) -> dict:
    defaults = manifest.get("defaults", {})
    reserve_mb = int(defaults.get("reserve_vram_mb", 4096))
    start_port = int(defaults.get("start_port", 8100))
    only_cached = bool(defaults.get("only_cached", True))
    max_models_per_gpu = int(defaults.get("max_models_per_gpu", 8))
    planned_instances = []
    skipped = []
    next_port = start_port

    for item in manifest.get("models", []):
        if not item.get("enabled", True):
            skipped.append({"name": item.get("name", item.get("model", "unknown")), "reason": "disabled"})
            continue

        model_id = item["model"]
        if only_cached and not model_cache_available(model_id):
            skipped.append({"name": item["name"], "reason": "not-cached"})
            continue

        estimated_vram_mb = int(item.get("estimated_vram_mb", 0))
        tensor_parallel_size = int(item.get("tensor_parallel_size", 1))
        allowed_gpu_indices = parse_gpu_index_filter(item.get("allowed_gpu_indices"))
        selected_gpus = pick_gpu_group(
            gpus,
            estimated_vram_mb,
            tensor_parallel_size,
            reserve_mb,
            max_models_per_gpu,
            allowed_gpu_indices,
        )
        if selected_gpus is None:
            skipped.append({"name": item["name"], "reason": "insufficient-free-vram"})
            continue

        instance = {
            "instance_name": item["name"],
            "model": model_id,
            "gpu_index": selected_gpus[0]["index"],
            "gpu_indices": [gpu["index"] for gpu in selected_gpus],
            "port": next_port,
            "estimated_vram_mb": estimated_vram_mb,
            "tensor_parallel_size": tensor_parallel_size,
            "tool_call_parser": item.get("tool_call_parser", ""),
            "gpu_memory_utilization": float(item.get("gpu_memory_utilization", defaults.get("gpu_memory_utilization", 0.9))),
            "host": item.get("host", defaults.get("host", "0.0.0.0")),
            "allowed_gpu_indices": allowed_gpu_indices or [],
        }
        for gpu in selected_gpus:
            gpu["planned_mb"] += estimated_vram_mb
            gpu["planned_models"].append(instance["instance_name"])
        planned_instances.append(instance)
        next_port += 1

    return {
        "defaults": defaults,
        "gpus": gpus,
        "instances": planned_instances,
        "skipped": skipped,
    }


def main() -> int:
    args = parse_args()
    manifest_path = Path(args.manifest)
    output_path = Path(args.output)
    plan = build_plan(read_manifest(manifest_path), detect_gpus())
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(plan, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    print(json.dumps(plan, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())