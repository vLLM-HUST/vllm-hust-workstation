#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="${WORKSTATION_PROVENANCE_ENV_FILE:-$REPO_DIR/.env}"
if [[ -f "$CONFIG_FILE" ]]; then
  # Only the trusted Workstation deployment config is sourced; no keys are logged.
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
fi
DEPLOY_DIR="${WORKSTATION_DEPLOY_HOME:-$REPO_DIR/.workstation-deploy}"
RECEIPT_FILE="${WORKSTATION_RUNTIME_PROVENANCE_FILE:-$DEPLOY_DIR/runtime-provenance.json}"
STATUS_FILE="${RECEIPT_FILE%.json}.refresh-status.json"
mkdir -p "$(dirname "$STATUS_FILE")"

record_status() {
  python3 - "$STATUS_FILE" "$1" "$2" <<'PY'
import datetime
import json
import os
import sys
import tempfile
from pathlib import Path

path = Path(sys.argv[1])
try:
    previous = json.loads(path.read_text())
except (OSError, ValueError):
    previous = {}
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
data = dict(schema='vllm-hust.receipt-refresh/v1', result=sys.argv[2],
            attemptedAt=now, exitCode=int(sys.argv[3]),
            lastSuccessAt=now if sys.argv[2] == 'success' else previous.get('lastSuccessAt'))
with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, prefix=path.name+'.', delete=False) as f:
    json.dump(data, f, indent=2)
    f.write('\n')
    temporary = f.name
os.chmod(temporary, 0o644)
os.replace(temporary, path)
PY
}

on_failure() {
  local code=$?
  trap - ERR
  record_status failure "$code" || true
  logger -p user.err -t workstation-provenance "Receipt refresh failed (exit $code); inspect the provenance service journal" || true
  exit "$code"
}
trap on_failure ERR

timeout --signal=TERM --kill-after=5s 60s bash "$SCRIPT_DIR/capture_runtime_provenance.sh" \
  "${WORKSTATION_RUNTIME_CONTAINER:-}" "$RECEIPT_FILE"
record_status success 0
echo "Receipt refresh verified and saved"
