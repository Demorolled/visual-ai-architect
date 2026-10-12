#!/usr/bin/env bash
# start-agent.sh — launch the remote training worker on the GPU box.
#
#   ./training/remote/start-agent.sh                 # bind 0.0.0.0:8811, one slot per GPU
#   ./training/remote/start-agent.sh --parallel 2     # 2x3060: two jobs at once, a card each
#   ./training/remote/start-agent.sh --port 9000
#   ./training/remote/start-agent.sh --data-dir ~/vaca-agent-data
#
# All arguments are passed through to agent_worker.py. Logs go to
# training/remote/logs/agent-worker.log so the worker can keep running in the
# background on a headless box.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP="$ROOT/llm-training-app"
VENV_PY="$APP/.venv/bin/python"
LOGS="$ROOT/training/remote/logs"
LOG="$LOGS/agent-worker.log"
PORT="${VACA_AGENT_PORT:-8811}"

c_ok()  { printf '\033[32m%s\033[0m\n' "$*"; }
c_bad() { printf '\033[31m%s\033[0m\n' "$*"; }

mkdir -p "$LOGS"

if [ ! -x "$VENV_PY" ]; then
  c_bad "no interpreter at $VENV_PY"
  echo "  create it with:  python3 -m venv --system-site-packages '$APP/.venv'"
  echo "  then:            '$VENV_PY' -m pip install -r '$APP/requirements.txt'"
  exit 1
fi

# torch/transformers/peft are what make real training possible; without them every job
# silently becomes simulated training, which looks like it worked.
if ! "$VENV_PY" -c "import torch, transformers, peft" >/dev/null 2>&1; then
  c_bad "that venv cannot train for real (torch/transformers/peft missing) — jobs would"
  c_bad "run in simulated mode. Install $APP/requirements.txt first."
  exit 1
fi

# Pick a sensible default host: all interfaces, so the LAN can reach it.
ARGS=("$@")
if [[ ! " ${ARGS[*]} " =~ " --host " ]]; then
  ARGS=(--host 0.0.0.0 --port "$PORT" "${ARGS[@]}")
fi

# Report the port we will really bind, not just the default.
EFFECTIVE_PORT="$PORT"
for i in "${!ARGS[@]}"; do
  [ "${ARGS[$i]}" = "--port" ] && EFFECTIVE_PORT="${ARGS[$((i + 1))]:-$PORT}"
done

c_ok "starting the agent worker on $(hostname -I 2>/dev/null | awk '{print $1}'):$EFFECTIVE_PORT"
echo "  app : $APP"
echo "  log : $LOG"
echo

export PYTHONUNBUFFERED=1
exec "$VENV_PY" "$ROOT/training/remote/agent_worker.py" "${ARGS[@]}" 2>&1 | tee -a "$LOG"
