#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# DSpark GGUF Server (OpenAI-compatible) — launcher
#
# Starts the OpenAI-compatible server for qwen2.5-7b-instruct-uncensored
# (target) on port 8000, with an OPTIONAL draft model (qwen2.5-coder:0.5b).
# This is NOT a speculative-decoding accelerator: on llama-cpp-python 0.3.x the
# draft path measures ~parity-to-slower than no draft (~56 vs ~61 tok/s), so
# draft mode is experimental. Uses models already installed in Ollama — no
# downloads.
#
# Draft mode (DSPARK_DRAFT_MODE env, default: none — fastest, ~57-61 tok/s):
#   none   — no drafter (default; fastest).
#   lookup — built-in n-gram drafter, no extra model (~37 tok/s).
#   model  — real drafter (qwen2.5-coder:0.5b). Measured ~56 tok/s vs ~61 with
#            none on the tuned R16 — parity-to-slightly-slower, NO real
#            speedup on this hardware/binding (llama-cpp-python 0.3.x re-evals
#            the full context per draft step). Experimental opt-in via
#            `DSPARK_DRAFT_MODE=model ./scripts/start-dspark.sh --background`.
#
# Usage:
#   ./scripts/start-dspark.sh                  # foreground
#   DSPARK_DRAFT_MODE=none ./scripts/start-dspark.sh --background
#   ./scripts/start-dspark.sh --stop
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")/.."
PORT="${DSPARK_PORT:-8000}"
DRAFT_MODE="${DSPARK_DRAFT_MODE:-none}"
# Optional override: point dspark at a tuned GGUF (abs path or ollama name).
# Priority: DSPARK_TARGET env → persisted scripts/dspark-target.env → stock.
# The env file is written by scripts/deploy-tuned-dspark.sh so ANY launch path
# (including the backend's DSPARK_AUTOSTART) picks up the tuned model.
TARGET="${DSPARK_TARGET:-}"
if [ -z "$TARGET" ] && [ -f "scripts/dspark-target.env" ]; then
  # shellcheck disable=SC1091
  . "scripts/dspark-target.env" 2>/dev/null || true
  TARGET="${DSPARK_TARGET:-}"
fi
TARGET="${TARGET:-qwen2.5-7b-instruct-uncensored:latest}"
LOG_FILE="scripts/dspark.log"
PID_FILE="scripts/dspark.pid"

start_server() {
  echo "🚀 Starting DSpark server on port ${PORT}..."
  echo "   target: ${TARGET}"
  echo "   draft:  qwen2.5-coder:0.5b (380 MB) — mode: ${DRAFT_MODE}"
  exec python3 scripts/dspark_server.py \
    --target "$TARGET" \
    --draft qwen2.5-coder:0.5b \
    --port "$PORT" \
    --n-ctx 16384 \
    --n-gpu-layers -1 \
    --draft-mode "$DRAFT_MODE"
}

case "${1:-}" in
  --background)
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "DSpark server already running (pid $(cat "$PID_FILE"), port ${PORT})."
      exit 0
    fi
    if command -v setsid >/dev/null 2>&1; then
      # Detach into a NEW session (setsid -f) so the server survives the
      # process-group cleanup of a short-lived launching shell. `nohup` alone
      # leaves the child in the launching shell's process group, so it dies
      # with that shell. The pid is written by the detached child (before it
      # execs python) so the pid file always holds the real python pid, never
      # a transient setsid wrapper.
      setsid -f bash -c '
        echo $$ > "$1"
        exec python3 scripts/dspark_server.py \
          --target "$2" \
          --draft qwen2.5-coder:0.5b \
          --port "$3" \
          --n-ctx 16384 \
          --n-gpu-layers -1 \
          --draft-mode "$4" \
          > "$5" 2>&1
      ' _ "$PID_FILE" "$TARGET" "$PORT" "$DRAFT_MODE" "$LOG_FILE"
    else
      nohup python3 scripts/dspark_server.py \
        --target "$TARGET" \
        --draft qwen2.5-coder:0.5b \
        --port "$PORT" \
        --n-ctx 16384 \
        --n-gpu-layers -1 \
        --draft-mode "$DRAFT_MODE" \
        > "$LOG_FILE" 2>&1 &
      echo $! > "$PID_FILE"
    fi
    echo "✅ DSpark server starting in background (mode=${DRAFT_MODE}). Log: $LOG_FILE"
    # Wait until the server is actually healthy so the pid file isn't misleading.
    for _ in $(seq 1 60); do
      if curl -s --max-time 2 "http://127.0.0.1:${PORT}/v1/health" >/dev/null 2>&1; then
        echo "   Health check OK — server ready on port ${PORT}."
        break
      fi
      sleep 5
    done
    ;;
  --stop)
    if [ -f "$PID_FILE" ]; then
      kill "$(cat "$PID_FILE")" 2>/dev/null && echo "Stopped DSpark server." || echo "Not running."
      rm -f "$PID_FILE"
    else
      echo "No DSpark server running."
    fi
    ;;
  *)
    start_server
    ;;
esac
