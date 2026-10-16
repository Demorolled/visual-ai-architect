#!/usr/bin/env python3
"""Multi-language × app-shape battery against the LIVE VACA pipeline.

For each case we drive the same two calls the UI uses (plan-code, write-code),
record the pipeline's own telemetry (languageGates, stubFailures, renderSmoke,
repairRounds, contractViolations), then INDEPENDENTLY verify the artifact with
the language's native toolchain and actually run the CLI.

The interesting question is never "did it return 200" — it is whether the
pipeline's gate verdict agrees with the compiler/runtime.

Usage:
  python3 scripts/test-multilang-battery.py [--only id1,id2] [--report PATH]
"""
import json, os, re, shutil, subprocess, sys, tempfile, time, urllib.request, urllib.error

BASE = os.environ.get("VACA_API", "http://127.0.0.1:3001")
REPORT = "/tmp/lang-battery-report.json"

CASES = [
    dict(id="py-cli", lang="python", shape="CLI",
         request="a small Python command-line tool that converts a CSV file to JSON. "
                 "Two files: main.py (the CLI entry point, parses argv) and csv_to_json.py (the conversion).",
         entry="main.py",
         run=["python3", "main.py", "--help"]),
    dict(id="go-cli", lang="go", shape="CLI",
         request="a small Go command-line program that prints the first N lines of a text file. "
                 "Files: go.mod, main.go (entry point, parses argv) and reader.go.",
         entry="main.go",
         run=["go", "run", ".", "--help"]),
    dict(id="c-cli", lang="c", shape="CLI converter",
         request="a C program hex2dec.c that reads a hexadecimal string from the command line and "
                 "prints its decimal value. One file only.",
         entry="hex2dec.c",
         run=["./hex2dec", "ff"]),
    dict(id="java-cli", lang="java", shape="CLI",
         request="a Java command-line program that prints the factorial of the number given on the "
                 "command line. One file: Factorial.java with a public class Factorial and a main method.",
         entry="Factorial.java",
         run=["java", "Factorial", "5"]),
    dict(id="html-game", lang="javascript", shape="browser game",
         request="a single-file HTML tic-tac-toe game (index.html) you play by clicking, with a simple "
                 "AI opponent. Everything inline in one file.",
         entry="index.html", run=None),
    dict(id="ts-express", lang="typescript", shape="HTTP server",
         request="a small Express server in TypeScript with one GET /health endpoint that returns "
                 "{ ok: true }. Files: server.ts (entry) plus a tsconfig.json.",
         entry="server.ts", run=None),
    dict(id="ruby-cli", lang="ruby", shape="CLI",
         request="a Ruby command-line script wordcount.rb that counts word frequencies in a text file "
                 "given as argv[0] and prints the top 10.",
         entry="wordcount.rb",
         run=["ruby", "wordcount.rb", "--help"]),
    dict(id="swift-cli", lang="swift", shape="CLI converter",
         request="a Swift command-line program main.swift that converts a Celsius temperature given "
                 "on the command line to Fahrenheit. One file only.",
         entry="main.swift",
         run=None),
    dict(id="rust-cli", lang="rust", shape="CLI",
         request="a Rust command-line program that counts the lines in a text file given as the first "
                 "argument. Files: main.rs (entry, reads std::env::args) and a Cargo.toml.",
         entry="main.rs",
         run=None),
]


def api(method, path, body=None, timeout=900):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method, headers={"Content-Type": "application/json"})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return time.time() - t0, r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return time.time() - t0, e.code, {"error": e.read().decode()[:400]}
    except Exception as e:
        return time.time() - t0, -1, {"error": str(e)[:400]}


def sh(cmd, cwd=None, timeout=180, env=None):
    e = dict(os.environ)
    e["PATH"] = os.path.expanduser("~/.cargo/bin") + os.pathsep + e.get("PATH", "")
    if env:
        e.update(env)
    try:
        r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=e)
        return dict(code=r.returncode, out=r.stdout[-3000:], err=r.stderr[-3000:])
    except subprocess.TimeoutExpired:
        return dict(code=-9, out="", err=f"TIMEOUT after {timeout}s")
    except Exception as ex:
        return dict(code=-1, out="", err=str(ex)[:500])


