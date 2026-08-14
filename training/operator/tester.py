#!/usr/bin/env python3
"""
Deterministic acceptance tester for the VACA build-ladder operator.

Given an export directory and a build spec, runs the app for real and checks
the acceptance criteria (exact substrings in output/page):

  python  — run the entry file with python3 in the export cwd
  node    — spawn server.js with PORT, run the spec's HTTP checks
  web     — serve the export dir, drive it in headless Chromium (Playwright),
            capture page errors + console errors, check page text

Returns (passed: bool, detail: str, evidence: dict).
"""
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


def find_entry(export_dir: Path, name: str) -> Path | None:
    """Locate the entry file by basename anywhere under export_dir.
    Always returns an ABSOLUTE path so subprocess cwd+entry can never
    double-prefix (the s14 correction caught this)."""
    for root, _dirs, files in os.walk(str(export_dir)):
        if name in files:
            return (Path(root) / name).resolve()
    return None


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _checks_pass(output: str, expect: list[str], regex: list[str] | None = None) -> tuple[bool, str]:
    missing = [e for e in expect if e not in output]
    if missing:
        return False, "missing expected output: " + ", ".join(repr(m) for m in missing)
    for pat in regex or []:
        if not re.search(pat, output):
            return False, f"regex not matched: {pat!r}"
    return True, "all %d acceptance checks present" % (len(expect) + len(regex or []))


def test_python(export_dir: Path, spec: dict) -> tuple[bool, str, dict]:
    entry = find_entry(export_dir, spec["entry"])
    if not entry:
        return False, f"entry file {spec['entry']} not found in export", {}
    # command-line ARG variants: the model drifts between flag styles or
    # makes a no-args script take required args (h07's argparse CLI). Try each
    # arg-set (plus a plain no-args run) until one produces real output.
    base = [sys.executable, str(entry)]
    arg_variants = spec.get("args")
    if not isinstance(arg_variants, list) or not arg_variants:
        arg_variants = [[]]
    elif not any(isinstance(a, list) for a in arg_variants):
        arg_variants = [arg_variants]
    if [] not in arg_variants:
        arg_variants = arg_variants + [[]]
    # nested-src projects (h07): main.py inside src/ may import 'from src.hash'
    # OR 'from hash' — put BOTH the export root and the entry's dir on
    # PYTHONPATH so either style resolves without patching the file.
    env = dict(os.environ)
    env["PYTHONPATH"] = os.pathsep.join([str(export_dir), str(entry.parent)])
    # scripted answers for interactive CLI apps: a single string OR a list of
    # variants (the model drifts between "A-D" letters and "1-4" numbers —
    # s18) — try each until one produces output instead of crashing/hanging.
    stdin_variants = spec.get("stdin")
    if isinstance(stdin_variants, str):
        stdin_variants = [stdin_variants]
    elif not stdin_variants:
        stdin_variants = [None]
    last = None
    for argv in arg_variants:
        for stdin in stdin_variants:
            t0 = time.time()
            try:
                last = subprocess.run(base + list(argv), cwd=str(export_dir), capture_output=True,
                                      env=env, input=stdin, text=True,
                                      timeout=spec.get("timeout", 60))
            except subprocess.TimeoutExpired:
                return False, f"timed out after {spec.get('timeout', 60)}s (app waiting for input?)", {}
            if (last.stdout or "").strip() and last.returncode == 0:
                break
        if (last.stdout or "").strip() and last.returncode == 0:
            break
    r = last
    out = (r.stdout or "") + "\n" + (r.stderr or "")
    if r.returncode != 0:
        tail = (r.stderr or r.stdout or "")[-600:]
        return False, f"exit code {r.returncode}: {tail[:500]}", {"rc": r.returncode, "out": out[-1500:]}
    if not (r.stdout or "").strip():
        return False, "script exited 0 with NO output — the entry code never executed (no __main__ guard / no top-level call)", \
            {"rc": r.returncode, "out": out[-1500:]}
    ok, why = _checks_pass(out, spec["expect"], spec.get("regex"))
    ev = {"rc": r.returncode, "out": out[-1500:], "seconds": round(time.time() - t0, 1)}
    return ok, why, ev


def json_dumps(o) -> str:
    import json
    return json.dumps(o)


