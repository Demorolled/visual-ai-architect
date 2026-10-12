#!/usr/bin/env python3
"""
build-scaffold-rows.py — teacher-author the scaffold-role training corpus.
================================================================================
The scaffold role had no training data: the distill adapter was trained plain-CE
on COMPLETION targets only, so it names a module's exports but never names the
file or its siblings — 0/197 on the scaffold gate. This script produces the
missing data.

For every task in corpora/vaca/tasks.txt it asks a strong teacher (default
qwen2.5-coder:14b — which already scores ~0.92 on the gate) to author the
scaffold, using the SAME system prompt and user prompt the gate uses, so the
rows train the role exactly as it is called at runtime.

Outputs (under --out, default corpora/vaca/):
  scaffolds.jsonl    {id, file, scaffold}          — for eval_acceptance --scaffolds (A/B)
  scaffold-rows.jsonl {instruction, input, output} — Alpaca rows for the next QLoRA round
  scaffold-rows.meta.json — provenance + validation

Validation: the authored scaffolds are run through the SAME acceptance gate
(acceptance_check.mjs --mode scaffold). A high pass rate proves the training
targets actually satisfy the gate the role is judged on — otherwise we would be
training toward a target we cannot measure.

Usage:
  python3 scripts/build-scaffold-rows.py --teacher qwen2.5-coder:14b --workers 3
  python3 scripts/build-scaffold-rows.py --limit 40
"""
from __future__ import annotations

import argparse
import concurrent.futures as futures
import importlib.util
import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DEFAULT_TASKS = ROOT / "corpora" / "vaca" / "tasks.txt"
DEFAULT_OUT = ROOT / "corpora" / "vaca"
URL = "http://192.168.1.234:11434/api/generate"


def _load_gate():
    spec = importlib.util.spec_from_file_location("ea", HERE / "eval_acceptance.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def gen(api: str, model: str, prompt: str, system: str, num_predict: int, num_ctx: int) -> str:
    payload = {
        "model": model, "prompt": prompt, "system": system, "stream": False,
        "options": {"temperature": 0.0, "seed": 42,
                    "num_predict": num_predict, "num_ctx": num_ctx},
        "keep_alive": "10m",
    }
    req = urllib.request.Request(api, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.loads(r.read())["response"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tasks", default=str(DEFAULT_TASKS))
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--teacher", default="qwen2.5-coder:14b")
    ap.add_argument("--api", default=URL)
    ap.add_argument("--limit", type=int, default=0, help="first N tasks only (0 = all)")
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--num-predict", type=int, default=700)
    ap.add_argument("--num-ctx", type=int, default=8192)
    args = ap.parse_args()

    ea = _load_gate()
    out_dir = Path(args.out).expanduser()
    out_dir.mkdir(parents=True, exist_ok=True)
    task_path = Path(args.tasks).expanduser()
    lines = [l for l in task_path.read_text().splitlines() if l.strip()]
    if args.limit:
        lines = lines[:args.limit]
    parsed = [ea.parse_task(l) for l in lines]
    parsed = [t for t in parsed if t]

    # The runtime prompt is identical to the gate's scaffold prompt.
    def user_prompt(line: str) -> str:
        return "TASK: " + line.strip() + "\nPREV_SCAFFOLD: (none)"

    print(f"[scaffold-rows] teacher={args.teacher} tasks={len(parsed)} workers={args.workers}")
    t0 = time.time()

    def author(i_t):
        i, line = i_t
        try:
            text = gen(args.api, args.teacher, user_prompt(line), ea.SYS_SCAFFOLD,
                       args.num_predict, args.num_ctx).strip()
            return i, text, None
        except Exception as e:  # noqa: BLE001
            return i, "", f"{type(e).__name__}: {e}"

    authored: list[str | None] = [None] * len(parsed)
    fails = 0
    with futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as ex:
        for i, text, err in ex.map(author, list(enumerate(lines))):
            if err or not text:
                fails += 1
                authored[i] = None
                print(f"[scaffold-rows] task {i} ({parsed[i]['id']}): FAILED {err or 'empty'}")
                continue
            authored[i] = text
            if (i + 1) % 20 == 0:
                print(f"[scaffold-rows]   {i + 1}/{len(parsed)} ({time.time() - t0:.0f}s)")

    scaffolds_path = out_dir / "scaffolds.jsonl"
    rows_path = out_dir / "scaffold-rows.jsonl"
    n = 0
    with scaffolds_path.open("w", encoding="utf-8") as fs_, rows_path.open("w", encoding="utf-8") as fr:
        for idx, (t, text) in enumerate(zip(parsed, authored)):
            if not text:
                continue
            fs_.write(json.dumps({"id": t["id"], "file": t["file"], "scaffold": text}) + "\n")
            # Alpaca row: instruction = the role's SYSTEM prompt, input = the exact
            # runtime user prompt, output = the teacher's scaffold. Trains the role
            # as it is called.
            fr.write(json.dumps({
                "instruction": ea.SYS_SCAFFOLD,
                "input": user_prompt(lines[idx]),
                "output": text,
                "id": t["id"], "file": t["file"],
                "expected_exports": t["expects"], "app_plan": t.get("siblings", []),
                "source": f"scaffold:{args.teacher}",
            }) + "\n")
            n += 1

    # Validate: do the authored scaffolds PASS the gate they are the target of?
    batch = [{"id": t["id"], "file": t["file"], "lang": t["lang"], "expects": t["expects"],
              "siblings": t.get("siblings", []), "text": text}
             for t, text in zip(parsed, authored) if text]
    bpath = out_dir / "_scaffold-batch.json"
    rpath = out_dir / "_scaffold-results.json"
    bpath.write_text(json.dumps(batch))
    ts_dir = str(ROOT / "node_modules" / "typescript")
    rc = subprocess.run(["node", str(HERE / "acceptance_check.mjs"),
                         "--in", str(bpath), "--out", str(rpath),
                         "--ts-dir", ts_dir, "--mode", "scaffold"],
                        capture_output=True, text=True)
    passed = total = 0
    if rc.returncode == 0:
        res = json.loads(rpath.read_text())["results"]
        total = len(batch)
        passed = sum(1 for r in res.values() if r.get("passed"))
        print(f"[scaffold-rows] GATE: authored scaffolds pass {passed}/{total} "
              f"= {passed / total:.4f}" if total else "[scaffold-rows] no rows")
    else:
        print(f"[scaffold-rows] validation skipped: node rc={rc.returncode} {rc.stderr[:200]}")

    meta = {
        "teacher": args.teacher, "n_rows": n, "n_tasks": len(parsed), "fails": fails,
        "gate_passed": passed, "gate_total": total,
        "gate_pass_rate": round(passed / total, 4) if total else None,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "note": "Alpaca rows: instruction=SYS_SCAFFOLD, input=TASK line, output=teacher scaffold. "
                "Merge into the next QLoRA round to train the scaffold role.",
    }
    (out_dir / "scaffold-rows.meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(f"[scaffold-rows] wrote {scaffolds_path.name} + {rows_path.name} ({n} rows, {fails} fails)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
