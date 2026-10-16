#!/usr/bin/env python3
"""Prove that the Spark viewer actually loads and draws a scan — no human needed.

`chrome --dump-dom` cannot answer this question: it dumps at the *load* event,
and the splat is fetched by JS afterwards, so the dump always shows the initial
"loading…" whether or not the viewer works. This drives Chrome over the DevTools
Protocol instead and waits in real time for the page to say what happened.

Uses only `websockets` (already present via uvicorn[standard]) and stdlib.

    python tools/verify_viewer.py --scan testsplat
    python tools/verify_viewer.py --scan testsplat --url http://192.168.1.234:8090

Exit code 0 means the viewer reported a splat count; 1 means it failed or the
page never finished, and the console trace is printed either way.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

CHROME_CANDIDATES = ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser")

# Software WebGL. Chrome >= 128 refuses the SwiftShader fallback unless it is
# explicitly allowed, and the GPU sandbox dies in a headless container.
CHROME_FLAGS = [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu-sandbox",
    "--disable-dev-shm-usage",
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--window-size=900,700",
    "--hide-scrollbars",
]


def _find_chrome() -> str:
    for name in CHROME_CANDIDATES:
        path = shutil.which(name)
        if path:
            return path
    sys.exit("no chrome/chromium on PATH")


def _get(url: str, timeout: float = 5.0) -> dict:
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read().decode())


async def _drive(ws_url: str, deadline: float, eval_expr: str | None = None,
                 screenshot: bool = False) -> dict:
    import websockets

    async with websockets.connect(ws_url, max_size=64 * 1024 * 1024) as ws:
        n = 0

        async def call(method: str, params: dict | None = None) -> dict:
            nonlocal n
            n += 1
            await ws.send(json.dumps({"id": n, "method": method, "params": params or {}}))
            while True:
                msg = json.loads(await ws.recv())
                if msg.get("id") == n:
                    return msg
                # not ours — a console/event notification, collected below

        console: list[str] = []

        async def drain(seconds: float) -> None:
            """Read any pending notifications for `seconds` without blocking."""
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=seconds)
            except asyncio.TimeoutError:
                return
            try:
                msg = json.loads(raw)
            except ValueError:
                return
            method = msg.get("method")
            if method in ("Runtime.consoleAPICalled", "Log.entryAdded",
                          "Runtime.exceptionThrown"):
                console.append(json.dumps(msg.get("params", {}))[:500])
            elif method == "Network.loadingFailed":
                p = msg.get("params", {})
                console.append("NET-FAIL " + json.dumps(
                    {"type": p.get("type"), "error": p.get("errorText"),
                     "blocked": p.get("blockedReason"), "cors": p.get("corsErrorStatus")}))

        # Attach and enable FIRST, then reload: a load-time module error is only
        # delivered as a console event if we are already listening when it happens.
        await call("Runtime.enable")
        await call("Log.enable")
        await call("Page.enable")
        await call("Network.enable")
        await call("Page.reload", {"ignoreCache": True})
        await asyncio.sleep(1.0)

        if eval_expr is not None:
            # Kick the page first (look for module/network failures), then evaluate.
            for _ in range(12):
                await drain(0.25)
            res = await call("Runtime.evaluate", {
                "expression": eval_expr,
                "awaitPromise": True, "returnByValue": True,
            })
            for _ in range(12):
                await drain(0.25)
            value = (res.get("result") or {}).get("result", {}).get("value")
            return {"page": {"evalResult": value}, "console": console,
                    "evalOnly": True}

        # Does the bare specifier resolve under the page's import map at all?
        # This is the question a plain screenshot cannot answer.
        imp = await call("Runtime.evaluate", {
            "expression": """
              (async () => {
                try {
                  const m = await import('@sparkjsdev/spark');
                  return 'OK ' + Object.keys(m).filter(k => /Spark|Splat/.test(k)).join(',');
                } catch (e) { return 'IMPORT-ERR ' + (e && e.message ? e.message : String(e)); }
              })()
            """,
            "awaitPromise": True, "returnByValue": True,
        })
        imports = (imp.get("result") or {}).get("result", {}).get("value")

        probe = """(() => {
          const s = document.getElementById('status');
          const e = document.getElementById('err');
          const c = document.querySelector('canvas');
          let gl = null;
          if (c) { try { gl = c.getContext('webgl2') || c.getContext('webgl'); } catch (_) {} }
          return {
            status: s ? s.textContent : null,
            error: e && e.style.display !== 'none' ? e.textContent : '',
            hasCanvas: !!c,
            canvasW: c ? c.width : 0,
            canvasH: c ? c.height : 0,
            glLost: gl ? gl.isContextLost() : null,
            splats: window.__splatCount ?? null,
            importProbe: IMPORTS,
          };
        })()""".replace("IMPORTS", json.dumps(imports))

        seen: dict = {}
        shot: str | None = None
        while time.time() < deadline:
            res = await call("Runtime.evaluate",
                             {"expression": probe, "returnByValue": True})
            val = (res.get("result") or {}).get("result", {}).get("value") or {}
            seen = val
            status = (val.get("status") or "")
            if "splat" in status.lower() or "error" in status.lower():
                # Let a few frames draw before capturing, otherwise the shot can
                # beat the first real render and come back blank.
                if screenshot and "error" not in status.lower():
                    for _ in range(6):
                        await drain(0.3)
                    cap = await call("Page.captureScreenshot", {"format": "png"})
                    shot = (cap.get("result") or {}).get("data")
                return {"page": val, "console": console, "screenshot": shot}
            await drain(0.4)
            await asyncio.sleep(0.6)
        return {"page": seen, "console": console, "timed_out": True}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scan", default="", help="scan id whose viewer to open")
    ap.add_argument("--url", default="http://127.0.0.1:8090", help="server base URL")
    ap.add_argument("--port", type=int, default=9333, help="devtools port")
    ap.add_argument("--timeout", type=float, default=90.0)
    ap.add_argument("--eval", dest="eval_expr",
                    help="attach, reload, evaluate this JS in the page, print it")
    ap.add_argument("--page", help="full page URL to open instead of /viewer/<scan>")
    ap.add_argument("--screenshot",
                    help="write a PNG of the rendered frame here (proves it drew)")
    a = ap.parse_args()

    chrome = _find_chrome()
    flags = CHROME_FLAGS
    # Lets us bisect which flag is behind an environment-specific failure:
    #   SPARK_VERIFY_FLAGS="--headless=new --enable-unsafe-swiftshader" ...
    override = os.environ.get("SPARK_VERIFY_FLAGS")
    if override:
        flags = override.split()
    target = a.page or f"{a.url.rstrip('/')}/viewer/{a.scan}"
    profile = tempfile.mkdtemp(prefix="sparkverify-")
    proc = subprocess.Popen(
        [chrome, *flags, f"--remote-debugging-port={a.port}",
         f"--user-data-dir={profile}", target],
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
    )
    try:
        base = f"http://127.0.0.1:{a.port}"
        for _ in range(120):
            try:
                _get(base + "/json/version", 2)
                break
            except Exception:
                if proc.poll() is not None:
                    sys.exit(f"chrome exited early: {proc.stderr.read().decode()[-500:]}")
                time.sleep(0.25)
        else:
            sys.exit("devtools endpoint never came up")

        ws_url = None
        for _ in range(120):
            for t in _get(base + "/json/list", 3):
                if t.get("type") == "page" and t.get("webSocketDebuggerUrl"):
                    ws_url = t["webSocketDebuggerUrl"]
                    break
            if ws_url:
                break
            time.sleep(0.25)
        if not ws_url:
            sys.exit("no page target appeared")

        out = asyncio.run(_drive(ws_url, time.time() + a.timeout, a.eval_expr,
                                 bool(a.screenshot)))
    finally:
        proc.terminate()
        try:
            proc.wait(10)
        except subprocess.TimeoutExpired:
            proc.kill()
        shutil.rmtree(profile, ignore_errors=True)

    if out.get("screenshot") and a.screenshot:
        import base64
        with open(a.screenshot, "wb") as fh:
            fh.write(base64.b64decode(out["screenshot"]))
        print(f"screenshot      : {a.screenshot}")
    page, console = out["page"], out.get("console", [])
    if out.get("evalOnly"):
        print(json.dumps(page.get("evalResult"), indent=2))
        for line in console[:20]:
            print("  console:", line)
        return 0
    print(f"target          : {target}")
    print(f"canvas          : {page.get('hasCanvas')} "
          f"{page.get('canvasW')}x{page.get('canvasH')}")
    print(f"webgl lost      : {page.get('glLost')}")
    print(f"import probe    : {page.get('importProbe')!r}")
    print(f"status          : {page.get('status')!r}")
    if page.get("error"):
        print(f"page error      : {page['error']}")
    if out.get("timed_out"):
        print("NOTE            : timed out waiting for a terminal status")
    if console:
        print("console:")
        for line in console[:15]:
            print("   ", line)

    status = (page.get("status") or "").lower()
    ok = "splat" in status and "error" not in status
    print("\nRESULT:", "RENDERED" if ok else "NOT RENDERED")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
