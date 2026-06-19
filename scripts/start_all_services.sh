#!/usr/bin/env bash
# start_all_services.sh — One-command startup for the workstation stack.
#
# Brings up:
#   1. vLLM model service (via vllm-hust-dev-hub launch script)
#   2. vllm-hust-workstation (Next.js frontend)
#   3. Cloudflare tunnel (cloudflared-sage-local-235b)
#
# Usage:
#   bash scripts/start_all_services.sh [--preset coder|w8a8] [--docker CONTAINER]
#                                        [--skip-model] [--skip-ws] [--skip-tunnel]
#                                        [--health-timeout SECS]
#
# Prerequisites:
#   - Docker container running with NPU devices (for model service)
#   - Cloudflare tunnel systemd unit configured with token-based ExecStart

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEV_HUB_DIR="$HOME/vllm-hust-dev-hub"

# ── defaults ────────────────────────────────────────────────────────────────
PRESET="${PRESET:-coder}"
DOCKER_CONTAINER="${DOCKER_CONTAINER:-vllm_hust_ws_21rc}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-600}"
SKIP_MODEL=0
SKIP_WS=0
SKIP_TUNNEL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --preset)         PRESET="$2"; shift 2 ;;
    --docker)         DOCKER_CONTAINER="$2"; shift 2 ;;
    --health-timeout) HEALTH_TIMEOUT="$2"; shift 2 ;;
    --skip-model)     SKIP_MODEL=1; shift ;;
    --skip-ws)        SKIP_WS=1; shift ;;
    --skip-tunnel)    SKIP_TUNNEL=1; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

ok()   { echo -e "\033[32m[OK]\033[0m   $*"; }
warn() { echo -e "\033[33m[WARN]\033[0m $*"; }
fail() { echo -e "\033[31m[FAIL]\033[0m $*"; }
step() { echo -e "\n\033[1;34m━━━ $* ━━━\033[0m"; }

ERRORS=0

# ═══════════════════════════════════════════════════════════════════════════
# Step 1: Model service
# ═══════════════════════════════════════════════════════════════════════════
if (( SKIP_MODEL == 0 )); then
  step "1/3  Model service (preset=$PRESET, docker=$DOCKER_CONTAINER)"

  LAUNCH_SCRIPT="$DEV_HUB_DIR/scripts/launch_ascend_model_service.sh"
  if [[ ! -f "$LAUNCH_SCRIPT" ]]; then
    fail "Launch script not found at $LAUNCH_SCRIPT"
    ERRORS=$((ERRORS + 1))
  elif curl -fsS -m 5 http://127.0.0.1:8000/health >/dev/null 2>&1; then
    ok "Model service already healthy on :8000"
  else
    echo "Launching model service..."
    bash "$LAUNCH_SCRIPT" \
      --preset "$PRESET" \
      --docker "$DOCKER_CONTAINER" \
      --health-timeout "$HEALTH_TIMEOUT" \
      --no-health-check &
    LAUNCH_PID=$!

    echo "Waiting for health check (timeout=${HEALTH_TIMEOUT}s)..."
    DEADLINE=$((SECONDS + HEALTH_TIMEOUT))
    until curl -fsS -m 5 http://127.0.0.1:8000/health >/dev/null 2>&1; do
      if (( SECONDS >= DEADLINE )); then
        fail "Model service did not become healthy within ${HEALTH_TIMEOUT}s"
        ERRORS=$((ERRORS + 1))
        break
      fi
      sleep 5
    done
    if curl -fsS -m 5 http://127.0.0.1:8000/health >/dev/null 2>&1; then
      ok "Model service healthy on :8000"
    fi
    wait "$LAUNCH_PID" 2>/dev/null || true
  fi
else
  warn "Skipping model service (--skip-model)"
fi

# ═══════════════════════════════════════════════════════════════════════════
# Step 2: Workstation
# ═══════════════════════════════════════════════════════════════════════════
if (( SKIP_WS == 0 )); then
  step "2/3  Workstation (vllm-hust-workstation)"

  if [[ -d "$REPO_ROOT" ]]; then
    export PATH="$HOME/miniconda3/bin:$PATH"
    cd "$REPO_ROOT"
    bash scripts/deploy_workstation.sh restart 2>&1 | tail -3

    sleep 3

    if systemctl --user is-active --quiet vllm-hust-workstation.service; then
      ok "vllm-hust-workstation: running on :3001"
    else
      fail "vllm-hust-workstation: not running"
      ERRORS=$((ERRORS + 1))
    fi
  else
    warn "vllm-hust-workstation not found at $REPO_ROOT — skipping"
  fi
else
  warn "Skipping workstation (--skip-ws)"
fi

# ═══════════════════════════════════════════════════════════════════════════
# Step 3: Cloudflare tunnel
# ═══════════════════════════════════════════════════════════════════════════
if (( SKIP_TUNNEL == 0 )); then
  step "3/3  Cloudflare tunnel (cloudflared-sage-local-235b)"

  if systemctl --user is-active --quiet cloudflared-sage-local-235b.service; then
    ok "cloudflared-sage-local-235b: already running"
  else
    systemctl --user start cloudflared-sage-local-235b.service 2>&1 || true
    sleep 2
    if systemctl --user is-active --quiet cloudflared-sage-local-235b.service; then
      ok "cloudflared-sage-local-235b: started"
    else
      fail "cloudflared-sage-local-235b: failed to start"
      journalctl --user -u cloudflared-sage-local-235b.service --no-pager -n 3 2>&1
      ERRORS=$((ERRORS + 1))
    fi
  fi
else
  warn "Skipping tunnel (--skip-tunnel)"
fi

# ═══════════════════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════════════════
step "Summary"

echo "  Model service:  http://127.0.0.1:8000"
echo "  Workstation:    http://127.0.0.1:3001"
echo "  WS external:    https://ws.sage.org.ai"

if (( ERRORS > 0 )); then
  fail "$ERRORS service(s) failed to start"
  exit 1
else
  ok "All services started successfully"
fi
