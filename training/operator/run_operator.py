#!/usr/bin/env python3
"""
VACA build-ladder operator — build 55 real apps (20 simple / 10 hard /
25 extreme), full-test each one, repair on failure, and record everything
into a training dataset + a datasheet of fixes for the next LLM round.

Flow per build (resumable via state.json):
  plan-code → write-code → test (tester.py) →
    PASS  → record training row, archive _training.json, delete export
    FAIL  → record fix in datasheet, repair (re-write with the error fed
            back, up to 2 rounds), retest; on final pass record the
            corrected output as a "repaired" training row.

Outputs:
  training/operator/state.json                 resume state (all results)
  training/operator/dataset/round9-buildladder.jsonl   next-round dataset
  training/operator/datasheet-fixes.jsonl      permanent fix store
  training/operator/dataset/training/<id>.json archived VACA _training.json
  training/operator/dataset/failed/<id>/       kept failing exports
"""
import argparse
import json
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from manifest import SPECS  # noqa: E402
from tester import test_export  # noqa: E402

BASE = "http://127.0.0.1:3001"
OP_DIR = Path(__file__).resolve().parent
DATASET = OP_DIR / "dataset" / "round9-buildladder.jsonl"
FIXES = OP_DIR / "datasheet-fixes.jsonl"
TRAIN_ARCH = OP_DIR / "dataset" / "training"
FAIL_ARCH = OP_DIR / "dataset" / "failed"
STATE_FILE = OP_DIR / "state.json"
SUMMARY_FILE = OP_DIR / "summary.json"

MAX_REPAIRS = 2
MAX_INFRA_RETRIES = 3  # per-build retries on connection/backend failures


# ─── API ────────────────────────────────────────────────────────────────────

def api(method: str, path: str, body: dict | None = None, timeout: int = 900):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return time.time() - t0, r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return time.time() - t0, e.code, {"error": e.read().decode()[:400]}
    except Exception as e:
        return time.time() - t0, -1, {"error": str(e)[:400]}


def health_ok(retries: int = 3) -> bool:
    """Backend + LLM healthy. A busy model (mid-generation) can make the
    health LLM-probe time out — retry with backoff before giving up."""
    for i in range(retries):
        _dt, st, j = api("GET", "/api/health", timeout=8)
        ok = st == 200 and j.get("ok") and j.get("llm", {}).get("up")
        if ok:
            return True
        print(f"[infra] backend unhealthy (attempt {i + 1}/{retries}, status {st}): {str(j)[:120]}")
        time.sleep(10)
    return False


# ─── Recording ──────────────────────────────────────────────────────────────

def _lang(path: str) -> str:
    return {"py": "python", "js": "javascript", "ts": "typescript",
            "tsx": "tsx", "jsx": "jsx", "html": "html", "css": "css",
            "json": "json"}.get(Path(path).suffix.lstrip(".").lower(), "text")


def files_to_output(written: list[dict]) -> str:
    """Concatenate generated files into an LLM-friendly fenced block."""
    sections = []
    for w in written or []:
        if not isinstance(w, dict):
            continue
        p, c = w.get("path", ""), w.get("content", "") or ""
        if not p:
            continue
        sections.append(f"# ===== {p} =====\n```{_lang(p)}\n{c}\n```")
    return "\n\n".join(sections)


def record_row(instruction: str, input_text: str, output_text: str, source: str):
    DATASET.parent.mkdir(parents=True, exist_ok=True)
    row = {"instruction": instruction, "input": input_text, "output": output_text,
           "source": source, "at": datetime.utcnow().isoformat() + "Z"}
    with open(DATASET, "a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
    return row


def record_fix(spec: dict, error: str, diagnosis: str, corrected_output: str | None,
               attempts: int, passed: bool):
    FIXES.parent.mkdir(parents=True, exist_ok=True)
    row = {"id": spec["id"], "level": spec["level"], "lang": spec["lang"],
           "request": spec["request"], "expect": spec["expect"],
           "error": error[:1200], "diagnosis": diagnosis[:1200],
           "corrected_output": corrected_output,
           "attempts": attempts, "passed_after_repair": passed,
           "at": datetime.utcnow().isoformat() + "Z"}
    with open(FIXES, "a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
    return row


def archive_training_json(export_dir: Path, spec_id: str):
    src = export_dir / "_training.json"
    if src.exists():
        TRAIN_ARCH.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, TRAIN_ARCH / f"{spec_id}-{int(time.time())}.json")


def delete_export(export_dir: Path):
    if export_dir.is_dir():
        shutil.rmtree(export_dir, ignore_errors=True)


def keep_failed(export_dir: Path, spec_id: str):
    dst = FAIL_ARCH / spec_id
    if dst.exists():
        shutil.rmtree(dst, ignore_errors=True)
    if export_dir.is_dir():
        shutil.copytree(export_dir, dst)


# ─── Build loop ─────────────────────────────────────────────────────────────

def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"done": {}, "order": []}


