#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-narration.sh — build the narration-enabled frontend and put it into the
# installed desktop app so hovering controls speaks.
#
# The trap this exists to avoid: copying the build is not enough. The frontend
# ships a PWA service worker that precaches the bundle, so the running window
# keeps serving the previous assets and the new code appears to have no effect.
# This script therefore deploys to both locations AND clears the worker, and it
# tells you the bundle hash before and after so "it didn't work" is diagnosable.
#
# Usage:
#   bash docs/narration/deploy-narration.sh
#   bash docs/narration/deploy-narration.sh --no-deploy   # build only
#   bash docs/narration/deploy-narration.sh --runtime DIR # non-default runtime
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FRONTEND="$REPO/frontend"
PAYLOAD_DEFAULT="/home/homellmlab/Desktop/VACAFULL/linux-unpacked/resources/app/payload/frontend/dist"
RUNTIME_DEFAULT="$HOME/.config/Veronica/runtime/frontend/dist"

DEPLOY=1
PAYLOAD_DIST="$PAYLOAD_DEFAULT"
RUNTIME_DIST="$RUNTIME_DEFAULT"

while [ $# -gt 0 ]; do
  case "$1" in
    --no-deploy) DEPLOY=0 ;;
    --payload) PAYLOAD_DIST="${2:?--payload needs a path}"; shift ;;
    --runtime) RUNTIME_DIST="${2:?--runtime needs a path}"; shift ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

bundle_hash() {  # print the main bundle filename under a dist dir
  ls "$1"/assets/main-*.js 2>/dev/null | head -1 | xargs -r basename || true
}

echo "── building frontend with narration enabled"
cd "$FRONTEND"
PATH="$REPO/node_modules/.bin:$PATH" VITE_VACA_NARRATION=1 npm run build

SRC="$FRONTEND/dist"
if ! grep -q "vaca-narration" "$SRC"/assets/main-*.js; then
  echo "✗ narration is NOT in the built bundle — refusing to deploy." >&2
  echo "  (check that VITE_VACA_NARRATION=1 reached vite, and that" >&2
  echo "   src/main.tsx still imports installHoverNarration)" >&2
  exit 1
fi
echo "✓ narration present in built bundle ($(bundle_hash "$SRC"))"

if [ "$DEPLOY" -eq 0 ]; then
  echo "── --no-deploy: stopping after the build"
  exit 0
fi

for DST in "$PAYLOAD_DIST" "$RUNTIME_DIST"; do
  [ -d "$DST" ] || { echo "• skip (missing): $DST"; continue; }
  echo "── deploying → $DST"
  echo "   before: $(bundle_hash "$DST")"
  rm -rf "$DST"
  mkdir -p "$DST"
  cp -a "$SRC/." "$DST/"
  echo "   after:  $(bundle_hash "$DST")"
done

echo
echo "── done. Next:"
echo "   1. restart the app (the service worker must be cleared once):"
echo "        node $REPO/docs/narration/reset-pwa-cache.mjs   # if the app is running with --remote-debugging-port"
echo "      or just quit and relaunch VACA."
echo "   2. verify: node $REPO/docs/narration/verify-hover-cdp.mjs"
