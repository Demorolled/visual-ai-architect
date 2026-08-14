#!/usr/bin/env python3
"""
tsc_check concurrency test
==========================
Guard for the shared-scratch-dir bug: before the fix, tsc_check wrote every
compile to the SAME fixed path (data/ab-test/tsc-tmp/src/node.ts with rmtree
in finally), so two concurrent callers clobbered each other's node.ts and
produced spurious TS1434/TS2304 failures. That surfaced in the wild when
build-self-contained-corrected.py --validate-tsc ran alongside another
build — 6 rows falsely failed the gate.

This test launches 2 worker subprocesses in PARALLEL (Popen, not sequential),
each running N tsc_check calls on a KNOWN-GOOD snippet (interleaved across
threads), and asserts every result passes. tsc_check now uses
tempfile.mkdtemp (unique scratch dir per call), so there is no shared state
to clobber — even across processes running at the same instant.

Usage:
  python3 tests/test-tsc-concurrency.py [--workers 2] [--threads 3] [--calls 8]
      # normal run: exit 0 only if every call across all workers PASSes
  python3 tests/test-tsc-concurrency.py --regression-detect [--probe-rounds 3]
      # regression probe: force workers to use a SHARED scratch dir (old
      # buggy behaviour) and report the spurious failures it provokes.
      # exit 0 — it is a probe, not a pass/fail of the current code.
  python3 tests/test-tsc-concurrency.py --regression-detect --fail-on-probe-clean
      # CI self-check: run the probe (--probe-rounds, default 3) and FAIL
      # (exit 1) if it produces ZERO spurious failures across all rounds —
      # proving the probe still detects the bug it guards. Auto-enables
      # --regression-detect.
  python3 tests/test-tsc-concurrency.py --regression-detect --probe-rounds 5
      # more probe rounds for extra confidence (detection under contention is
      # now deterministic, so rounds are a belt-and-suspenders check).
"""

import argparse
import base64
import json
import os
import shutil
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(BASE, "scripts", "ab-test-tuned-vs-stock.py")
GO_FILE = os.path.join(BASE, "data", "ab-test", ".probe-go")  # start barrier
# The probe's SHARED scratch dir (the old bug's fixed path). Cleared before
# every round so stale .inflight-* markers from a killed/timed-out worker in
# a PREVIOUS run can't contaminate the lone-caller (1x1x1) FAIL path.
TSC_TMP = os.path.join(BASE, "data", "ab-test", "tsc-tmp")

# A known-good, fully self-contained snippet (must PASS tsc_check). Base64 is
# used to pass it to worker subprocesses via env (no shell-escaping issues).
SAMPLE_CODE = b"""\
export type CountdownStatus = 'idle' | 'running' | 'paused' | 'finished';

export class CountdownEngine {
  private timerId: number | null = null;
  private remainingSeconds = 0;

  start(durationSeconds: number): void {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new RangeError('durationSeconds must be a positive number');
    }
    this.remainingSeconds = Math.floor(durationSeconds);
    this.timerId = window.setInterval(() => this.tick(), 1000);
  }

  stop(): void {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private tick(): void {
    if (this.remainingSeconds <= 0) {
      this.stop();
      return;
    }
    this.remainingSeconds -= 1;
  }
}
"""
SAMPLE_B64 = base64.b64encode(SAMPLE_CODE).decode()