def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, indent=1))


def is_infra_error(msg: str) -> bool:
    """Connection-level failures mean the backend/LLM link broke — not a VACA
    quality failure. These MUST be retried with a backend restart, never
    recorded as a build failure (the 01:41:48 outage turned 43 real builds
    into bogus generation-failed entries)."""
    m = (msg or "").lower()
    return any(k in m for k in (
        "remote end closed", "connection refused", "connection reset",
        "timed out", "timeout", "econnrefused", "econnreset", "broken pipe",
        "closed connection", "502", "503", "504", "bad gateway", "service unavailable",
    ))


def restart_backend() -> bool:
    """Restart the backend via the project helper; True when healthy after."""
    import subprocess
    try:
        r = subprocess.run(["bash", str(OP_DIR / "restart_backend.sh")],
                           capture_output=True, text=True, timeout=220)
        print(f"  [infra] backend restart: {r.stdout.strip()[-60:] or r.returncode}")
        return health_ok()
    except Exception as e:
        print(f"  [infra] restart failed: {e}")
        return False


def plan_and_write(spec: dict, repair_note: str | None = None, _attempt: int = 1):
    """Run plan-code + write-code with infra retries (backend down / LLM link
    broken). Returns (ok, result, export_dir)."""
    request = spec["request"]
    if repair_note:
        request = f"{request}\n\n[REPAIR — previous build failed acceptance testing]\n{repair_note}"
    while True:
        dt, st, plan = api("POST", "/api/reason/plan-code",
                           {"request": request, "scale": spec.get("scale", "small")}, timeout=300)
        plan_err = plan.get("error", "") if isinstance(plan, dict) else ""
        if st == 200 and isinstance(plan, dict) and plan.get("success"):
            break
        if _attempt >= MAX_INFRA_RETRIES:
            return False, {"stage": "plan", "error": json.dumps(plan)[:400]}, None
        print(f"  [infra] plan-code failed (attempt {_attempt}): {plan_err[:100]} — restarting backend")
        restart_backend()
        time.sleep(5)
        _attempt += 1
    p = plan.get("plan", {})
    files = p.get("files", []) or p.get("contractFiles", [])
    questions = p.get("questions", []) or []
    answers = {}
    for q in (questions or [])[:4]:
        if q.get("options"):
            answers[q["key"]] = q["options"][0]
        else:
            answers[q["key"]] = "yes"
    while True:
        dt, st, gen = api("POST", "/api/reason/write-code",
                          {"request": request, "plan": p, "answers": answers,
                           "libraryMode": "hybrid", "scale": spec.get("scale", "small")},
                          timeout=1200)
        gen_err = gen.get("error", "") if isinstance(gen, dict) else ""
        if st == 200 and isinstance(gen, dict) and gen.get("success"):
            break
        if _attempt >= MAX_INFRA_RETRIES:
            return False, {"stage": "write", "error": json.dumps(gen)[:400]}, None
        print(f"  [infra] write-code failed (attempt {_attempt}): {gen_err[:100]} — restarting backend")
        restart_backend()
        time.sleep(5)
        _attempt += 1
    export_dir = gen.get("exportDir") or ""
    written = gen.get("written") or gen.get("files") or []
    n = gen.get("totalFiles") or len(written)
    meta = {"mode": gen.get("mode"), "files": n,
            "repairRounds": gen.get("repairRounds"),
            "tscErrors": gen.get("tscErrors"), "exportDir": export_dir,
            "planFiles": len(files), "questions": len(questions)}
    if export_dir and not os.path.isabs(export_dir):
        export_dir = str(ROOT / export_dir)
    return True, meta, Path(export_dir) if export_dir and os.path.isdir(export_dir) else None