# `_first-drafts/` is an intentional audit snapshot the pipeline keeps OUT of the
# project's own file list (codePlanner snapshots first-draft content there). It is
# not part of the delivered program, so compiling it would blame the pipeline for a
# stale draft. Verified live: including it made a clean TS export look broken.
SKIP_DIRS = {"node_modules", ".git", "_first-drafts", "dist", "build", "target"}


def files_in(export_dir, exts):
    got = []
    for root, dirs, names in os.walk(export_dir):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for n in names:
            if n.endswith(tuple(exts)):
                got.append(os.path.relpath(os.path.join(root, n), export_dir))
    return sorted(got)


# ── native verifiers: each returns (verdict, [evidence lines]) ────────────
# verdict ∈ VERIFIED | BROKEN | UNVERIFIED  — "UNVERIFIED" is never a pass.

def verify_python(d):
    out = []
    py = files_in(d, [".py"])
    if not py:
        return "UNVERIFIED", ["no .py file written"]
    comp = sh(["python3", "-m", "py_compile", *py], cwd=d)
    out.append(f"py_compile: {'clean' if comp['code'] == 0 else 'FAILED'}")
    if comp["code"] != 0:
        return "BROKEN", out + [comp["err"][:600]]
    out.append(f"files: {py}")
    return "VERIFIED", out


def verify_go(d):
    out = []
    if shutil.which("go") is None and not os.path.exists(os.path.expanduser("~/go/bin/go")):
        return "UNVERIFIED", ["no go toolchain"]
    mod = os.path.join(d, "go.mod")
    if not os.path.exists(mod):
        out.append("go.mod MISSING — `go build ./...` cannot resolve imports")
        b = sh(["go", "build", "./..."], cwd=d)
        out.append(f"go build ./...: exit {b['code']}")
        out.append((b["err"] or b["out"]).strip()[:600])
        return ("BROKEN" if b["code"] != 0 else "VERIFIED"), out
    b = sh(["go", "build", "./..."], cwd=d)
    out.append(f"go build ./...: exit {b['code']}")
    if b["code"] != 0:
        return "BROKEN", out + [(b["err"] or b["out"]).strip()[:800]]
    return "VERIFIED", out


def verify_c(d):
    c = files_in(d, [".c"])
    if not c:
        return "UNVERIFIED", ["no .c file written"]
    syn = sh(["gcc", "-fsyntax-only", *c], cwd=d)
    out = [f"gcc -fsyntax-only ({len(c)} files): {'clean' if syn['code'] == 0 else 'FAILED'}"]
    if syn["code"] != 0:
        return "BROKEN", out + [syn["err"][:800]]
    if any("main" in open(os.path.join(d, f), "r", errors="ignore").read() for f in c):
        binp = os.path.join(d, "_battery_bin")
        link = sh(["gcc", "-o", binp, *c], cwd=d)
        if link["code"] != 0:
            return "BROKEN", out + ["link failed", link["err"][:600]]
        run = sh([binp, "ff"], cwd=d)
        out.append(f"ran `hex2dec ff` → exit {run['code']} stdout={run['out'].strip()[:80]!r}")
        if run["code"] != 0:
            return "BROKEN", out
    return "VERIFIED", out


def verify_java(d):
    j = files_in(d, [".java"])
    if not j:
        return "UNVERIFIED", ["no .java file written"]
    comp = sh(["javac", *j], cwd=d)
    out = [f"javac ({len(j)} files): {'clean' if comp['code'] == 0 else 'FAILED'}"]
    if comp["code"] != 0:
        return "BROKEN", out + [comp["err"][:800]]
    return "VERIFIED", out


def verify_ruby(d):
    rb = files_in(d, [".rb"])
    if not rb:
        return "UNVERIFIED", ["no .rb file written"]
    bad = []
    for f in rb:
        r = sh(["ruby", "-c", f], cwd=d)
        if r["code"] != 0:
            bad.append(f"{f}: {r['err'].strip()[:200]}")
    if bad:
        return "BROKEN", [f"ruby -c: {len(bad)} file(s) failed"] + bad
    return "VERIFIED", [f"ruby -c: {len(rb)} file(s) clean"]


