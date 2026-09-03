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

container_id="$("${DOCKER_CMD[@]}" inspect -f '{{.Id}}' "$CONTAINER_NAME")"
"${DOCKER_CMD[@]}" inspect "$container_id" > "$tmp_dir/container.json"
container_image_id="$("${DOCKER_CMD[@]}" inspect -f '{{.Image}}' "$container_id")"
# Inspect the immutable image ID recorded on the running container. The tag in
# Config.Image is display metadata and may have moved since this container was
# created.
"${DOCKER_CMD[@]}" image inspect "$container_image_id" > "$tmp_dir/image.json"

# Inspect installed wheel metadata without importing vLLM, torch, or NPU code.
# The embedded lock binds wheel archive hashes to the precise source commits.
"${DOCKER_CMD[@]}" exec -i "$container_id" python3 - > "$tmp_dir/artifacts.json" <<'PY'
import importlib.metadata as metadata
import importlib.util
import json
from pathlib import Path

lock = json.loads(Path('/opt/vllm-hust-runtime/production-lock.json').read_text())
evidence = {}
for key, package, module, lock_key in [('core', 'vllm', 'vllm', 'vllm_core'), ('plugin', 'vllm-ascend', 'vllm_ascend', 'vllm_ascend')]:
    dist = metadata.distribution(package)
    pin = lock[lock_key]
    direct = json.loads(dist.read_text('direct_url.json') or '{}')
    digest = direct.get('archive_info', {}).get('hashes', {}).get('sha256')
    origin = importlib.util.find_spec(module).origin
    if dist.version != pin['package_version'] or digest != pin['artifact']['sha256']:
        raise SystemExit('installed wheel differs from embedded production lock: ' + package)
    if not origin or '/site-packages/' not in origin:
        raise SystemExit('runtime module resolves outside installed site-packages: ' + module)
    evidence[key] = {'version': dist.version, 'moduleOrigin': origin, 'wheelSha256': digest, 'commit': pin['commit']}
print(json.dumps(evidence))
PY

if [[ "$("${DOCKER_CMD[@]}" inspect -f '{{.Id}}' "$CONTAINER_NAME")" != "$container_id" ]]; then
  echo "serving container changed during provenance capture; retry" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT_FILE")"
python3 - "$tmp_dir/container.json" "$tmp_dir/image.json" "$OUTPUT_FILE" "$tmp_dir/artifacts.json" <<'PY'
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
artifacts = json.loads(Path(sys.argv[4]).read_text(encoding="utf-8"))

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
compatibility_base = labels.get("ai.vllm-hust.compatibility.base", "")
stable_release = labels.get("ai.vllm-hust.compatibility.stable-release", "")
source_profile = labels.get("ai.vllm-hust.compatibility.source-profile", "")
vllm_package = labels.get("ai.vllm-hust.vllm-core.package-version", "")
vllm_ascend_package = labels.get("ai.vllm-hust.vllm-ascend.package-version", "")
core_version = labels.get("ai.vllm-hust.vllm-core.source-version", "")
plugin_version = labels.get("ai.vllm-hust.vllm-ascend.source-version", "")
image_created_at = labels.get("org.opencontainers.image.created", "")

if core_repo != "https://github.com/vLLM-HUST/vllm-hust":
    raise SystemExit("image core repository is not canonical vLLM-HUST")
if plugin_repo != "https://github.com/vLLM-HUST/vllm-ascend-hust":
    raise SystemExit("image plugin repository is not canonical vLLM-HUST")
if not re.fullmatch(r"[0-9a-f]{40}", core_commit) or not re.fullmatch(r"[0-9a-f]{40}", plugin_commit):
    raise SystemExit("image source commits are not immutable 40-character SHAs")
if lock_schema != "vllm-hust.production-runtime-lock/v2":
    raise SystemExit("image runtime lock schema is not trusted")
if source_mode != "immutable-wheels":
    raise SystemExit("only immutable wheel provenance is supported by this verifier")
if artifacts['core']['commit'] != core_commit or artifacts['plugin']['commit'] != plugin_commit:
    raise SystemExit("embedded lock source commits differ from image labels")
if artifacts['core']['version'] != vllm_package or artifacts['plugin']['version'] != vllm_ascend_package:
    raise SystemExit("installed package versions differ from image labels")
if not all((compatibility_base, stable_release, source_profile, vllm_package, vllm_ascend_package, core_version, plugin_version, image_created_at)):
    raise SystemExit("image compatibility or source-version labels are incomplete")

image_id = image.get("Id", "")
repo_digests = image.get("RepoDigests") or []
digest = repo_digests[0].split("@", 1)[1] if repo_digests and "@" in repo_digests[0] else image_id
if not re.fullmatch(r"sha256:[0-9a-f]{64}", image_id) or not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
    raise SystemExit("image identity is not an immutable sha256 digest")

payload = {
    "schema": "vllm-hust.workstation-runtime-provenance/v2",
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
        "createdAt": image.get("Created", ""),
        "buildStartedAt": image_created_at,
        "digestKind": "registry-manifest" if repo_digests else "image-config",
    },
    "runtimeLock": {"schema": lock_schema, "sourceMode": source_mode},
    "artifactEvidence": artifacts,
    "compatibility": {
        "base": compatibility_base,
        "stableRelease": stable_release,
        "sourceProfile": source_profile,
        "vllmPackage": vllm_package,
        "vllmAscendPackage": vllm_ascend_package,
    },
    "components": {
        "core": {
            "name": "vLLM-HUST",
            "repository": core_repo,
            "commit": core_commit,
            "version": core_version,
            "commitUrl": f"{core_repo}/commit/{core_commit}",
        },
        "plugin": {
            "name": "vLLM-Ascend-HUST",
            "repository": plugin_repo,
            "commit": plugin_commit,
            "version": plugin_version,
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
