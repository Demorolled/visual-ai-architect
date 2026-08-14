#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
API_PORT=8001
UI_PORT=8088

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║    LLM Training Studio               ║"
echo "  ╚══════════════════════════════════════╝"
echo ""
echo "→ API:  http://localhost:${API_PORT}/docs"
echo "→ UI:   http://localhost:${UI_PORT}/"
echo ""

# ── Ensure rag_pipeline symlink exists ──
if [ ! -L "${DIR}/backend/rag_pipeline.py" ]; then
  ln -sf ../rag_pipeline.py "${DIR}/backend/rag_pipeline.py"
  echo "  ✓ Symlinked rag_pipeline.py"
fi

# ── Kill existing servers on our ports ──
for port in ${API_PORT} ${UI_PORT}; do
  pid=$(lsof -t -i:"${port}" 2>/dev/null || true)
  if [ -n "${pid}" ]; then
    kill "${pid}" 2>/dev/null || true
    sleep 1
  fi
done

# ── Copy rag_pipeline into backend as a fallback (symlinks break on some systems) ──
if [ ! -f "${DIR}/backend/rag_pipeline.py" ]; then
  cp "${DIR}/rag_pipeline.py" "${DIR}/backend/rag_pipeline.py"
fi

# ── Start API server (background, daemonized) ──
cd "${DIR}/backend"
export PYTHONPATH="..:${PYTHONPATH}"
nohup python3 -m uvicorn main:app --host 0.0.0.0 --port ${API_PORT} --log-level warning > /tmp/studio-api.log 2>&1 &
API_PID=$!
echo "  ✓ API server started (PID: ${API_PID})"

# ── Start frontend server ──
cd "${DIR}/frontend"
nohup python3 -m http.server ${UI_PORT} > /tmp/studio-ui.log 2>&1 &
UI_PID=$!
echo "  ✓ UI server started (PID: ${UI_PID})"

# ── Wait and verify ──
sleep 3
echo ""

# Verify API
if kill -0 ${API_PID} 2>/dev/null && curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://localhost:${API_PORT}/docs > /dev/null 2>&1; then
  echo "  ✅ API is running on http://localhost:${API_PORT}"
else
  echo "  ❌ API failed to start. Check /tmp/studio-api.log"
  tail -5 /tmp/studio-api.log 2>/dev/null || true
fi

# Verify UI
if kill -0 ${UI_PID} 2>/dev/null && curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://localhost:${UI_PORT}/ > /dev/null 2>&1; then
  echo "  ✅ UI is running on http://localhost:${UI_PORT}"
else
  echo "  ❌ UI failed to start. Check /tmp/studio-ui.log"
  tail -5 /tmp/studio-ui.log 2>/dev/null || true
fi

echo ""
echo "  ─────────────────────────────────────"
echo "  Open the UI: http://localhost:${UI_PORT}"
echo "  API docs:    http://localhost:${API_PORT}/docs"
echo "  ─────────────────────────────────────"
echo ""
echo "  To queue the exported patterns, open the UI and drag:"
echo "    data/uploads/architect_patterns.jsonl"
echo "  into the training queue, then click Start."
echo ""