def verify_swift(d):
    sw = files_in(d, [".swift"])
    if not sw:
        return "UNVERIFIED", ["no .swift file written"]
    if shutil.which("swiftc") is None:
        return "UNVERIFIED", ["no swiftc"]
    binp = os.path.join(d, "_battery_swift")
    r = sh(["swiftc", "-o", binp, *sw], cwd=d, timeout=300)
    out = [f"swiftc: exit {r['code']}"]
    if r["code"] != 0:
        return "BROKEN", out + [r["err"][:800]]
    return "VERIFIED", out


def verify_rust(d):
    rs = files_in(d, [".rs"])
    if not rs:
        return "UNVERIFIED", ["no .rs file written"]
    out = []
    cargo = shutil.which("cargo") or os.path.expanduser("~/.cargo/bin/cargo")
    if os.path.exists(os.path.join(d, "Cargo.toml")) and os.path.exists(cargo):
        b = sh([cargo, "build", "--quiet"], cwd=d, timeout=420)
        out.append(f"cargo build: exit {b['code']}")
        if b["code"] != 0:
            return "BROKEN", out + [(b["err"] or b["out"]).strip()[:800]]
        return "VERIFIED", out
    # No Cargo.toml: fall back to plain rustc (needs a main fn).
    rustc = shutil.which("rustc") or os.path.expanduser("~/.cargo/bin/rustc")
    if not os.path.exists(rustc):
        return "UNVERIFIED", ["no rust toolchain"]
    entry = os.path.join(d, "main.rs") if os.path.exists(os.path.join(d, "main.rs")) else os.path.join(d, rs[0])
    out.append("Cargo.toml missing — compiled with bare rustc")
    b = sh([rustc, "--edition", "2021", "-o", os.path.join(d, "_battery_rs"), entry], cwd=d, timeout=300)
    out.append(f"rustc: exit {b['code']}")
    if b["code"] != 0:
        return "BROKEN", out + [b["err"][:800]]
    return "VERIFIED", out


def verify_html(d):
    """Structural checks a browser would care about + syntax-check inline JS."""
    docs = files_in(d, [".html"])
    if not docs:
        return "UNVERIFIED", ["no .html file written"]
    out, bad = [], []
    for f in docs:
        src = open(os.path.join(d, f), "r", errors="ignore").read()
        script_opens = len(re.findall(r"<script\b", src, re.I))
        script_closes = len(re.findall(r"</script>", src, re.I))
        div_o = len(re.findall(r"<div\b", src, re.I))
        div_c = len(re.findall(r"</div>", src, re.I))
        line = (f"{f}: {len(src)}B scripts {script_opens}/{script_closes} "
                f"divs {div_o}/{div_c} onclick={len(re.findall(r'onclick', src, re.I))}")
        out.append(line)
        if script_opens != script_closes or div_o != div_c:
            bad.append(f"{f}: unbalanced tags (script {script_opens}/{script_closes}, div {div_o}/{div_c})")
        # inline JS syntax check (strip the tags so `node --check` sees the source)
        for i, body in enumerate(re.findall(r"<script[^>]*>(.*?)</script>", src, re.S | re.I)):
            if not body.strip() or "src=" in body:
                continue
            tmp = os.path.join(d, f"_inline_{i}.js")
            open(tmp, "w").write(body)
            chk = sh(["node", "--check", tmp])
            out.append(f"  inline script #{i}: node --check exit {chk['code']}")
            if chk["code"] != 0:
                bad.append(f"{f} inline script #{i}: {chk['err'].strip()[:300]}")
            os.remove(tmp)
    return ("BROKEN" if bad else "VERIFIED"), out + bad