def run_build(spec: dict, state: dict, no_repair: bool, keep_exports: bool) -> dict:
    sid = spec["id"]
    print(f"\n{'=' * 70}\n[{sid}] {spec['level'].upper()} ({spec['lang']}) — {spec['request'][:80]}")
    t0 = time.time()
    result = {"id": sid, "level": spec["level"], "lang": spec["lang"],
              "request": spec["request"], "started": datetime.utcnow().isoformat() + "Z",
              "passed": False, "attempts": 0, "repairs": 0, "outcome": "pending"}

    ok, meta, export_dir = plan_and_write(spec)
    if not ok:
        result.update({"outcome": "generation-failed", "error": meta["error"][:800]})
        # infra-class failures (connection refused/closed/timeout) are retried
        # inside plan_and_write already; record the FINAL state either way so
        # an infra retry that never recovered is visible in the datasheet.
        if is_infra_error(meta.get("error", "")):
            print(f"  [infra] giving up on {sid} after {MAX_INFRA_RETRIES} infra retries")
        record_fix(spec, meta["error"][:1200], "plan/write stage failed (possibly infra)", None, 1, False)
        state["done"][sid] = result
        return result
    result["generation"] = meta
    attempts = 1
    export_dir, passed, detail, ev, written, patched, patch_desc = attempt_test(export_dir, spec)
    result["attempts"] = attempts
    result["finalFiles"] = written
    result["autoPatch"] = patch_desc if patched else ""

    while not passed and not no_repair and attempts <= MAX_REPAIRS:
        diagnosis = f"attempt {attempts} failed: {detail[:500]}"
        record_fix(spec, detail, diagnosis, None, attempts, False)
        print(f"  [fix] recorded in datasheet — repair round {attempts}/{MAX_REPAIRS} ...")
        if result.get("firstError") is None:
            result["firstError"] = detail
        # the repair note must show the ACTUAL output, not just the missing
        # checks — a bare "missing expected output" made the model re-roll
        # blind (h04 kept printing the same wrong streak).
        out_snip = ""
        if isinstance(ev, dict) and ev.get("out"):
            out_snip = "\nACTUAL OUTPUT: " + str(ev["out"])[-500:]
        repair_note = detail[:700] + out_snip
        time.sleep(2)
        ok, meta2, new_dir = plan_and_write(spec, repair_note=repair_note)
        if not ok:
            result.update({"error": meta2["error"][:800]})
            break
        result["repairs"] = attempts
        attempts += 1
        result["attempts"] = attempts
        export_dir, passed, detail, ev, written, patched, patch_desc = attempt_test(new_dir, spec)
        result["finalFiles"] = written
        result["autoPatch"] = patch_desc if patched else (result.get("autoPatch") or "")

    result["seconds"] = round(time.time() - t0, 1)

    if passed:
        # training row: corrected/final output. Repaired builds carry the
        # first failure as `input` so the next LLM round learns the fix.
        output = files_to_output(result.get("finalFiles", []))
        fixed_via = []
        if result.get("repairs"):
            fixed_via.append(f"repaired after {result['repairs']} round(s)")
        if result.get("autoPatch"):
            fixed_via.append(result["autoPatch"])
        fix_note = " + ".join(fixed_via)
        if result.get("repairs"):
            record_row(spec["request"],
                       f"The first build failed acceptance testing with: {result.get('firstError', 'unknown error')}",
                       output, f"build-ladder-{sid}-repaired")
            # datasheet: pair the fix with its correction (the user's "store
            # the correction into a datasheet fix" requirement)
            record_fix(spec, result.get("firstError", ""),
                       fix_note or "repaired", output,
                       result.get("attempts", 1), True)
        elif result.get("autoPatch"):
            record_row(spec["request"],
                       f"The first build exited with no output because the entry function was never called.",
                       output, f"build-ladder-{sid}-patched")
            record_fix(spec, "script exited 0 with NO output — entry function never called",
                       fix_note, output, 1, True)
        else:
            record_row(spec["request"], "", output, f"build-ladder-{sid}")
        result["outcome"] = "PASS" if (result["repairs"] == 0 and not result.get("autoPatch")) else \
            (f"PASS-after-{result['repairs']}-repairs" if result["repairs"] else "PASS-after-auto-patch")
        result["detail"] = detail
        archive_training_json(export_dir, sid)
        if not keep_exports:
            delete_export(export_dir)
    else:
        result["outcome"] = "FAIL"
        result["detail"] = detail
        result["evidence"] = ev if isinstance(ev, dict) else {}
        record_fix(spec, detail, "all repair attempts exhausted", None, attempts, False)
        keep_failed(export_dir, sid)

    result["passed"] = passed
    result["finished"] = datetime.utcnow().isoformat() + "Z"
    state["done"][sid] = result
    print(f"  [{sid}] → {result['outcome']} in {result['seconds']}s ({result['attempts']} attempt(s)) — {detail[:120]}")
    return result


