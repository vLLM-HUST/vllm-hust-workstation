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

# Validate the configured source without exporting its value. The long-lived
# Next.js process uses this path and resolves the current value with an
# inode/size/mtime cache, so key rotation needs no workstation restart.
validate_workstation_upstream_api_key_source() {
  read_workstation_named_secret \
    "${VLLM_HUST_API_KEY_FILE:-}" \
    "${VLLM_HUST_API_KEY_ENV_FILE:-}" \
    "${VLLM_HUST_API_KEY_ENV_NAME:-VLLM_HUST_API_KEY}"
  if [[ -z "$REPLY" && -z "${VLLM_HUST_API_KEY:-}" ]]; then
    echo "Configured workstation upstream API key source is empty" >&2
    return 1
  fi
}

# Export the resolved value only for short-lived operator commands that call
# the upstream directly. Do not use this in the long-lived workstation server.
load_workstation_upstream_api_key() {
  validate_workstation_upstream_api_key_source
  if [[ -n "$REPLY" ]]; then
    VLLM_HUST_API_KEY="$REPLY"
  fi
  export VLLM_HUST_API_KEY

  load_workstation_admin_token
}

load_workstation_admin_token() {
  read_workstation_named_secret \
    "${WORKSTATION_ADMIN_TOKEN_FILE:-}" \
    "${WORKSTATION_ADMIN_TOKEN_ENV_FILE:-}" \
    "${WORKSTATION_ADMIN_TOKEN_ENV_NAME:-WORKSTATION_ADMIN_TOKEN}"
  if [[ -n "$REPLY" ]]; then
    WORKSTATION_ADMIN_TOKEN="$REPLY"
    export WORKSTATION_ADMIN_TOKEN
  fi
}
