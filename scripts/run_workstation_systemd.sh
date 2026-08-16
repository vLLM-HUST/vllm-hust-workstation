#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/runtime_secrets.sh"
DEPLOY_HOME="${WORKSTATION_DEPLOY_HOME:-$REPO_DIR/.workstation-deploy}"
SYSTEMD_ENV_FILE="${WORKSTATION_SYSTEMD_ENV_FILE:-$DEPLOY_HOME/systemd.env}"
EXTERNAL_APP_PORT="${APP_PORT:-}"

if [[ -f "$SYSTEMD_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$SYSTEMD_ENV_FILE"
  set +a
fi

if [[ -f "$REPO_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_DIR/.env"
  set +a
fi

validate_workstation_upstream_api_key_source
if [[ -n "${VLLM_HUST_API_KEY_FILE:-}" || -n "${VLLM_HUST_API_KEY_ENV_FILE:-}" ]]; then
  unset VLLM_HUST_API_KEY
fi
load_workstation_admin_token

if [[ -n "$EXTERNAL_APP_PORT" ]]; then
  APP_PORT="$EXTERNAL_APP_PORT"
fi

RUNTIME_DIR="${WORKSTATION_DEPLOY_RUNTIME_DIR:-$DEPLOY_HOME/runtime}"
NODE_BIN="${WORKSTATION_NODE_BIN:-$(command -v node || true)}"

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "Unable to locate node binary for workstation service" >&2
  exit 1
fi

if [[ ! -f "$RUNTIME_DIR/server.js" ]]; then
  echo "Missing runtime entrypoint: $RUNTIME_DIR/server.js" >&2
  exit 1
fi

export NODE_ENV=production
export NEXT_TELEMETRY_DISABLED=1
export HOSTNAME=0.0.0.0
export PORT="${APP_PORT:-3000}"

cd "$RUNTIME_DIR"
exec "$NODE_BIN" server.js