def apply_python_attr_fix(export_dir: Path, spec: dict, error_text: str) -> tuple[bool, str]:
    """Zero-LLM fix for cross-file Python API drift (s19: main.py called
    todo.load_tasks, todo.py exports list_tasks). CPython's AttributeError
    suggestions are reliable — rename the member call sites accordingly."""
    if spec.get("lang") != "python" or export_dir is None:
        return False, ""
    matches = re.findall(r"module '([^']+)' has no attribute '([^']+)'\. Did you mean: '([^']+)'",
                         error_text or "")
    if not matches:
        return False, ""
    fixed = []
    for mod, missing, suggestion in matches:
        if missing == suggestion:
            continue
        # scope the rename to files that actually import the failing module
        # (reviewer: a global .missing->.suggestion could hit unrelated code)
        for f in export_dir.rglob("*.py"):
            src = f.read_text(errors="replace")
            imports_mod = re.search(rf"(?:import\s+{re.escape(mod)}|from\s+{re.escape(mod)}\s+import)\b", src)
            if not imports_mod:
                continue
            if f".{missing}" in src:
                f.write_text(src.replace(f".{missing}", f".{suggestion}"), encoding="utf-8")
                fixed.append(f"{f.name}: .{missing} -> .{suggestion}")
    return bool(fixed), "; ".join(fixed)


def ensure_entry_executes(export_dir: Path, spec: dict) -> tuple[bool, str]:
    """Deterministic zero-LLM fix for the recurring 'defines but never calls'
    failure (s10, s18): if the python entry file has a zero-arg module-level
    main function but NO __main__ guard / top-level call, append one. The
    patched file becomes the corrected output recorded for training."""
    if spec.get("lang") != "python" or export_dir is None:
        return False, ""
    entry = None
    for root, _dirs, files in os.walk(str(export_dir)):
        if spec["entry"] in files:
            entry = (Path(root) / spec["entry"]).resolve()
            break
    if entry is None:
        return False, ""
    src = entry.read_text(errors="replace")
    if "__main__" in src:
        return False, ""
    # find zero-required-arg module-level defs (the runnable main candidates).
    # The return annotation is OPTIONAL — `def main():` must match too (the
    # reviewer caught `->?` wrongly requiring a literal `-`).
    candidates = []
    for m in re.finditer(r"^def\s+([A-Za-z_][\w]*)\s*\(([^)]*)\)\s*(?:->\s*[^:]*)?:\s*$", src, re.M):
        params = m.group(2).strip()
        if not params or all("=" in p.strip() or p.strip().startswith(("*", "**")) for p in params.split(",")):
            candidates.append((m.start(), m.group(1)))
    if not candidates:
        return False, ""
    # any top-level call already present?
    top_calls = [ln for ln in src.split("\n")
                 if ln and not ln[0].isspace() and not re.match(r"^(def|import|from|class|#|if |for |while |try|except|else|elif|return|pass|print\()", ln)]
    if top_calls:
        return False, ""
    fname = candidates[-1][1]
    patch = f"\n\nif __name__ == '__main__':\n    {fname}()"
    entry.write_text(src.rstrip() + patch + "\n", encoding="utf-8")
    return True, f"auto-appended __main__ call to {spec['entry']} ({fname}())"


