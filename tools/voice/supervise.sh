#!/usr/bin/env bash
# supervise.sh — keep talk.py alive. Run inside a tmux session.
#   Loops forever: starts talk.py, and if it dies, restarts it after 2s.
#   Crash traces go to tools/voice/talk.crash.log (for silent deaths).
set -u
cd "$(dirname "$0")"

while true; do
  if ! .venv/bin/python -u talk.py >> talk.log 2>>talk.crash.log; then
    echo "[$(date -u +%H:%M:%S)] talk.py exited unexpectedly — restarting in 2s" >> talk.log
    sleep 2
  fi
  # Normal exit (Ctrl+C inside session / clean quit) — brief pause then relaunch
  sleep 1
done