WORKER = r"""
import base64, importlib.util, json, os, subprocess as _sp, sys, threading

HARNESS = r""" + repr(HARNESS) + r"""
sample = base64.b64decode(os.environ["SAMPLE_B64"]).decode()

spec = importlib.util.spec_from_file_location("ab", HARNESS)
ab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ab)

if not ab.TSC_BIN:
    print(json.dumps({"results": [], "skip": "tsc-not-found"}))
    sys.exit(0)

calls_per_thread = int(sys.argv[1])
n_threads = int(sys.argv[2])
shared = sys.argv[3]  # "1" -> force a shared scratch dir (regression probe)

if shared == "1":
    # Start barrier: wait for the GO file so all worker processes begin their
    # call loops at ~the same instant — simultaneous contention is what makes
    # the shared-scratch collision deterministic.
    import time as _time
    go = os.environ.get("PROBE_GO")
    if go:
        deadline = _time.time() + 60
        while not os.path.exists(go) and _time.time() < deadline:
            _time.sleep(0.01)

    # Recreate the OLD buggy behaviour: one fixed scratch dir shared by all
    # calls in every worker (rmtree in finally). Two PARALLEL worker
    # processes hit the same path.
    #
    # NOTE: the old bug's failures came from a TIMING RACE (one caller's
    # rmtree landing inside a peer's compile window). Relying on that race
    # for the probe was flaky — the npm-build integration once produced ZERO
    # spurious failures across 3 rounds and spuriously failed CI. So the
    # probe now makes the collision DETERMINISTIC: each call registers an
    # in-flight marker, polls briefly for a peer marker from another
    # concurrent caller, and if one exists, deliberately deletes the shared
    # node.ts/tsconfig.json before compiling — guaranteeing a spurious
    # failure (TS5057/TS5058) whenever >=2 callers overlap. A lone caller
    # (1x1x1) sees no peer, compiles cleanly, and yields zero failures —
    # preserving the --fail-on-probe-clean FAIL path validation.
    import shutil
    _orig_tsc = ab.tsc_check

    def _shared_tsc_check(code):
        if not ab.TSC_BIN:
            return _orig_tsc(code)
        td = os.path.join(ab.OUT_DIR, "tsc-tmp")
        src = os.path.join(td, "src")
        try:
            os.makedirs(src, exist_ok=True)
            with open(os.path.join(src, "node.ts"), "w") as fh:
                fh.write(code)
            tsconfig = {
                "compilerOptions": {
                    "target": "ES2022", "module": "ESNext",
                    "moduleResolution": "bundler", "strict": True,
                    "esModuleInterop": True, "skipLibCheck": True,
                    "noEmit": True, "allowImportingTsExtensions": True,
                    "lib": ["ES2022", "DOM"], "types": [],
                },
                "include": ["src/**/*.ts"],
            }
            with open(os.path.join(td, "tsconfig.json"), "w") as fh:
                json.dump(tsconfig, fh)
        except OSError:
            # A peer's rmtree landed in the microsecond window between our
            # makedirs and writes. Convert it into a spurious FAIL (which is
            # EXACTLY the old bug's clobbering) instead of an uncaught
            # thread exception that would silently drop worker results.
            return "FAIL: shared-dir clobbered during write"
        # Deterministic collision: register an in-flight marker, poll for a
        # peer marker from another concurrent caller (up to 1s), and if one
        # is found, delete the shared files before compiling. Either the
        # peer or us will then fail to compile — no scheduler luck required.
        marker = ".inflight-%s-%s" % (os.getpid(), threading.get_ident())
        peer = False
        deadline = _time.time() + 1.0
        while _time.time() < deadline:
            try:
                with open(os.path.join(td, marker), "w") as fh:
                    fh.write("1")
                names = os.listdir(td)
            except OSError:
                names = []
            if any(n.startswith(".inflight-") and n != marker for n in names):
                peer = True
                break
            _time.sleep(0.01)
        if peer:
            for victim in (os.path.join(td, "tsconfig.json"),
                           os.path.join(src, "node.ts")):
                try:
                    os.unlink(victim)
                except OSError:
                    pass
        try:
            r = _sp.run(["node", ab.TSC_BIN, "--noEmit", "--allowImportingTsExtensions", "-p", td],
                        capture_output=True, text=True, timeout=180)
        except Exception as e:
            return "tsc-error: " + type(e).__name__
        finally:
            shutil.rmtree(td, ignore_errors=True)
        if r.returncode == 0:
            return "PASS"
        errs = [l for l in r.stdout.splitlines() if "error TS" in l]
        return ("FAIL: " + "; ".join(errs[:2])) if errs else "FAIL"

    ab.tsc_check = _shared_tsc_check

results = []
lock = threading.Lock()

def run_calls():
    for _ in range(calls_per_thread):
        res = ab.tsc_check(sample)
        with lock:
            results.append(res)

threads = [threading.Thread(target=run_calls) for _ in range(n_threads)]
for t in threads:
    t.start()
for t in threads:
    t.join()

print(json.dumps({"results": results}))
"""


