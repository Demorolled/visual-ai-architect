#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"

echo "  ╔══════════════════════════════════════╗"
echo "  ║       LLM Training Studio            ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

if ! command -v python3 &>/dev/null; then
  echo "ERROR: Python 3 is required."
  exit 1
fi

echo "→ Installing dependencies..."
pip3 install -q -r "$DIR/requirements.txt" 2>&1 | tail -1

echo "→ Launching..."
echo ""

cd "$DIR"
exec python3 app.py
