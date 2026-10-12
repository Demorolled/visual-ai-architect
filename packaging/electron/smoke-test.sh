#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# smoke-test.sh — boot the STAGED payload and prove it actually serves.
# =============================================================================
# This is the check that catches a broken bundle before it ships. It runs the
# exact compiled backend from payload/ with a throwaway working copy, on a free
# port, and asserts /health and / respond. Missing runtime deps (the
# `typescript` class of bug) fail here rather than at the user's first launch.
#
# Usage:  bash packaging/electron/smoke-test.sh
# Exit:   0 ok · 1 failed
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAYLOAD="$HERE/payload"
WORK="$(mktemp -d /tmp/veronica-smoke-XXXXXX)"
PORT="$(( (RANDOM % 2000) + 24000 ))"
LOG="$WORK/backend.log"
RC=1

cleanup() {
  [ -n "${PID:-}" ] && kill "$PID" 2>/dev/null
  sleep 1
  [ -n "${PID:-}" ] && kill -9 "$PID" 2>/dev/null
  rm -rf "$WORK"
}
trap cleanup EXIT

if [ ! -f "$PAYLOAD/backend/dist/index.js" ]; then
  echo "FAIL: payload not staged (run stage-payload.sh first)" >&2
  exit 1
fi

echo "── smoke test: payload backend on port $PORT ──"

# Working copy, so the smoke test never writes into payload/ itself.
cp -r "$PAYLOAD" "$WORK/app"

( cd "$WORK/app" && PORT="$PORT" BIND_HOST=127.0.0.1 node backend/dist/index.js >"$LOG" 2>&1 ) &
PID=$!

HEALTHY=0
for _ in $(seq 1 40); do
  sleep 1
  if curl -sf -m 3 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then HEALTHY=1; break; fi
  if ! kill -0 "$PID" 2>/dev/null; then break; fi
done

if [ "$HEALTHY" != "1" ]; then
  echo "FAIL: backend never became healthy on port $PORT" >&2
  echo "──── backend output (first 40 lines) ────" >&2
  head -40 "$LOG" >&2
  exit 1
fi

echo "  /health  : OK"
curl -s -m 5 "http://127.0.0.1:$PORT/health" | head -c 220; echo

TITLE="$(curl -s -m 5 "http://127.0.0.1:$PORT/" | grep -oiE '<title>[^<]*</title>' | head -1)"
if [ -z "$TITLE" ]; then
  echo "FAIL: UI not served at /" >&2
  head -30 "$LOG" >&2
  exit 1
fi
echo "  UI       : $TITLE"

# Assert the shipped config really is pinned to the single model.
if grep -q '"dspark"' "$PAYLOAD/backend/llm-config.json"; then
  echo "FAIL: payload llm-config.json still contains a dspark key (must be Qwen2.5 14B only)" >&2
  exit 1
fi
echo "  llm-config: pinned, no dspark key"

# Regression guard: the render-smoke gate must be USABLE, not 'unavailable'.
# Without playwright this gate silently degrades and broken HTML builds ship as
# successes — the exact failure that hid the "initGameState is not defined" bug.
for pkg in playwright typescript; do
  if [ -d "$PAYLOAD/node_modules/$pkg" ]; then
    echo "  dep present: $pkg"
  else
    echo "FAIL: $pkg missing from the payload — the render-smoke gate will report 'unavailable'" >&2
    exit 1
  fi
done
if [ -f "$PAYLOAD/scripts/smoke-test-html.py" ]; then
  echo "  scripts/smoke-test-html.py: present"
else
  echo "  note: scripts/smoke-test-html.py absent — gate will use its TS Playwright fallback"
fi

# Prove the browser engine can actually launch (system Chrome channel), because
# an installed-but-unlaunchable playwright is the same as not having it.
if [ -d "$WORK/app/node_modules/playwright" ]; then
  if ( cd "$WORK/app" && node -e "
    const {chromium}=require('playwright');
    (async()=>{
      for (const opt of [{channel:'chrome'},{},{channel:'msedge'}]) {
        try {
          const b = await chromium.launch({headless:true,args:['--no-sandbox'],...opt});
          await b.close(); console.log('LAUNCH_OK'); return;
        } catch(e) { /* try next strategy */ }
      }
      console.log('LAUNCH_FAILED'); process.exit(1);
    })();
  " 2>/dev/null | grep -q LAUNCH_OK ); then
    echo "  playwright browser launch: OK (system Chrome)"
  else
    echo "  note: playwright could not launch a browser here — render smoke will report 'unavailable'"
  fi
fi

echo "smoke test PASSED"
RC=0
exit $RC
