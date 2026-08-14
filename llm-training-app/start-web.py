#!/usr/bin/env python3
"""Simple launcher that sets up Python path before starting uvicorn."""
import sys
import os

# Add the llm-training-app directory to path so rag_pipeline and other
# modules can be found from backend/main.py
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
sys.path.insert(0, os.path.join(SCRIPT_DIR, 'backend'))

import uvicorn

if __name__ == "__main__":
    port = int(os.environ.get("STUDIO_PORT", "8001"))
    print(f"  Starting LLM Training Studio on http://localhost:{port}")
    print(f"  (Frontend: {SCRIPT_DIR}/frontend/index.html)")
    print()
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        log_level="info",
        reload=True,
    )
