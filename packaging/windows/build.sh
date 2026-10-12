#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# build.sh (Windows) — produce the Windows deliverables for Veronica/VACA.
#
# Output (into this folder):
#   Veronica-Setup-<version>.exe     one-click NSIS installer (x64)
#   win-unpacked/                    the raw app directory (portable: Veronica.exe)
#
# NOTE: an NSIS installer can be produced ON LINUX via wine, which is how this
# repo builds it. wine must be installed (checked below).
#
# Usage:  bash packaging/windows/build.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTRON_DIR="$(cd "$HERE/../electron" && pwd)"

echo "── electron project : $ELECTRON_DIR"
echo "── output dir       : $HERE"
echo

if ! command -v wine >/dev/null 2>&1; then
  echo "ERROR: wine is required to build the Windows installer on Linux." >&2
  echo "       install it, or run this script on Windows instead." >&2
  exit 1
fi
echo "── wine: $(wine --version 2>/dev/null | head -1)"

cd "$ELECTRON_DIR"

if [ ! -d node_modules ]; then
  echo "── installing electron toolchain (first run) ──"
  npm install --no-audit --no-fund
fi

# Compile the app BEFORE staging — `stage-payload.sh` only COPIES what is
# already on disk, so a stale `backend/dist` would otherwise ship silently (see
# the same note in packaging/linux/build.sh).
echo "── compiling backend (tsc → backend/dist) ──"
( cd "$HERE/../../backend" && npm run build )

echo
echo "── compiling frontend (vite → frontend/dist) ──"
( cd "$HERE/../../frontend" && npm run build )

# Always re-stage so the payload matches the current backend/frontend builds.
echo
echo "── staging payload ──"
bash stage-payload.sh

# Gate: never package a payload that cannot boot. Catches missing runtime deps
# (the `typescript` class of bug) before they reach an installer.
echo
echo "── payload smoke test (must pass before packaging) ──"
bash smoke-test.sh

echo
echo "── electron-builder: windows (nsis x64) ──"
npx electron-builder --win --config electron-builder.yml \
  --config.directories.output="$HERE"

echo
echo "── Windows artifacts ──"
ls -lh "$HERE"/*.exe 2>/dev/null || echo "(no artifacts found — check output above)"
