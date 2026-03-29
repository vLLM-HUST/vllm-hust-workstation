#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_HOME_DEFAULT="$REPO_DIR/.workstation-deploy"
SERVICE_NAME_DEFAULT="vllm-hust-workstation"
SYSTEMD_USER_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
SYSTEMD_TEMPLATE="$REPO_DIR/deploy/systemd/vllm-hust-workstation.service.template"

resolve_conda_command() {
  if [[ -n "${CONDA_EXE:-}" && -x "${CONDA_EXE}" ]]; then
    printf '%s\n' "$CONDA_EXE"
    return 0
  fi
  if command -v conda >/dev/null 2>&1; then
    command -v conda
    return 0
  fi
  return 1
}

active_conda_env_name() {
  if [[ -n "${CONDA_DEFAULT_ENV:-}" ]]; then
    printf '%s\n' "$CONDA_DEFAULT_ENV"
    return 0
  fi
  if [[ -n "${CONDA_PREFIX:-}" ]]; then
    basename "$CONDA_PREFIX"
    return 0
  fi
  return 1
}

workstation_auto_install_node_enabled() {
  [[ "${WORKSTATION_AUTO_INSTALL_NODE_WITH_CONDA:-true}" == "true" ]]
}

ensure_node_runtime() {
  local conda_cmd
  local conda_env
  local node_version_spec

  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    return 0
  fi

  if ! workstation_auto_install_node_enabled; then
    return 1
  fi

  conda_cmd="$(resolve_conda_command || true)"
  conda_env="$(active_conda_env_name || true)"
  node_version_spec="${WORKSTATION_NODEJS_CONDA_SPEC:-nodejs>=20,<21}"

  if [[ -z "$conda_cmd" || -z "$conda_env" ]]; then
    return 1
  fi

  echo "[deploy] node/npm not found, installing ${node_version_spec} into conda env ${conda_env}" >&2
  "$conda_cmd" install -y -n "$conda_env" -c conda-forge "$node_version_spec"

  if [[ -n "${CONDA_PREFIX:-}" && -d "${CONDA_PREFIX}/bin" ]]; then
    case ":$PATH:" in
      *":${CONDA_PREFIX}/bin:"*) ;;
      *) export PATH="${CONDA_PREFIX}/bin:$PATH" ;;
    esac
  fi

  command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

ensure_env_file() {
  if [[ ! -f "$REPO_DIR/.env" ]]; then
    cp "$REPO_DIR/.env.example" "$REPO_DIR/.env"
    echo "[deploy] created $REPO_DIR/.env from template; review it before exposing the service publicly" >&2
  fi
}

load_env_file() {
  ensure_env_file
  set -a
  # shellcheck disable=SC1091
  source "$REPO_DIR/.env" 2>/dev/null || true
  set +a
}

deploy_home() {
  printf '%s\n' "${WORKSTATION_DEPLOY_HOME:-$DEPLOY_HOME_DEFAULT}"
}

runtime_dir() {
  if [[ -n "${WORKSTATION_DEPLOY_RUNTIME_DIR:-}" ]]; then
    printf '%s\n' "$WORKSTATION_DEPLOY_RUNTIME_DIR"
    return 0
  fi
  printf '%s/runtime\n' "$(deploy_home)"
}

systemd_env_file() {
  printf '%s/systemd.env\n' "$(deploy_home)"
}

service_name() {
  printf '%s\n' "${WORKSTATION_SYSTEMD_SERVICE_NAME:-$SERVICE_NAME_DEFAULT}"
}

service_unit_path() {
  printf '%s/%s.service\n' "$SYSTEMD_USER_DIR" "$(service_name)"
}

ensure_systemd_user() {
  if ! systemctl --user show-environment >/dev/null 2>&1; then
    echo "systemd --user is not available for the current user session" >&2
    exit 1
  fi
}

npm_install() {
  cd "$REPO_DIR"
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install --prefer-offline
  fi
}

build_app() {
  cd "$REPO_DIR"
  rm -rf .next
  NEXT_TELEMETRY_DISABLED=1 npm run build

  if [[ ! -f "$REPO_DIR/.next/standalone/server.js" ]]; then
    echo "Next standalone build is missing .next/standalone/server.js" >&2
    exit 1
  fi
}

stage_runtime() {
  local target_dir
  target_dir="$(runtime_dir)"

  mkdir -p "$(deploy_home)"
  rm -rf "$target_dir"
  mkdir -p "$target_dir/.next"

  cp -R "$REPO_DIR/.next/standalone/." "$target_dir/"
  cp -R "$REPO_DIR/.next/static" "$target_dir/.next/static"
  if [[ -d "$REPO_DIR/public" ]]; then
    cp -R "$REPO_DIR/public" "$target_dir/public"
  fi
}

write_systemd_env() {
  local node_bin
  node_bin="${WORKSTATION_NODE_BIN:-$(command -v node || true)}"

  if [[ -z "$node_bin" || ! -x "$node_bin" ]]; then
    echo "Unable to resolve node binary for systemd service" >&2
    exit 1
  fi

  mkdir -p "$(deploy_home)"
  cat > "$(systemd_env_file)" <<EOF
WORKSTATION_NODE_BIN=$node_bin
WORKSTATION_DEPLOY_RUNTIME_DIR=$(runtime_dir)
WORKSTATION_DEPLOY_HOME=$(deploy_home)
EOF
}

install_service_unit() {
  mkdir -p "$SYSTEMD_USER_DIR"
  sed "s|__REPO_DIR__|$REPO_DIR|g" "$SYSTEMD_TEMPLATE" > "$(service_unit_path)"
  systemctl --user daemon-reload
  systemctl --user enable "$(service_name).service" >/dev/null
}

restart_service() {
  systemctl --user restart "$(service_name).service"
}

status_service() {
  systemctl --user --no-pager --full status "$(service_name).service"
}

logs_service() {
  local lines="${1:-120}"
  journalctl --user -u "$(service_name).service" -n "$lines" --no-pager
}

build_runtime() {
  load_env_file
  ensure_node_runtime || true
  require_command node
  require_command npm
  npm_install
  build_app
  stage_runtime
  write_systemd_env
}

ci_deploy() {
  load_env_file
  ensure_node_runtime || true
  require_command node
  require_command npm
  require_command systemctl
  ensure_systemd_user
  npm_install
  build_app
  stage_runtime
  write_systemd_env
  install_service_unit
  restart_service
  sleep 2

  if ! systemctl --user --quiet is-active "$(service_name).service"; then
    echo "systemd service failed to become active" >&2
    logs_service 120 || true
    exit 1
  fi

  echo "[deploy] workstation service is active: $(service_name).service"
}

MODE="${1:-ci-deploy}"

case "$MODE" in
  build)
    build_runtime
    ;;
  install-service)
    load_env_file
    ensure_node_runtime || true
    require_command systemctl
    ensure_systemd_user
    write_systemd_env
    install_service_unit
    ;;
  restart)
    load_env_file
    require_command systemctl
    ensure_systemd_user
    restart_service
    ;;
  status)
    load_env_file
    require_command systemctl
    ensure_systemd_user
    status_service
    ;;
  logs)
    load_env_file
    require_command journalctl
    logs_service "${2:-120}"
    ;;
  ci-deploy)
    ci_deploy
    ;;
  *)
    echo "Usage: $0 {build|install-service|restart|status|logs|ci-deploy}" >&2
    exit 1
    ;;
esac