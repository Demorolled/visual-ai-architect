#!/usr/bin/env python3
"""smoke-test-cli.py — behavioral gate for generated CLI apps (non-HTML entries).

tsc cannot see whether a generated CLI app actually RUNS: a program that
imports a type-only member as a value (erased at runtime), references an
undefined symbol at module scope, or is a stub body (loadHabits = () => [],
saveHabits = () => {}) passes the type gate but crashes or does nothing when
executed. This probe executes the entry a few generic invocations under tsx
and reports a verdict + captured errors, mirroring smoke-test-html.py.

Usage:
    python3 scripts/smoke-test-cli.py <exportDir> [--entry src/main.ts] [--timeout 20]

Emits a single JSON object on stdout:
    {"status": "passed"|"failed"|"skipped"|"unavailable",
     "errors": [...], "detail": str, "runs": [{args, exit, timedOut, out}]}

Verdict rules (lenient on purpose — never blame the model for infra):
  * no runnable entry          -> skipped
  * tsx binary missing         -> unavailable (error key)
  * any invocation exits 0 with non-empty stdout -> passed
  * every invocation crashes / prints nothing / times out -> failed

Every probe runs in its OWN process group and the WHOLE group is killed when the
probe ends. tsx runs the entry in a child node process, so killing only the
direct child left that child alive — and when the entry was a server it kept
holding its port, which made the NEXT build fail with EADDRINUSE. Server-style
entries are skipped before probing by the TypeScript caller
(behavioralSmoke.ts `looksLikeServerEntry`); the group kill here is the safety
net for anything that still outlives its wrapper.
"""
import argparse
import json
import os
import re
import signal
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TSX = ROOT / "node_modules" / ".bin" / "tsx"

# Entry discovery priority — the file the app is meant to be launched from.
ENTRY_NAMES = ("main", "index", "cli", "app", "server", "start")
ENTRY_RE = r"(^|/|\.)(?:%s)\.(?:ts|tsx|js|mjs|cjs)$"


def pick_entry(export_dir: Path, explicit: str | None) -> str | None:
    if explicit:
        return explicit
    files = sorted(
        f for f in export_dir.rglob("*")
        if f.is_file() and f.suffix.lower() in (".ts", ".tsx", ".js", ".mjs", ".cjs")
    )
    if not files:
        return None
    for name in ENTRY_NAMES:
        rx = re.compile(ENTRY_RE % re.escape(name), re.I)
        for f in files:
            if rx.search(str(f)):
                return str(f.relative_to(export_dir))
    return str(files[0].relative_to(export_dir))


# Probe process groups that are currently alive. Each probe runs in its OWN
# session (start_new_session in run_probe), which is what makes one killpg able
# to take down the whole tsx → node tree — but it also means a killpg on THIS
# process does NOT reach them. So a caller-side timeout must send SIGTERM
# (catchable) and this handler cleans the probes up; SIGKILL would skip it and
# leave the probe's node child holding its port.
LIVE_GROUPS: set[int] = set()


def kill_all_probe_groups() -> None:
    for pgid in list(LIVE_GROUPS):
        try:
            os.killpg(pgid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError, OSError):
            pass
        LIVE_GROUPS.discard(pgid)


def _handle_signal(signum, _frame) -> None:
    """Caller-side timeout: kill every live probe, then exit."""
    kill_all_probe_groups()
    sys.exit(128 + signum)


def kill_process_group(proc: subprocess.Popen) -> None:
    """Kill the probe AND everything it spawned.

    tsx runs the entry in a CHILD node process, so killing only the direct child
    leaves that child running — and a server child keeps holding its port. The
    probe is started with start_new_session, which makes it a process-group
    leader, so one killpg takes down the whole tree.
    """
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        return
    except (ProcessLookupError, PermissionError, OSError, AttributeError):
        pass
    try:                       # non-POSIX fallback
        proc.kill()
    except Exception:
        pass


