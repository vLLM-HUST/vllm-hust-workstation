#!/usr/bin/env bash
# SageLLM Gateway 自动守护进程
# 每 20 秒检查一次：如果 8091 gateway 无 engine，自动找一个健康的重连

GW_PORT=8091
MODEL=Mistral-Small-24B-Instruct-2501
LOGFILE=/tmp/sagellm_watchdog.log
ENGINE_PORTS=(8902 8903 8904 8901)

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOGFILE"; }

gateway_healthy() {
  local status
  status=$(curl -sf --max-time 3 "http://localhost:${GW_PORT}/v1/models" 2>/dev/null)
  [[ -n "$status" && "$status" != *"No healthy"* && "$status" != *"not initialized"* ]]
}

find_healthy_engine() {
  for port in "${ENGINE_PORTS[@]}"; do
    local resp
    resp=$(curl -sf --max-time 3 "http://localhost:${port}/health" 2>/dev/null)
    if echo "$resp" | grep -q '"is_running":true\|"state":"ready"'; then
      echo "$port"; return 0
    fi
  done
  return 1
}

restart_gateway() {
  local engine_port=$1
  log "重启 gateway → engine:${engine_port}"
  pkill -f "sagellm-gateway.*${GW_PORT}" 2>/dev/null
  sleep 2
  SAGELLM_ENGINE_HOST=localhost \
  SAGELLM_ENGINE_PORT=$engine_port \
  SAGELLM_ENGINE_MODEL=$MODEL \
  SAGELLM_ENGINE_ID=workstation-engine \
    sagellm-gateway --port $GW_PORT --log-level warning >> /tmp/sagellm_gateway.log 2>&1 &
  sleep 4
  if gateway_healthy; then
    log "Gateway 恢复正常 ✓ (engine:${engine_port})"
  else
    log "Gateway 重启后仍不健康，下次再试"
  fi
}

log "守护进程启动 (GW=$GW_PORT, 检查间隔 20s)"
while true; do
  if ! gateway_healthy; then
    log "Gateway 无可用 engine，尝试修复..."
    engine_port=$(find_healthy_engine)
    if [[ -n "$engine_port" ]]; then
      restart_gateway "$engine_port"
    else
      log "所有 engine 均不可用，等待下次检查"
    fi
  fi
  sleep 20
done
