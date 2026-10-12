#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# build.sh (Linux) — produce the Linux deliverables for Veronica/VACA.
#
# Output (into this folder):
#   Veronica-<version>.AppImage       portable, no install needed
#   veronica_<version>_amd64.deb      system install (apt/dpkg)
#   linux-unpacked/                   the raw app directory, runnable as-is
#
# Usage:  bash packaging/linux/build.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTRON_DIR="$(cd "$HERE/../electron" && pwd)"

echo "── electron project : $ELECTRON_DIR"
echo "── output dir       : $HERE"
echo

cd "$ELECTRON_DIR"

if [ ! -d node_modules ]; then
  echo "── installing electron toolchain (first run) ──"
  npm install --no-audit --no-fund
fi

# Compile the app BEFORE staging. `stage-payload.sh` only COPIES what is already
# on disk, so without this step the installer silently ships whatever
# `backend/dist` happened to contain at the time. Measured: a source fix that
# passed the whole test suite landed in a payload whose stamp was identical to
# the previous build — i.e. the fix was absent from the installer while every
# check appeared green. The stamp is a hash of `backend/dist`, so building here
# also guarantees the stamp actually reflects the code that ships.
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
echo "── electron-builder: linux (AppImage + deb) ──"
npx electron-builder --linux --config electron-builder.yml \
  --config.directories.output="$HERE"

echo
echo "── Linux artifacts ──"
ls -lh "$HERE"/*.AppImage "$HERE"/*.deb 2>/dev/null || echo "(no artifacts found — check output above)"
