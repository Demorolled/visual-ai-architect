#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
# VACA Backend Watchdog
# =====================
# Starts the backend server and auto-restarts it if it crashes.
# Logs all crash events to crash.log with timestamps.
#
# Usage:
#   ./start.sh              — Start with watchgod (auto-restart on crash)
#   ./start.sh --once       — Start without watchgod (single run)
#   ./start.sh --dev        — Start with tsx watch for development
#   ./start.sh --kill       — Kill any running backend on port 3001
# ═════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$SCRIPT_DIR"
CRASH_LOG="$BACKEND_DIR/crash.log"
PORT="${PORT:-3001}"
MAX_RESTARTS="${MAX_RESTARTS:-10}"    # Max restarts before giving up
RESTART_WINDOW="${RESTART_WINDOW:-300}" # Reset restart counter after 5 min of uptime

log() {
  echo "[$(date '+%H:%M:%S')] $*"
}

# ─── Kill existing backend on the port ──
kill_existing() {
  local pid
  pid=$(lsof -ti :"$PORT" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    log "🔫 Killing existing backend (PID: $pid) on port $PORT..."
    kill "$pid" 2>/dev/null || true
    sleep 1
    # Force kill if still alive
    pid=$(lsof -ti :"$PORT" 2>/dev/null || true)
    if [ -n "$pid" ]; then
      kill -9 "$pid" 2>/dev/null || true
      sleep 1
    fi
    log "✅ Port $PORT freed"
  fi
}

# ─── Start the backend ──
start_backend() {
  log "🚀 Starting VACA backend on port $PORT..."
  log "   CWD: $BACKEND_DIR"
  log "   Log: $BACKEND_DIR/server.log"
  log "   Crash Log: $CRASH_LOG"

  cd "$BACKEND_DIR"

  # Use tsx for TypeScript execution
  npx tsx src/index.ts >> "$BACKEND_DIR/server.log" 2>&1
  local exit_code=$?

  if [ $exit_code -ne 0 ]; then
    log "💥 Backend exited with code $exit_code"
    echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] Backend crashed with exit code $exit_code" >> "$CRASH_LOG"
  fi

  return $exit_code
}

# ─── Watchdog loop ──
watchdog_loop() {
  local restart_count=0
  local first_start_time=$(date +%s)

  mkdir -p "$BACKEND_DIR"
  touch "$CRASH_LOG"

  while true; do
    log "📡 Starting backend instance..."
    local start_time=$(date +%s)

    # Reset restart counter if the server has been up for the window duration
    if [ $((start_time - first_start_time)) -gt "$RESTART_WINDOW" ]; then
      restart_count=0
      first_start_time=$start_time
      log "🔄 Restart counter reset (uptime exceeded ${RESTART_WINDOW}s window)"
    fi

    # Check restart limit
    if [ "$restart_count" -ge "$MAX_RESTARTS" ]; then
      log "❌ Max restarts ($MAX_RESTARTS) reached in the last $RESTART_WINDOW seconds."
      log "   Manual intervention required. Check $CRASH_LOG for details."
      echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] FATAL: Max restarts ($MAX_RESTARTS) reached. Giving up." >> "$CRASH_LOG"
      exit 1
    fi

    # Start backend
    start_backend
    local exit_code=$?

    # Check if it was a clean shutdown (exit 0 or SIGTERM)
    if [ $exit_code -eq 0 ] || [ $exit_code -eq 143 ] || [ $exit_code -eq 130 ]; then
      log "🛑 Backend stopped cleanly (exit code $exit_code)"
      exit 0
    fi

    # Crash detected
    restart_count=$((restart_count + 1))
    local uptime=$(( $(date +%s) - start_time ))
    log "💥 Backend crashed after ${uptime}s (restart #$restart_count/$MAX_RESTARTS)"
    echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] Crash #$restart_count — uptime: ${uptime}s — exit: $exit_code" >> "$CRASH_LOG"

    # Tail the last few lines of the server log for context
    if [ -f "$BACKEND_DIR/server.log" ]; then
      log "📋 Last 5 lines of server.log:"
      tail -5 "$BACKEND_DIR/server.log" | while read -r line; do log "   $line"; done
    fi

    # Wait before restarting (avoid rapid crash loops)
    local wait_time=$(( restart_count * 2 ))
    wait_time=$(( wait_time > 15 ? 15 : wait_time ))
    log "⏳ Restarting in ${wait_time}s..."
    sleep "$wait_time"
  done
}

# ─── Main ──

case "${1:-}" in
  --kill)
    kill_existing
    exit 0
    ;;
  --once)
    kill_existing
    start_backend
    exit $?
    ;;
  --dev)
    kill_existing
    log "📡 Starting in dev mode with tsx watch..."
    cd "$BACKEND_DIR"
    npx tsx watch src/index.ts
    exit $?
    ;;
  *)
    kill_existing
    watchdog_loop
    ;;
esac