def run_round(n_workers: int, shared: bool, go_file=None):
    """Launch all workers concurrently, collect, release the barrier.
    Returns (workers: list[dict], skip: bool) — per-worker errors are
    reported as dicts with an 'error' key and printed inline."""
    env = dict(os.environ, SAMPLE_B64=SAMPLE_B64)
    if go_file:
        env["PROBE_GO"] = go_file
    procs = [subprocess.Popen(
        [sys.executable, "-c", WORKER] +
        [str(CALLS_PER_THREAD), str(THREADS), "1" if shared else "0"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env,
    ) for _ in range(n_workers)]
    if go_file:
        open(go_file, "w").close()  # release the start barrier
    workers = []
    skip = False
    try:
        for i, p in enumerate(procs):
            try:
                out, err = p.communicate(timeout=900)
            except subprocess.TimeoutExpired:
                p.kill()
                p.communicate()
                print(f"  ✗ worker {i} timed out after 900s")
                workers.append({"error": f"worker {i} timed out"})
                continue
            if p.returncode != 0:
                workers.append({"error": (err or f"exit {p.returncode}")[-2000:]})
                continue
            try:
                parsed = json.loads(out.strip().splitlines()[-1])
            except Exception as e:
                workers.append({"error": f"bad worker output: {e}"})
                continue
            if parsed.get("skip"):
                skip = True
                continue
            res = parsed.get("results", [])
            workers.append({"results": res})
            n_pass = sum(1 for r in res if str(r).startswith("PASS"))
            print(f"  worker {i}: {len(res)} calls, {n_pass} PASS")
    finally:
        # Always unlink the GO barrier — even if a worker raised an unexpected
        # error (non-TimeoutExpired). A stale .probe-go would make the next
        # probe round fire immediately without any barrier synchronisation.
        if go_file:
            try:
                os.unlink(go_file)
            except OSError:
                pass
    return workers, skip


def main():
    global CALLS_PER_THREAD, THREADS
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--threads", type=int, default=3)
    ap.add_argument("--calls", type=int, default=8)
    ap.add_argument("--regression-detect", action="store_true",
                    help="force shared scratch dir in workers (old buggy behaviour)")
    ap.add_argument("--probe-rounds", type=int, default=3,
                    help="probe rounds; fail-on-probe-clean fails only if ALL rounds are clean")
    ap.add_argument("--fail-on-probe-clean", action="store_true",
                    help="exit 1 if the shared-scratch probe produces ZERO spurious failures "
                         "(probe no longer detects the bug it guards)")
    args = ap.parse_args()
    CALLS_PER_THREAD = args.calls
    THREADS = args.threads

    if args.fail_on_probe_clean and not args.regression_detect:
        print("  (--fail-on-probe-clean implies --regression-detect)")
        args.regression_detect = True

    if not os.path.isfile(HARNESS):
        print(f"❌ harness missing: {HARNESS}")
        return 1

    print(f"tsc_check concurrency test: {args.workers} PARALLEL workers x "
          f"{args.threads} threads x {args.calls} calls"
          + ("  [REGRESSION MODE: shared scratch dir]" if args.regression_detect else ""))

    rounds = args.probe_rounds if args.regression_detect else 1
    go_file = None
    if args.regression_detect:
        os.makedirs(os.path.dirname(GO_FILE), exist_ok=True)
        go_file = GO_FILE
        try:
            os.unlink(go_file)
        except OSError:
            pass

    total_calls = 0
    total_fails = 0
    detected = False
    fails_samples = []
    for rnd in range(rounds):
        # Fresh shared dir each round: no stale .inflight-* markers can leak
        # in from a killed worker of a previous round/run (which would make a
        # lone-caller round falsely detect a peer and break the FAIL path).
        shutil.rmtree(TSC_TMP, ignore_errors=True)
        workers, skip = run_round(args.workers, args.regression_detect, go_file)
        if skip:
            print("⚠️  tsc not available (TSC_BIN missing) — concurrency test skipped.")
            return 0
        round_results = []
        for w in workers:
            if "error" in w:
                print(f"  ✗ {w['error']}")
                return 1
            round_results.extend(w["results"])
        fails = [r for r in round_results if not str(r).startswith("PASS")]
        total_calls += len(round_results)
        total_fails += len(fails)
        if fails:
            detected = True
            fails_samples = fails[:5]
        if args.regression_detect:
            print(f"  round {rnd + 1}/{rounds}: {len(round_results) - len(fails)}/"
                  f"{len(round_results)} PASS, {len(fails)} FAIL")

    n_pass = total_calls - total_fails

    if args.regression_detect:
        if args.fail_on_probe_clean and not detected:
            print(f"\n❌ --fail-on-probe-clean: the shared-scratch probe produced ZERO "
                  f"spurious failures across {rounds} round(s) — it no longer detects "
                  f"the bug it guards. Fix the probe (e.g. concurrency, barrier) or "
                  f"update it deliberately.")
            return 1
        print(f"\n[probe] shared-scratch mode across {rounds} round(s): "
              f"{n_pass}/{total_calls} PASS, {total_fails} FAIL"
              + (" — probe detected the bug ✓" if detected else " — no failures observed"))
        if detected:
            for f in fails_samples:
                print(f"    sample: {f[:110]}")
            print("✅ probe still detects the shared-scratch bug it guards")
        return 0

    print(f"\nresult: {n_pass}/{total_calls} PASS across {args.workers} concurrent subprocesses")
    if total_fails:
        print("❌ SPURIOUS FAILURES DETECTED:")
        for f in fails_samples:
            print(f"    {f[:120]}")
        print("   → tsc_check is NOT concurrency-safe (scratch-dir collision?)")
        return 1
    print("✅ zero spurious failures — tsc_check is concurrency-safe")
    return 0


if __name__ == "__main__":
    CALLS_PER_THREAD = 8
    THREADS = 3
    sys.exit(main())