def attempt_test(export_dir, spec):
    if export_dir is None:
        return None, False, "no export directory produced", {}, []
    # deterministic fix FIRST so the snapshot + test run the corrected code
    patched, patch_desc = ensure_entry_executes(export_dir, spec)
    # snapshot written files (for dataset recording)
    written = []
    for f in sorted(export_dir.rglob("*")):
        if f.is_file() and not f.name.startswith("_"):
            written.append({"path": str(f.relative_to(export_dir)), "content": f.read_text(errors="replace")})
    ok, detail, ev = test_export(export_dir, spec)
    # Python cross-file API drift: CPython's AttributeError suggestion is a
    # reliable deterministic fix — apply it, re-test, and record it (s19).
    attr_patch = ""
    if not ok:
        p_ok, p_desc = apply_python_attr_fix(export_dir, spec, detail)
        if p_ok:
            attr_patch = p_desc
            ok, detail2, ev = test_export(export_dir, spec)
            detail = detail2 if ok else f"(attr-fixed: {p_desc}) {detail2}"
            written = []
            for f in sorted(export_dir.rglob("*")):
                if f.is_file() and not f.name.startswith("_"):
                    written.append({"path": str(f.relative_to(export_dir)), "content": f.read_text(errors="replace")})
    if patched and not ok:
        detail = f"(patched: {patch_desc}) " + detail
    return export_dir, ok, detail, ev, written, patched or attr_patch, \
        (patch_desc + (" + " + attr_patch if attr_patch else "")) if (patched or attr_patch) else ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", help="run a single build id (e.g. s01)")
    ap.add_argument("--max", type=int, default=0, help="max builds this invocation (0 = all)")
    ap.add_argument("--only", choices=["simple", "hard", "extreme"], help="level filter")
    ap.add_argument("--no-repair", action="store_true", help="disable repair loop")
    ap.add_argument("--keep-exports", action="store_true", help="don't delete passing exports")
    ap.add_argument("--force", action="store_true", help="re-run a build even if already done (with --id)")
    ap.add_argument("--reset", action="store_true", help="with --id: clear that build's state entry first")
    args = ap.parse_args()

    if not health_ok():
        print("[infra] aborting — backend or LLM not healthy")
        sys.exit(1)

    state = load_state()
    spec_ids = [s["id"] for s in SPECS]
    if args.id:
        if args.id not in spec_ids:
            print(f"unknown id {args.id}; valid: {', '.join(spec_ids)}")
            sys.exit(1)
        if args.reset:
            state["done"].pop(args.id, None)
        specs = [s for s in SPECS if s["id"] == args.id]
    else:
        specs = [s for s in SPECS if (not args.only or s["level"] == args.only)]
    if not (args.id and args.force):
        specs = [s for s in specs if s["id"] not in state["done"]]
    if args.max:
        specs = specs[:args.max]

    if not specs:
        print("nothing to run (all filtered builds already done)")
        return

    print(f"[operator] running {len(specs)} builds | backend {BASE}")
    results = []
    for spec in specs:
        r = run_build(spec, state, args.no_repair, args.keep_exports)
        results.append(r)
        save_state(state)
        state = load_state()
        # keep the summary file fresh after every build
        write_summary(state, results)

    write_summary(state, results)
    print("\n" + "=" * 70)
    print("[operator] invocation complete")
    for r in results:
        print(f"  {r['id']} {r['level']:<8} {r['outcome']}")


def write_summary(state: dict, results: list):
    done = state.get("done", {})
    passed = [v for v in done.values() if v.get("passed")]
    failed = [v for v in done.values() if not v.get("passed") and v.get("outcome", "") != "pending"]
    summary = {
        "total_done": len(done),
        "passed": len(passed),
        "failed": len(failed),
        "by_level": {},
        "updated": datetime.utcnow().isoformat() + "Z",
    }
    for lvl in ("simple", "hard", "extreme"):
        lv = [v for v in done.values() if v.get("level") == lvl]
        summary["by_level"][lvl] = {"done": len(lv), "passed": len([v for v in lv if v.get("passed")])}
    SUMMARY_FILE.write_text(json.dumps(summary, indent=1))
    print(f"[operator] progress: {len(done)} done | {len(passed)} pass | {len(failed)} fail "
          f"({','.join(v['id'] for v in failed) if failed else 'none'})")


if __name__ == "__main__":
    main()
