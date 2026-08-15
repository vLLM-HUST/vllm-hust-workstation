#!/usr/bin/env bash

read_workstation_named_secret() {
  local secret_file="$1"
  local secret_env_file="$2"
  local secret_env_name="$3"

  if [[ -n "$secret_file" ]]; then
    if [[ ! -r "$secret_file" ]]; then
      echo "Configured workstation secret file is not readable" >&2
      return 1
    fi
    IFS= read -r REPLY < "$secret_file"
  elif [[ -n "$secret_env_file" ]]; then
    if [[ ! -r "$secret_env_file" ]]; then
      echo "Configured workstation secret env file is not readable" >&2
      return 1
    fi
    if [[ ! "$secret_env_name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      echo "Configured workstation secret env name is invalid" >&2
      return 1
    fi
    REPLY="$({
      set -a
      # shellcheck disable=SC1090
      source "$secret_env_file"
      printf '%s' "${!secret_env_name:-}"
    })"
  else
    REPLY=""
  fi
}

# Resolve only the upstream API key and optional administrator token required
# by workstation. Trusted source files are evaluated in subshells so unrelated
# settings never leak into the workstation process.
load_workstation_upstream_api_key() {
  read_workstation_named_secret \
    "${VLLM_HUST_API_KEY_FILE:-}" \
    "${VLLM_HUST_API_KEY_ENV_FILE:-}" \
    "${VLLM_HUST_API_KEY_ENV_NAME:-VLLM_HUST_API_KEY}"
  if [[ -n "$REPLY" ]]; then
    VLLM_HUST_API_KEY="$REPLY"
  fi

  if [[ -z "${VLLM_HUST_API_KEY:-}" ]]; then
    echo "Configured workstation upstream API key source is empty" >&2
    return 1
  fi
  export VLLM_HUST_API_KEY

  read_workstation_named_secret \
    "${WORKSTATION_ADMIN_TOKEN_FILE:-}" \
    "${WORKSTATION_ADMIN_TOKEN_ENV_FILE:-}" \
    "${WORKSTATION_ADMIN_TOKEN_ENV_NAME:-WORKSTATION_ADMIN_TOKEN}"
  if [[ -n "$REPLY" ]]; then
    WORKSTATION_ADMIN_TOKEN="$REPLY"
    export WORKSTATION_ADMIN_TOKEN
  fi
}
