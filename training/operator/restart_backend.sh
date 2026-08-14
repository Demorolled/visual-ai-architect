#!/bin/bash
# Restart the VACA backend (tsx src/index.ts) and wait until /api/health is 200.
# Used by run_operator.py when the backend dies mid-ladder (the 01:41 infra
# outage that turned 43 builds into bogus generation-failed entries).
set -u
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT" || exit 1
pkill -f '[t]sx src/index.ts' 2>/dev/null
sleep 3
(
  cd "$ROOT/backend"
  setsid -f npx tsx src/index.ts > "$ROOT/scripts/backend.log" 2>&1 </dev/null
) &
for i in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:3001/api/health 2>/dev/null)
  if [ "$code" = "200" ]; then
    echo "backend up after ${i}s"
    exit 0
  fi
  sleep 2
done
echo "backend did not come up"
tail -20 "$ROOT/scripts/backend.log"
exit 1
