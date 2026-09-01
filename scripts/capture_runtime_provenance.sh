#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_HOME="${WORKSTATION_DEPLOY_HOME:-$REPO_DIR/.workstation-deploy}"
CONTAINER_NAME="${1:-${WORKSTATION_RUNTIME_CONTAINER:-}}"
OUTPUT_FILE="${2:-${WORKSTATION_RUNTIME_PROVENANCE_FILE:-$DEPLOY_HOME/runtime-provenance.json}}"

if [[ -z "$CONTAINER_NAME" ]]; then
  echo "Set WORKSTATION_RUNTIME_CONTAINER or pass the serving container name" >&2
  exit 1
fi

DOCKER_CMD=(docker)
if ! docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  DOCKER_CMD=(sudo -n docker)
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

"${DOCKER_CMD[@]}" inspect "$CONTAINER_NAME" > "$tmp_dir/container.json"
image_ref="$("${DOCKER_CMD[@]}" inspect -f '{{.Config.Image}}' "$CONTAINER_NAME")"
container_image_id="$("${DOCKER_CMD[@]}" inspect -f '{{.Image}}' "$CONTAINER_NAME")"
# Inspect the immutable image ID recorded on the running container. The tag in
# Config.Image is display metadata and may have moved since this container was
# created.
"${DOCKER_CMD[@]}" image inspect "$container_image_id" > "$tmp_dir/image.json"

mkdir -p "$(dirname "$OUTPUT_FILE")"
python3 - "$tmp_dir/container.json" "$tmp_dir/image.json" "$OUTPUT_FILE" <<'PY'
import datetime
import json
import os
import re
import sys
from pathlib import Path

container = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))[0]
image = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))[0]
output = Path(sys.argv[3])
labels = image.get("Config", {}).get("Labels") or {}

if container.get("State", {}).get("Status") != "running":
    raise SystemExit("serving container is not running")

def canonical_repo(value: str) -> str:
    match = re.fullmatch(r"git@github\.com:([^/]+)/(.+?)(?:\.git)?", value or "")
    if match:
        return f"https://github.com/{match.group(1)}/{match.group(2)}"
    return (value or "").removesuffix(".git")

core_repo = canonical_repo(labels.get("ai.vllm-hust.vllm-core.repository", ""))
plugin_repo = canonical_repo(labels.get("ai.vllm-hust.vllm-ascend.repository", ""))
core_commit = labels.get("ai.vllm-hust.vllm-core.commit", "")
plugin_commit = labels.get("ai.vllm-hust.vllm-ascend.commit", "")
lock_schema = labels.get("ai.vllm-hust.runtime-lock.schema", "")
source_mode = labels.get("ai.vllm-hust.source-mode", "")

if core_repo != "https://github.com/vLLM-HUST/vllm-hust":
    raise SystemExit("image core repository is not canonical vLLM-HUST")
if plugin_repo != "https://github.com/vLLM-HUST/vllm-ascend-hust":
    raise SystemExit("image plugin repository is not canonical vLLM-HUST")
if not re.fullmatch(r"[0-9a-f]{40}", core_commit) or not re.fullmatch(r"[0-9a-f]{40}", plugin_commit):
    raise SystemExit("image source commits are not immutable 40-character SHAs")
if lock_schema != "vllm-hust.production-runtime-lock/v1":
    raise SystemExit("image runtime lock schema is not trusted")

image_id = image.get("Id", "")
repo_digests = image.get("RepoDigests") or []
digest = repo_digests[0].split("@", 1)[1] if repo_digests and "@" in repo_digests[0] else image_id
if not re.fullmatch(r"sha256:[0-9a-f]{64}", image_id) or not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
    raise SystemExit("image identity is not an immutable sha256 digest")

payload = {
    "schema": "vllm-hust.workstation-runtime-provenance/v1",
    "source": "docker-inspect-receipt",
    "capturedAt": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
    "container": {
        "name": container.get("Name", "").lstrip("/"),
        "id": container.get("Id", ""),
        "startedAt": container.get("State", {}).get("StartedAt", ""),
    },
    "image": {
        "reference": container.get("Config", {}).get("Image", ""),
        "id": image_id,
        "digest": digest,
    },
    "runtimeLock": {"schema": lock_schema, "sourceMode": source_mode},
    "components": {
        "core": {
            "name": "vLLM-HUST",
            "repository": core_repo,
            "commit": core_commit,
            "commitUrl": f"{core_repo}/commit/{core_commit}",
        },
        "plugin": {
            "name": "vLLM-Ascend-HUST",
            "repository": plugin_repo,
            "commit": plugin_commit,
            "commitUrl": f"{plugin_repo}/commit/{plugin_commit}",
        },
    },
}

temporary = output.with_suffix(output.suffix + ".tmp")
temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
os.chmod(temporary, 0o644)
os.replace(temporary, output)
print(output)
PY