def run_probe(entry_abs: Path, args: list[str], timeout: int) -> dict:
    """Execute the entry under tsx. stdin is closed so interactive prompts EOF
    immediately instead of hanging the probe."""
    try:
        p = subprocess.Popen(
            [str(TSX), str(entry_abs), *args],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            start_new_session=True,   # own process group → killable as a tree
        )
    except OSError as exc:
        return {"args": args, "exit": None, "timedOut": False, "out": "",
                "err": f"spawn failed: {exc}"}
    LIVE_GROUPS.add(p.pid)   # start_new_session → pgid == pid
    try:
        out, err = p.communicate(timeout=timeout)
        return {
            "args": args,
            "exit": p.returncode,
            "timedOut": False,
            "out": (out or "")[-2000:],
            "err": (err or "")[-2000:],
        }
    except subprocess.TimeoutExpired:
        kill_process_group(p)
        p.communicate()
        return {"args": args, "exit": None, "timedOut": True, "out": "",
                "err": f"timed out after {timeout}s"}
    finally:
        # A clean exit still does not prove nothing was left behind: the wrapper
        # can exit while its node child keeps serving. Reap the whole group.
        kill_process_group(p)
        LIVE_GROUPS.discard(p.pid)


def looks_crashed(run: dict) -> bool:
    """A real crash, not a user-facing message. Uncaught JS errors print a stack
    (lines starting with whitespace then 'at ...'); a well-behaved CLI may print
    'Error: file not found' to stderr while running fine — that is NOT a crash."""
    blob = run["out"] + "\n" + run["err"]
    if "SyntaxError" in blob or "ReferenceError" in blob or "TypeError" in blob:
        return True
    # Node stack frames: "    at ModuleJob.run (node:internal/...)"
    if re.search(r"\n\s+at ", run["err"] or ""):
        return True
    return False


def main() -> None:
    # The caller SIGTERMs this script when its own budget expires (see
    # runCliSmoke in backend/src/sandbox/behavioralSmoke.ts). Register that
    # BEFORE any probe starts, so no probe can outlive a caller-side timeout.
    for _sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        try:
            signal.signal(_sig, _handle_signal)
        except (ValueError, OSError):
            pass   # non-main thread or unsupported platform

    ap = argparse.ArgumentParser()
    ap.add_argument("export_dir")
    ap.add_argument("--entry", default=None)
    ap.add_argument("--timeout", type=int, default=20)
    args = ap.parse_args()

    export_dir = Path(args.export_dir)
    entry_rel = pick_entry(export_dir, args.entry)
    if entry_rel is None:
        print(json.dumps({"status": "skipped", "errors": [], "detail": "no runnable entry file"}))
        return
    entry_abs = export_dir / entry_rel
    if not entry_abs.is_file():
        print(json.dumps({"status": "skipped", "errors": [], "detail": f"entry not on disk: {entry_rel}"}))
        return
    if not TSX.exists():
        print(json.dumps({"error": f"tsx binary not found at {TSX}"}))
        return

    # Probe generic invocations: most CLIs answer --help/-h; the bare run
    # catches hand-rolled arg parsers that print a menu/usage when invoked with
    # no flags (and would exit non-zero on an unimplemented --help).
    probes: list[list[str]] = [["--help"], ["-h"], []]
    runs = []
    for probe in probes:
        runs.append(run_probe(entry_abs, probe, args.timeout))

    passed = [r for r in runs if r["exit"] == 0 and r["out"].strip() and not looks_crashed(r)]
    if passed:
        first = passed[0]
        out_lines = [l.strip() for l in first["out"].splitlines() if l.strip()]
        detail = f"{entry_rel}: exit 0, {len(out_lines)} output line(s) [{probes[runs.index(first)][0]}]"
        print(json.dumps({"status": "passed", "errors": [], "detail": detail, "runs": runs}))
        return

    timed_out = all(r["timedOut"] for r in runs)
    errors: list[str] = []
    for r in runs:
        if r["timedOut"]:
            errors.append(f"invocation {r['args']} timed out")
        elif r["exit"] != 0:
            crash = next((l.strip() for l in r["err"].splitlines() if l.strip() and ("Error" in l or "error" in l or "at " in l)), None)
            errors.append(f"invocation {r['args']} exited {r['exit']}" + (f": {crash[:160]}" if crash else " with no output"))
        elif not r["out"].strip():
            errors.append(f"invocation {r['args']} exited 0 but printed NOTHING (blank/stub CLI)")

    if not errors:
        errors.append("all invocations exited 0 with empty output — app appears to be a stub")
    detail = (f"all invocations hung (interactive?)" if timed_out
              else f"CLI failed to run: {errors[0]}")
    print(json.dumps({"status": "failed", "errors": errors[:6], "detail": detail, "runs": runs}))


if __name__ == "__main__":
    main()
