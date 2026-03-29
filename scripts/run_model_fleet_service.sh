#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTANCE_NAME="${1:?missing instance name}"
DEPLOY_HOME="${WORKSTATION_DEPLOY_HOME:-$REPO_DIR/.workstation-deploy}"
INSTANCE_ENV_FILE="$DEPLOY_HOME/model-fleet/instances/${INSTANCE_NAME}.env"

default_tool_call_parser_for_model() {
  local model="${1:-}"
  case "$model" in
    Qwen/Qwen2.5-*|Qwen/QwQ-*) printf 'hermes\n' ;;
    Qwen/Qwen3-Coder-*) printf 'qwen3_xml\n' ;;
    meta-llama/Llama-3.2-*) printf 'pythonic\n' ;;
    meta-llama/Llama-4-*) printf 'llama4_pythonic\n' ;;
    *) printf 'openai\n' ;;
  esac
}

if [[ ! -f "$INSTANCE_ENV_FILE" ]]; then
  echo "Missing instance env file: $INSTANCE_ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$INSTANCE_ENV_FILE"
set +a

if [[ -z "${WORKSTATION_VLLM_SERVE_BIN:-}" || ! -x "${WORKSTATION_VLLM_SERVE_BIN}" ]]; then
  echo "Invalid WORKSTATION_VLLM_SERVE_BIN: ${WORKSTATION_VLLM_SERVE_BIN:-}" >&2
  exit 1
fi

if [[ -n "${WORKSTATION_VLLM_PYTHONPATH:-}" ]]; then
  export PYTHONPATH="$WORKSTATION_VLLM_PYTHONPATH${PYTHONPATH:+:$PYTHONPATH}"
fi

export CUDA_VISIBLE_DEVICES="${MODEL_GPU_INDICES:-${MODEL_GPU_INDEX:?missing MODEL_GPU_INDEX}}"
export VLLM_TARGET_DEVICE=cuda
export HF_HUB_OFFLINE="${HF_HUB_OFFLINE:-1}"
export TRANSFORMERS_OFFLINE="${TRANSFORMERS_OFFLINE:-1}"
export PYTHONNOUSERSITE=1

TOOL_CALL_PARSER="${MODEL_TOOL_CALL_PARSER:-$(default_tool_call_parser_for_model "${MODEL_ID}")}"

SERVE_ARGS=(
  "${MODEL_ID}"
  --host "${MODEL_HOST:-0.0.0.0}"
  --port "${MODEL_PORT:?missing MODEL_PORT}"
  --gpu-memory-utilization "${MODEL_GPU_MEMORY_UTILIZATION:-0.9}"
  --enable-auto-tool-choice
  --tool-call-parser "$TOOL_CALL_PARSER"
)

if [[ -n "${MODEL_TENSOR_PARALLEL_SIZE:-}" && "${MODEL_TENSOR_PARALLEL_SIZE}" != "1" ]]; then
  SERVE_ARGS+=(--tensor-parallel-size "${MODEL_TENSOR_PARALLEL_SIZE}")
fi

exec "$WORKSTATION_VLLM_SERVE_BIN" "${SERVE_ARGS[@]}"