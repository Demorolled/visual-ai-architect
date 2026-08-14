#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# Install System Awareness Daemon as a systemd user service
# ════════════════════════════════════════════════════════════════════════════
#
# This script copies the systemd unit file to ~/.config/systemd/user/ and
# enables/starts the service so the daemon runs on boot.
#
# Usage:
#   ./install-systemd.sh           # Install, enable, and start
#   ./install-systemd.sh --status  # Check service status
#   ./install-systemd.sh --uninstall       # Stop, disable, remove
#   ./install-systemd.sh --logs    # Tail the logs
#
# ════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SERVICE_NAME="system-monitor"
SERVICE_FILE="${SERVICE_NAME}.service"
SYSTEMD_USER_DIR="${HOME}/.config/systemd/user"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DEST="${SYSTEMD_USER_DIR}/${SERVICE_FILE}"

# ═══════════════════════════════════════════════════════════════════════════
# Helper
# ═══════════════════════════════════════════════════════════════════════════

print_step() {
  echo "  → $1"
}

print_header() {
  echo ""
  echo "╔═══════════════════════════════════════════════════════════╗"
  echo "║  $1"
  echo "╚═══════════════════════════════════════════════════════════╝"
}

# ═══════════════════════════════════════════════════════════════════════════
# Actions
# ═══════════════════════════════════════════════════════════════════════════

do_install() {
  print_header "System Awareness Daemon — systemd Install"

  # Ensure the user systemd directory exists
  mkdir -p "${SYSTEMD_USER_DIR}"
  print_step "Ensured ${SYSTEMD_USER_DIR} exists"

  # Copy the service file
  cp "${SCRIPT_DIR}/${SERVICE_FILE}" "${INSTALL_DEST}"
  print_step "Copied ${SERVICE_FILE} → ${INSTALL_DEST}"

  # Reload systemd user daemon
  systemctl --user daemon-reload
  print_step "Reloaded systemd user daemon"

  # Enable the service (starts on boot)
  systemctl --user enable "${SERVICE_NAME}"
  print_step "Enabled ${SERVICE_NAME} (auto-starts on boot)"

  # Start the service now
  if systemctl --user start "${SERVICE_NAME}" 2>&1; then
    print_step "Started ${SERVICE_NAME}"
  else
    print_step "⚠️ Service start reported an error — checking status..."
  fi

  # Wait a moment then verify it's actually running
  sleep 2
  if systemctl --user is-active "${SERVICE_NAME}" &>/dev/null; then
    echo " ✅ Service is active and running!"
  else
    echo " ⚠️ Service is not active. Checking status:"
    systemctl --user status "${SERVICE_NAME}" --no-pager 2>&1 || true
    echo ""
    echo " 💡 Check logs: journalctl --user -u ${SERVICE_NAME} -n 50 --no-pager"
  fi

  echo ""
  echo "    Logs:  journalctl --user -u ${SERVICE_NAME} -f"
  echo "    Stop:   systemctl --user stop ${SERVICE_NAME}"
  echo "    Status: systemctl --user status ${SERVICE_NAME}"
}

do_uninstall() {
  print_header "Uninstalling System Awareness Daemon"

  if systemctl --user is-active "${SERVICE_NAME}" &>/dev/null 2>&1; then
    systemctl --user stop "${SERVICE_NAME}"
    print_step "Stopped ${SERVICE_NAME}"
  fi

  if systemctl --user is-enabled "${SERVICE_NAME}" &>/dev/null 2>&1; then
    systemctl --user disable "${SERVICE_NAME}"
    print_step "Disabled ${SERVICE_NAME}"
  fi

  if [ -f "${INSTALL_DEST}" ]; then
    rm -f "${INSTALL_DEST}"
    print_step "Removed ${INSTALL_DEST}"
    systemctl --user daemon-reload
    print_step "Reloaded systemd user daemon"
  fi

  echo ""
  echo " ✅ Uninstalled successfully!"
}

do_status() {
  print_header "System Awareness Daemon — Status"
  systemctl --user status "${SERVICE_NAME}" --no-pager 2>&1 || echo "  (not installed)"
}

do_logs() {
  echo "Tailing logs for ${SERVICE_NAME}... (Ctrl+C to stop)"
  journalctl --user -u "${SERVICE_NAME}" -f
}

# ═══════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════

case "${1:-}" in
  --install|install|"")
    do_install
    ;;
  --uninstall|uninstall)
    do_uninstall
    ;;
  --status|status)
    do_status
    ;;
  --logs|logs)
    do_logs
    ;;
  --help|help|-h)
    echo "Usage: $0 [--install|--uninstall|--status|--logs|--help]"
    echo ""
    echo "  (no args)  Install, enable, and start the service"
    echo "  --install  Same as above"
    echo "  --uninstall  Stop, disable, and remove the service"
    echo "  --status   Check service status"
    echo "  --logs     Tail journalctl logs"
    ;;
  *)
    echo "Unknown option: $1"
    echo "Usage: $0 [--install|--uninstall|--status|--logs|--help]"
    exit 1
    ;;
esac