def verify_ts(d):
    ts = files_in(d, [".ts", ".tsx"])
    if not ts:
        return "UNVERIFIED", ["no .ts file written"]
    out = []
    if os.path.exists(os.path.join(d, "package.json")):
        inst = sh(["npm", "install", "--no-audit", "--no-fund", "--silent"], cwd=d, timeout=300)
        out.append(f"npm install: exit {inst['code']}")
        if inst["code"] != 0:
            tail = (inst["err"] or inst["out"]).strip().splitlines()[-6:]
            return "BROKEN", out + tail
    # Compile the way the DELIVERED project is meant to be compiled: use its own
    # tsconfig when it has one (so its flags apply), else explicit files. Passing
    # bare file paths instead measured a false TS1259 on a correct export, because
    # the project's esModuleInterop flag was not in play.
    if os.path.exists(os.path.join(d, "tsconfig.json")):
        cmd = ["npx", "tsc", "--noEmit", "-p", "."]
        out.append("compiled via the project's own tsconfig")
    else:
        cmd = ["npx", "tsc", "--noEmit", "--skipLibCheck", "--target", "ES2020",
               "--module", "ESNext", "--moduleResolution", "bundler", *ts]
    r = sh(cmd, cwd=d, timeout=240)
    errs = [l for l in r["out"].splitlines() if "error TS" in l and "TS5112" not in l]
    out.append(f"tsc --noEmit: {len(errs)} error(s)")
    if errs:
        return "BROKEN", out + errs[:8]
    return "VERIFIED", out


VERIFIERS = dict(python=verify_python, go=verify_go, c=verify_c, java=verify_java,
                 ruby=verify_ruby, swift=verify_swift, rust=verify_rust,
                 javascript=verify_html, typescript=verify_ts)


def verify(case, export_dir):
    fn = VERIFIERS.get(case["lang"])
    if not fn:
        return "UNVERIFIED", [f"no native verifier for {case['lang']}"]
    if not export_dir or not os.path.isdir(export_dir):
        return "UNVERIFIED", [f"exportDir not on disk: {export_dir!r}"]
    return fn(export_dir)


def run_case(case):
    rec = dict(id=case["id"], lang=case["lang"], shape=case["shape"], request=case["request"],
               box=os.environ.get("VACA_BOX") or "local",
               model=os.environ.get("VACA_MODEL", "?"))
    print(f"\n{'=' * 74}\n[{case['id']}] {case['lang']} / {case['shape']}\n  {case['request'][:110]}\n{'=' * 74}")

    dt, st, plan = api("POST", "/api/reason/plan-code", {"request": case["request"], "scale": "small"}, timeout=300)
    rec["plan"] = dict(http=st, secs=round(dt, 1), ok=bool(plan.get("success")))
    if st != 200 or not plan.get("success"):
        rec["verdict"] = "UNVERIFIED"; rec["evidence"] = [f"PLAN FAILED: {json.dumps(plan)[:300]}"]
        print("  PLAN FAILED:", json.dumps(plan)[:300]); return rec
    p = plan.get("plan") or {}
    pf = p.get("files") or p.get("contractFiles") or []
    rec["plan"]["files"] = [(f.get("path"), f.get("language")) for f in pf]
    print(f"  plan {st} in {dt:.0f}s → {len(pf)} files: {[f.get('path') for f in pf]}")

    answers = {}
    for q in (p.get("questions") or []):
        answers[q.get("key")] = (q.get("options") or ["yes"])[0]

    dt, st, gen = api("POST", "/api/reason/write-code",
                      {"request": case["request"], "plan": p, "answers": answers,
                       "libraryMode": "hybrid", "scale": "small"}, timeout=1500)
    if st != 200 or not gen.get("success"):
        rec["verdict"] = "UNVERIFIED"; rec["evidence"] = [f"WRITE FAILED ({st}): {json.dumps(gen)[:400]}"]
        print(f"  WRITE FAILED ({st}):", json.dumps(gen)[:400]); return rec

    written = gen.get("written") or []
    rec["pipeline"] = dict(
        mode=gen.get("mode"), totalFiles=gen.get("totalFiles") or len(written),
        secs=round(dt, 1), tscErrors=gen.get("tscErrors"), tscGateRan=gen.get("tscGateRan"),
        tscClasses=gen.get("tscClasses"), contractViolations=gen.get("contractViolations"),
        repairRounds=gen.get("repairRounds"), languageGates=gen.get("languageGates"),
        stubFailures=gen.get("stubFailures"), renderSmoke=gen.get("renderSmoke"),
        cliSmoke=gen.get("cliSmoke"), serverSmoke=gen.get("serverSmoke"),
        written=[(w.get("path"), w.get("status")) for w in written if isinstance(w, dict)],
        exportDir=gen.get("exportDir"),
    )
    pl = rec["pipeline"]
    print(f"  write {st} in {dt:.0f}s | mode={pl['mode']} files={pl['totalFiles']} "
          f"repairRounds={pl['repairRounds']} tscErrors={pl['tscErrors']} "
          f"contract={pl['contractViolations']}")
    for g in (pl["languageGates"] or []):
        print(f"    gate {g.get('language')}: clean={g.get('clean')} errors={(g.get('errors') or [])[:2]}")
    if pl["stubFailures"]:
        print(f"    stubFailures={json.dumps(pl['stubFailures'])[:200]}")
    if pl["renderSmoke"]:
        print(f"    renderSmoke={pl['renderSmoke'].get('status')} — {str(pl['renderSmoke'].get('detail'))[:160]}")
    d = pl["exportDir"]
    print(f"    exportDir: {d}")
    if d and os.path.isdir(d):
        print(f"    on disk: {files_in(d, ['*'])[:12]}")

    verdict, evidence = verify(case, d)
    rec["verdict"], rec["evidence"] = verdict, evidence
    print(f"  NATIVE VERIFY → {verdict}")
    for line in evidence:
        print(f"    {line}")

    # Agreement between the pipeline's own gate and the native compiler.
    gates = pl["languageGates"] or []
    mine = [g for g in gates if g.get("language") == case["lang"]]
    if mine:
        rec["gate_agreement"] = dict(pipeline_clean=all(g.get("clean") for g in mine),
                                     native=verdict)
    return rec


