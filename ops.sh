#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_SCRIPT="$SCRIPT_DIR/scripts/manage_public_stack.sh"

usage() {
  cat <<'EOF'
Usage: ./ops.sh [command]

默认不带参数时进入统一运维菜单。

快捷命令：
  menu, status, logs
  deploy-backend, restart-backend
  deploy-workstation, restart-workstation
  deploy-website, restart-website
  deploy-ui, restart-ui
  restart-all

便捷别名：
  backend        -> deploy-backend
  backend-restart -> restart-backend
  workstation    -> deploy-workstation
  workstation-restart -> restart-workstation
  website        -> deploy-website
  website-restart -> restart-website
  ui             -> deploy-ui
  ui-restart     -> restart-ui
  all            -> restart-all
EOF
}

main() {
  local command="${1:-menu}"

  if [[ ! -x "$STACK_SCRIPT" ]]; then
    echo "Missing stack script: $STACK_SCRIPT" >&2
    exit 1
  fi

  case "$command" in
    menu|status|logs|deploy-backend|restart-backend|deploy-workstation|restart-workstation|deploy-website|restart-website|deploy-ui|restart-ui|restart-all)
      exec "$STACK_SCRIPT" "$command"
      ;;
    backend)
      exec "$STACK_SCRIPT" deploy-backend
      ;;
    backend-restart)
      exec "$STACK_SCRIPT" restart-backend
      ;;
    workstation)
      exec "$STACK_SCRIPT" deploy-workstation
      ;;
    workstation-restart)
      exec "$STACK_SCRIPT" restart-workstation
      ;;
    website)
      exec "$STACK_SCRIPT" deploy-website
      ;;
    website-restart)
      exec "$STACK_SCRIPT" restart-website
      ;;
    ui)
      exec "$STACK_SCRIPT" deploy-ui
      ;;
    ui-restart)
      exec "$STACK_SCRIPT" restart-ui
      ;;
    all)
      exec "$STACK_SCRIPT" restart-all
      ;;
    -h|--help|help)
      usage
      ;;
    *)
      echo "Unknown command: $command" >&2
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"