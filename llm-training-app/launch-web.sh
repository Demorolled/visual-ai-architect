#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$DIR/backend"
PORT=8001

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║    LLM Training Studio (Web)          ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

if ! command -v python3 &>/dev/null; then
  echo "ERROR: Python 3 is required."
  exit 1
fi

echo "→ Starting web server on http://localhost:${PORT} ..."
echo ""

cd "$BACKEND_DIR"
exec python3 -m uvicorn main:app --host 0.0.0.0 --port ${PORT} --reload --log-level info
