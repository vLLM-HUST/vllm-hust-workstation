#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUN_USER="$(id -un)"
UNIT="vllm-hust-workstation-provenance"
if [[ "$EUID" -eq 0 ]]; then
  echo "Run as the Workstation owner, with non-interactive sudo available" >&2
  exit 1
fi
sudo -n true
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
sed -e "s|__REPO_DIR__|$REPO_DIR|g" -e "s|__USER__|$RUN_USER|g" \
  "$REPO_DIR/deploy/systemd/$UNIT.service.template" > "$tmp_dir/$UNIT.service"
cp "$REPO_DIR/deploy/systemd/$UNIT.timer" "$tmp_dir/$UNIT.timer"
systemd-analyze verify "$tmp_dir/$UNIT.service" "$tmp_dir/$UNIT.timer"
sudo -n install -m 0644 "$tmp_dir/$UNIT.service" "/etc/systemd/system/$UNIT.service"
sudo -n install -m 0644 "$tmp_dir/$UNIT.timer" "/etc/systemd/system/$UNIT.timer"
sudo -n systemctl daemon-reload
sudo -n systemctl enable --now "$UNIT.timer"
# The first receipt does not depend on when the hourly calendar next fires.
sudo -n systemctl start "$UNIT.service"
sudo -n systemctl is-active "$UNIT.timer"
sudo -n systemctl show "$UNIT.service" -p Result -p ExecMainStatus
sudo -n systemctl list-timers "$UNIT.timer" --no-pager
