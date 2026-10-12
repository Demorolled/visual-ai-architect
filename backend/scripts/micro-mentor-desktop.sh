#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Micro Code-Mentor launcher — the idle self-improvement / reward-loop design.
#
# This is the DESKTOP START for the design that builds micro-apps, verifies a
# baseline, then has a 2nd LLM grade+suggest (reward) each rewrite until it
# plateaus. It is OFF by default; launch it here to run the loop manually.
#
# What it does:
#   1. Ensure the VACA backend is running (experimenter service).
#   2. Build the micro-app catalog (baseline → improved) for the current round.
#   3. Optional: grade each accepted improvement with a 2nd LLM (judge).
#
# Usage:
#   bash scripts/micro-mentor-desktop.sh              # start loop w/ backend
#   bash scripts/micro-mentor-desktop.sh --catalog    # build all catalog apps
#   bash scripts/micro-mentor-desktop.sh --status     # show loop status
#   bash scripts/micro-mentor-desktop.sh --one        # run ONE micro-app experiment
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="${VACA_BACKEND_URL:-http://127.0.0.1:3001}"

export PATH="$HOME/.local/bin:$PATH"

echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║        VACA · Micro Code-Mentor              ║"
echo "  ║   build → verify → 2nd-LLM grade → reward    ║"
echo "  ╚══════════════════════════════════════════════╝"
echo ""

case "${1:-}" in
  --status)
    echo "→ Loop status..."
    curl -s -m 6 "$BACKEND/api/experiments/status" | python3 -m json.tool 2>/dev/null || echo "❌ backend not reachable at $BACKEND"
    ;;
  --one)
    echo "→ Running ONE micro-app experiment..."
    echo "   (baseline build + verified rewrite rounds + reward)"
    curl -s -m 60 -X POST "$BACKEND/api/experiments/run" -H "Content-Type: application/json" -d '{}' \
      | python3 -m json.tool 2>/dev/null || echo "❌ run failed / backend unreachable"
    ;;
  --catalog)
    echo "→ Building the full micro-app catalog (all mock-up projects)..."
    curl -s -m 60 -X POST "$BACKEND/api/experiments/build-catalog" -H "Content-Type: application/json" -d '{}' \
      | python3 -m json.tool 2>/dev/null || echo "❌ catalog build failed / backend unreachable"
    ;;
  *)
    echo "→ Starting the VACA backend (if not already running)..."
    if ! curl -s -m 4 "$BACKEND/api/health" >/dev/null 2>&1; then
      echo "   Backend not detected — launching..."
      cd "$DIR/backend"
      setsid bash -c "npx tsx src/index.ts > /tmp/vaca-mentor.log 2>&1" < /dev/null > /dev/null 2>&1 &
      sleep 20
    fi
    echo "   Backend: $([ $? -eq 0 ] && echo 'reacting' || echo 'started')  → $BACKEND"
    echo ""
    echo "Use one of:  --status | --one | --catalog"
    echo "  (the idle autopilot is OFF by default — run manually or set"
    echo "   IDLE_EXPERIMENTER_ENABLED=1 in backend/.env to re-enable the loop)"
    ;;
esac