def test_node(export_dir: Path, spec: dict) -> tuple[bool, str, dict]:
    entry = find_entry(export_dir, spec["entry"])
    if not entry:
        return False, f"entry file {spec['entry']} not found in export", {}
    port = _free_port()
    env = dict(os.environ, PORT=str(port))
    proc = subprocess.Popen(["node", str(entry)], cwd=str(export_dir),
                            env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            text=True, start_new_session=True)
    checks = spec.get("server", {}).get("checks", [{"method": "GET", "path": "/"}])
    if not checks:
        checks = [{"method": "GET", "path": "/"}]
    bodies, health = [], None
    try:
        # wait for the server to come up: ANY HTTP response (even 4xx/5xx, even
        # an HTTPError from a GET on a POST-only endpoint — e17) proves it is
        # listening. Only connection-level failures count as "not up yet".
        up = False
        for _ in range(40):
            if proc.poll() is not None:
                break
            try:
                req = urllib.request.Request(f"http://127.0.0.1:{port}{checks[0]['path']}")
                try:
                    with urllib.request.urlopen(req, timeout=2) as r:
                        health = r.status
                except urllib.error.HTTPError as e:
                    health = e.code  # any HTTP status = server is listening
                up = True
                break
            except Exception:
                time.sleep(0.75)
        if not up:
            err = ""
            if proc.poll() is not None:
                err = proc.stderr.read() if proc.stderr else ""
            return False, f"server never came up ({'crashed' if proc.poll() is not None else 'no response'}): {err[:400]}", {"rc": proc.poll()}
        for chk in checks:
            method = chk.get("method", "GET")
            path = chk.get("path", "/")
            body = chk.get("body")
            data = None if body is None else os.fsencode(json_dumps(body))
            req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data, method=method,
                                         headers={"Content-Type": "application/json"})
            try:
                with urllib.request.urlopen(req, timeout=10) as r:
                    b = r.read().decode("utf-8", "replace")
            except Exception as e:
                b = f"ERR {e}"
            bodies.append({"method": method, "path": path, "status": 0, "body": b[:1200]})
    finally:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except Exception:
            pass
        try:
            proc.wait(timeout=5)
        except Exception:
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
            except Exception:
                pass
    first = bodies[0]["body"] if bodies else ""
    ok, why = _checks_pass(first, spec["expect"], spec.get("regex"))
    return ok, why, {"health": health, "checks": bodies}


def test_web(export_dir: Path, spec: dict) -> tuple[bool, str, dict]:
    entry = find_entry(export_dir, spec["entry"])
    if not entry:
        return False, f"entry file {spec['entry']} not found in export", {}
    port = _free_port()
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(port),
                            "--bind", "127.0.0.1", "--directory", str(export_dir)],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           start_new_session=True)
    page_errors, console_errors = [], []
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.on("pageerror", lambda e: page_errors.append(str(e)))
            page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
            try:
                page.goto(f"http://127.0.0.1:{port}/{entry.relative_to(export_dir).as_posix()}",
                          wait_until="domcontentloaded", timeout=spec.get("timeout", 90) * 1000)
                page.wait_for_timeout(1200)
            except Exception as e:
                browser.close()
                return False, f"page load failed: {str(e)[:300]}", {"pageErrors": page_errors}
            body = page.text_content("body") or ""
            html = page.content()[:8000]
            browser.close()
    except ImportError:
        return False, "playwright not installed", {}
    finally:
        try:
            os.killpg(os.getpgid(srv.pid), signal.SIGTERM)
        except Exception:
            pass
    fatal = [e for e in page_errors if re.search(r"(Uncaught|ReferenceError|TypeError|SyntaxError|is not defined|Cannot read)", e)]
    if fatal:
        return False, f"page JS errors: {fatal[0][:200]}", {"pageErrors": page_errors, "consoleErrors": console_errors[:10]}
    ok, why = _checks_pass(body, spec["expect"], spec.get("regex"))
    ev = {"pageErrors": page_errors, "consoleErrors": console_errors[:10], "bodySnippet": body[:800], "htmlSnippet": html[:600]}
    return ok, why, ev


def test_export(export_dir: str | Path, spec: dict) -> tuple[bool, str, dict]:
    d = Path(export_dir)
    if not d.is_dir():
        return False, f"export dir missing: {d}", {}
    lang = spec.get("lang", "python")
    if lang == "python":
        return test_python(d, spec)
    if lang == "node":
        return test_node(d, spec)
    if lang == "web":
        return test_web(d, spec)
    return False, f"unknown lang {lang}", {}
