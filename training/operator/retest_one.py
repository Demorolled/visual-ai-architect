#!/usr/bin/env python3
"""Retest ONE build's kept export (used by GET /api/build-ladder/retest/:id).
Prints a JSON result to stdout."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from manifest import SPECS  # noqa: E402
from tester import test_export  # noqa: E402

sid = sys.argv[1] if len(sys.argv) > 1 else ""
spec = next((s for s in SPECS if s["id"] == sid), None)
if spec is None:
    print(json.dumps({"ok": False, "error": f"unknown build id {sid}"}))
    sys.exit(0)
export_dir = ROOT / "training" / "operator" / "dataset" / "failed" / sid
if not export_dir.is_dir():
    print(json.dumps({"ok": False, "error": f"no kept export for {sid} (it passed fresh — nothing to re-test)"}))
    sys.exit(0)
ok, detail, ev = test_export(export_dir, spec)
print(json.dumps({
    "ok": ok, "id": sid, "level": spec["level"], "lang": spec["lang"],
    "detail": detail,
    "out": (ev.get("out") or "")[-600:],
    "pageErrors": (ev.get("pageErrors") or [])[:5],
    "checks": (ev.get("checks") or [])[:3],
}, default=str))
