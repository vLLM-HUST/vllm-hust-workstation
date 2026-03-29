#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_HOME="${WORKSTATION_DEPLOY_HOME:-$REPO_DIR/.workstation-deploy}"
SYSTEMD_USER_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
SERVICE_TEMPLATE="$REPO_DIR/deploy/systemd/vllm-hust-model@.service.template"
MANIFEST_PATH_DEFAULT="$REPO_DIR/deploy/model-fleet.json"
PLAN_PATH_DEFAULT="$DEPLOY_HOME/model-fleet/plan.json"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

load_env_file() {
  if [[ -f "$REPO_DIR/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$REPO_DIR/.env" 2>/dev/null || true
    set +a
  fi
}

ensure_systemd_user() {
  if ! systemctl --user show-environment >/dev/null 2>&1; then
    echo "systemd --user is not available for the current user session" >&2
    exit 1
  fi
}

build_workspace_pythonpath() {
  local parent_dir
  local pythonpath=""
  local candidate

  parent_dir="$(cd "$REPO_DIR/.." && pwd)"
  for candidate in \
    "$parent_dir/vllm-hust" \
    "$parent_dir/vllm-hust/src" \
    "$parent_dir/vllm-hust-protocol/src" \
    "$parent_dir/vllm-hust-backend/src" \
    "$parent_dir/vllm-hust-core/src" \
    "$parent_dir/vllm-hust-control-plane/src" \
    "$parent_dir/vllm-hust-gateway/src" \
    "$parent_dir/vllm-hust-kv-cache/src" \
    "$parent_dir/vllm-hust-comm/src" \
    "$parent_dir/vllm-hust-compression/src"
  do
    if [[ -d "$candidate" ]]; then
      pythonpath="${pythonpath:+$pythonpath:}$candidate"
    fi
  done

  printf '%s\n' "$pythonpath"
}

manifest_path() {
  printf '%s\n' "${WORKSTATION_MODEL_FLEET_MANIFEST:-$MANIFEST_PATH_DEFAULT}"
}

plan_path() {
  printf '%s\n' "${WORKSTATION_MODEL_FLEET_PLAN:-$PLAN_PATH_DEFAULT}"
}

instance_env_dir() {
  printf '%s/model-fleet/instances\n' "$DEPLOY_HOME"
}

service_prefix() {
  python3 - "$(manifest_path)" <<'PY'
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8') as file:
    payload = json.load(file)
print(payload.get('defaults', {}).get('service_prefix', 'vllm-hust-model'))
PY
}

plan_fleet() {
  mkdir -p "$DEPLOY_HOME/model-fleet"
  python3 "$REPO_DIR/scripts/plan_model_fleet.py" \
    --manifest "$(manifest_path)" \
    --output "$(plan_path)"
}

install_service_template() {
  local unit_path
  unit_path="$SYSTEMD_USER_DIR/$(service_prefix)@.service"
  mkdir -p "$SYSTEMD_USER_DIR"
  sed "s|__REPO_DIR__|$REPO_DIR|g" "$SERVICE_TEMPLATE" > "$unit_path"
  systemctl --user daemon-reload
}

write_instance_env_files() {
  local vllm_bin
  local pythonpath
  vllm_bin="${WORKSTATION_VLLM_SERVE_BIN:-$(command -v vllm-hust || true)}"
  pythonpath="${WORKSTATION_VLLM_PYTHONPATH:-$(build_workspace_pythonpath)}"

  if [[ -z "$vllm_bin" || ! -x "$vllm_bin" ]]; then
    echo "Unable to locate vllm-hust binary for model fleet deployment" >&2
    exit 1
  fi

  if ! PYTHONNOUSERSITE=1 "$vllm_bin" --help >/dev/null 2>&1; then
    echo "The selected vllm-hust runtime is not runnable. Set WORKSTATION_VLLM_SERVE_BIN to a valid environment with torch and compatible dependencies installed." >&2
    exit 1
  fi

  rm -rf "$(instance_env_dir)"
  mkdir -p "$(instance_env_dir)"

  python3 - "$(plan_path)" "$(instance_env_dir)" "$vllm_bin" "$pythonpath" "${VLLM_HUST_API_KEY:-not-required}" "${PATH:-}" "${LD_LIBRARY_PATH:-}" "${CONDA_PREFIX:-}" <<'PY'
import json, pathlib, sys
plan_path = pathlib.Path(sys.argv[1])
target_dir = pathlib.Path(sys.argv[2])
vllm_bin = sys.argv[3]
pythonpath = sys.argv[4]
api_key = sys.argv[5]
runtime_path = sys.argv[6]
ld_library_path = sys.argv[7]
conda_prefix = sys.argv[8]
plan = json.loads(plan_path.read_text(encoding='utf-8'))
for item in plan.get('instances', []):
    env_file = target_dir / f"{item['instance_name']}.env"
    env_file.write_text(
        "\n".join([
            f"WORKSTATION_DEPLOY_HOME={target_dir.parent.parent}",
            f"WORKSTATION_VLLM_SERVE_BIN={vllm_bin}",
            f"WORKSTATION_VLLM_PYTHONPATH={pythonpath}",
            f"PATH={runtime_path}",
            f"LD_LIBRARY_PATH={ld_library_path}",
            f"CONDA_PREFIX={conda_prefix}",
            f"MODEL_ID={item['model']}",
            f"MODEL_GPU_INDEX={item['gpu_index']}",
            f"MODEL_GPU_INDICES={','.join(str(index) for index in item.get('gpu_indices', [item['gpu_index']]))}",
            f"MODEL_PORT={item['port']}",
            f"MODEL_HOST={item['host']}",
            f"MODEL_GPU_MEMORY_UTILIZATION={item['gpu_memory_utilization']}",
            f"MODEL_TENSOR_PARALLEL_SIZE={item.get('tensor_parallel_size', 1)}",
            f"MODEL_TOOL_CALL_PARSER={item.get('tool_call_parser', '')}",
            f"VLLM_HUST_API_KEY={api_key}",
            "HF_HUB_OFFLINE=1",
            "TRANSFORMERS_OFFLINE=1",
            ""
        ]),
        encoding='utf-8',
    )
PY
}

stop_stale_units() {
  local prefix
  local active_names current_units env_file instance_name
  prefix="$(service_prefix)"
  active_names="$(python3 - "$(plan_path)" <<'PY'
import json, sys
plan = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
for item in plan.get('instances', []):
    print(item['instance_name'])
PY
)"

  current_units="$(systemctl --user list-units "${prefix}@*.service" --no-legend --no-pager 2>/dev/null | awk '{print $1}' || true)"
  while IFS= read -r unit; do
    [[ -z "$unit" ]] && continue
    instance_name="${unit#${prefix}@}"
    instance_name="${instance_name%.service}"
    if ! printf '%s\n' "$active_names" | grep -Fxq "$instance_name"; then
      systemctl --user stop "$unit" || true
      systemctl --user disable "$unit" >/dev/null 2>&1 || true
    fi
  done <<< "$current_units"

  for env_file in "$(instance_env_dir)"/*.env; do
    [[ -e "$env_file" ]] || break
    instance_name="$(basename "$env_file" .env)"
    if ! printf '%s\n' "$active_names" | grep -Fxq "$instance_name"; then
      rm -f "$env_file"
    fi
  done
}

start_planned_units() {
  local prefix
  local instance_name
  prefix="$(service_prefix)"
  while IFS= read -r instance_name; do
    [[ -z "$instance_name" ]] && continue
    systemctl --user enable "${prefix}@${instance_name}.service" >/dev/null
    systemctl --user restart "${prefix}@${instance_name}.service"
  done < <(python3 - "$(plan_path)" <<'PY'
import json, sys
plan = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
for item in plan.get('instances', []):
    print(item['instance_name'])
PY
)
}

status_units() {
  systemctl --user list-units "$(service_prefix)@*.service" --no-pager --no-legend || true
}

print_plan_summary() {
  python3 - "$(plan_path)" <<'PY'
import json, sys
plan = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
print('Planned instances:')
for item in plan.get('instances', []):
  gpu_text = ','.join(str(index) for index in item.get('gpu_indices', [item['gpu_index']]))
  tp_size = item.get('tensor_parallel_size', 1)
  print(f"- {item['instance_name']}: {item['model']} on GPU {gpu_text} port {item['port']} (tp={tp_size}, est {item['estimated_vram_mb']} MB per GPU)")
if plan.get('skipped'):
    print('Skipped:')
    for item in plan['skipped']:
        print(f"- {item['name']}: {item['reason']}")
PY
}

MODE="${1:-deploy}"

load_env_file

case "$MODE" in
  plan)
    require_command python3
    require_command nvidia-smi
    plan_fleet >/dev/null
    print_plan_summary
    ;;
  deploy)
    require_command python3
    require_command nvidia-smi
    require_command systemctl
    ensure_systemd_user
    chmod +x "$REPO_DIR/scripts/run_model_fleet_service.sh" "$REPO_DIR/scripts/plan_model_fleet.py"
    plan_fleet >/dev/null
    install_service_template
    write_instance_env_files
    stop_stale_units
    start_planned_units
    sleep 2
    print_plan_summary
    status_units
    ;;
  status)
    require_command systemctl
    ensure_systemd_user
    status_units
    ;;
  stop)
    require_command systemctl
    ensure_systemd_user
    systemctl --user stop "$(service_prefix)@*.service" || true
    ;;
  *)
    echo "Usage: $0 {plan|deploy|status|stop}" >&2
    exit 1
    ;;
esac