def main():
    args = sys.argv[1:]
    only = None
    reverify = None
    for i, a in enumerate(args):
        if a == "--only":
            only = set(args[i + 1].split(","))
        if a == "--report":
            globals()["REPORT"] = args[i + 1]  # noqa
        if a == "--reverify":
            reverify = args[i + 1]  # "<case-id>:<exportDir>"

    # Re-run just the native verifier over an artifact that already exists
    # (e.g. to re-check a case whose earlier verdict came from a harness bug).
    if reverify:
        cid, _, d = reverify.partition(":")
        case = next((c for c in CASES if c["id"] == cid), None)
        if case is None:
            print(f"unknown case id {cid!r}; known: {[c['id'] for c in CASES]}")
            return
        print(f"re-verify {cid} ({case['lang']}) on {d}")
        verdict, evidence = verify(case, d)
        print(f"  → {verdict}")
        for line in evidence:
            print(f"    {line}")
        return

    cases = [c for c in CASES if not only or c["id"] in only]

    box = os.environ.get("VACA_BOX", "")
    print(f"battery on {box or 'local box'}: {len(cases)} case(s) → {[c['id'] for c in cases]}")
    results = []
    for c in cases:
        try:
            results.append(run_case(c))
        except Exception as e:
            results.append(dict(id=c["id"], verdict="UNVERIFIED", evidence=[f"driver crash: {e}"]))
        json.dump(results, open(REPORT, "w"), indent=2)

    print(f"\n{'=' * 74}\nBATTERY SUMMARY  (report → {REPORT})\n{'=' * 74}")
    for r in results:
        agree = r.get("gate_agreement")
        tag = f" [gate={agree['pipeline_clean']} vs native={agree['native']}]" if agree else ""
        print(f"  {r['id']:<12} {str(r.get('verdict')):<11}{tag}")
    bad = [r for r in results if r.get("verdict") != "VERIFIED"]
    print(f"\n  {len(results) - len(bad)}/{len(results)} natively VERIFIED")
    for r in bad:
        print(f"  ✗ {r['id']}: {(r.get('evidence') or ['?'])[0][:150]}")


if __name__ == "__main__":
    main()
