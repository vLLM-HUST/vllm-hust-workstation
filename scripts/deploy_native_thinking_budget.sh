#!/usr/bin/env bash
# One approved, reversible A100-only cutover; never restart a remote backend.
set -euo pipefail

candidate=${1:?clean canonical release directory required}
expected_commit=${2:?40-character canonical release commit required}
expected_pid=${3:?observed original engine PID required}
mode=${4:-thinking-budget}
case "$mode" in
  thinking-budget) dropname=90-native-thinking.conf ;;
  reasoning-repetition) dropname=95-native-reasoning-repetition.conf ;;
  *) printf 'Unsupported native deployment mode\n' >&2; exit 2 ;;
esac
[[ "$candidate" =~ ^/home/shuhao/vllm-hust-releases/[A-Za-z0-9._-]+$ ]]
[[ "$expected_commit" =~ ^[0-9a-f]{40}$ ]]
[[ "$expected_pid" =~ ^[0-9]+$ ]]
unit=vllm-hust-qwen35-engine.service
[[ $(systemctl --user show "$unit" -p MainPID --value) == "$expected_pid" ]]
[[ $(git -C "$candidate" rev-parse HEAD) == "$expected_commit" ]]
[[ -z $(git -C "$candidate" status --porcelain --untracked-files=no) ]]
origin=$(git -C "$candidate" config --get remote.origin.url)
[[ "$origin" == https://github.com/vLLM-HUST/vllm-hust.git ]]
dropdir=/home/shuhao/.config/systemd/user/vllm-hust-qwen35-engine.service.d
dropfile="$dropdir/$dropname"
[[ ! -e "$dropfile" ]] # Do not overwrite an existing deployment.
audit=$(mktemp -d /home/shuhao/ws-thinking-cutover.XXXXXX)
chmod 700 "$audit"
systemctl --user cat "$unit" > "$audit/original-unit.txt"
systemctl --user show sage-codex-router.service sage-mate-app.service \
  vllm-hust-workstation.service -p Id -p MainPID > "$audit/other-pids.before"

# Admit only at a stable idle boundary. Recheck immediately before restart.
for sample in 1 2 3; do
  printf 'Idle guard %s/3\n' "$sample"
  metrics=$(curl --noproxy '*' --fail --silent --max-time 5 \
    http://127.0.0.1:18000/metrics)
  awk '/^vllm:num_requests_(running|waiting)[{ ]/ { seen++; if ($NF != 0) bad=1 }
       END { exit (!seen || bad) }' <<< "$metrics"
  curl --noproxy '*' --fail --silent --max-time 5 \
    http://11.11.11.30:8000/health > /dev/null
  sleep 1
done
mkdir -p "$dropdir"
printf '[Service]\nRestart=no\nWorkingDirectory=%s\nEnvironment=PYTHONPATH=%s\nExecStart=\n' \
  "$candidate" "$candidate" > "$audit/candidate.conf"
printf '%s' 'ExecStart=/home/shuhao/miniforge3/envs/vllm-hust-canonical-overlay-qwen38/bin/python -m vllm.entrypoints.cli.main serve /home/shuhao/models/Qwen--Qwen3.5-35B-A3B --host 127.0.0.1 --port 18000 --served-model-name Qwen/Qwen3.5-35B-A3B --tensor-parallel-size 2 --gpu-memory-utilization 0.88 --max-model-len 131072 --max-num-seqs 8 --dtype auto --reasoning-parser qwen3 --enable-auto-tool-choice --tool-call-parser qwen3_coder --override-generation-config '\''{"thinking_token_budget":16384}'\''' >> "$audit/candidate.conf"
if [[ "$mode" == reasoning-repetition ]]; then
  printf '%s' ' --logits-processors vllm.v1.sample.logits_processor.reasoning_repetition:ReasoningRepetitionLogitsProcessor --additional-config '\''{"reasoning_repetition_guard":{"ngram_size":32,"max_occurrences":3,"window_size":512}}'\''' >> "$audit/candidate.conf"
fi
printf '\n' >> "$audit/candidate.conf"
install -m 600 "$audit/candidate.conf" "$dropfile"
activated=0
watch_pid=
cleanup() {
  if [[ -n "$watch_pid" ]]; then kill "$watch_pid" 2>/dev/null || true; fi
  if [[ "$activated" == 0 ]]; then
    # Recoverable removal: preserve the failed drop-in beside the audit receipt.
    if [[ -f "$dropfile" ]]; then mv "$dropfile" "$audit/failed-candidate.conf"; fi
    systemctl --user daemon-reload
    systemctl --user restart "$unit"
    printf 'ROLLED BACK; inspect %s\n' "$audit" >&2
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
(
  while true; do
    date -u +%FT%TZ
    curl --noproxy '*' --silent --output /dev/null --max-time 5 \
      --write-out 'A6000 health HTTP %{http_code}\n' http://11.11.11.30:8000/health
    sleep 3
  done
) > "$audit/a6000-health.log" 2>&1 &
watch_pid=$!
date -u +%FT%TZ > "$audit/started-at"
systemctl --user daemon-reload
systemctl --user restart "$unit"
ready=0
for attempt in $(seq 1 240); do
  printf 'Readiness attempt %s/240\n' "$attempt"
  [[ $(systemctl --user show "$unit" -p ActiveState --value) != failed ]]
  if curl --noproxy '*' --fail --silent --max-time 2 \
    http://127.0.0.1:18000/health > /dev/null; then ready=1; break; fi
  sleep 2
done
[[ "$ready" == 1 ]]
# Restore the original crash-recovery policy without restarting the engine.
sed -i '/^Restart=no$/d' "$dropfile"
systemctl --user daemon-reload
curl --noproxy '*' --fail --silent --max-time 5 \
  http://11.11.11.30:8000/health > /dev/null
systemctl --user show sage-codex-router.service sage-mate-app.service \
  vllm-hust-workstation.service -p Id -p MainPID > "$audit/other-pids.after"
cmp "$audit/other-pids.before" "$audit/other-pids.after"
systemctl --user show "$unit" -p MainPID -p ActiveState > "$audit/engine.after"
date -u +%FT%TZ > "$audit/ready-at"
activated=1
printf 'A100 READY; audit=%s\n' "$audit"
