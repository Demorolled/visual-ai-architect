#!/usr/bin/env python3
"""probe — does the LLM actually KNOW the languages VACA builds in?

Asking a model "do you know Rust?" is worthless. This asks it to *write* the code
in the exact conditions VACA generates under — the same task, and the same
`languageGuidanceBlock()` VACA injects into its write prompt — then holds the
answer to VACA's own standard:

  1. compile gate   the real toolchain, via toolchains.py
  2. execution      run it and compare stdout to the expected line
  3. contract       no markdown fences; no third-party imports; the language's
                    entry-point rule respected

A language the model passes at all three levels is "known". Anything else is a
gap, and the gap rows are written to `training/dataset/language-gaps.jsonl`.

Two models are probed by default so the result is interpretable:
  vaca-r20-q4          the fine-tuned model VACA actually ships
  qwen2.5-coder:14b    its base — separates "the fine-tune broke it" from
                       "the base never knew it"

Usage:
  python3 training/vacalatest/probe.py                      # all languages, both models
  python3 training/vacalatest/probe.py --languages rust,go
  python3 training/vacalatest/probe.py --models vaca-r20-q4:latest
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import toolchains as T  # noqa: E402

REPO = HERE.parent.parent
DATASET = REPO / "training" / "dataset"
REPORTS = HERE / "reports"
EXEMPLARS = HERE / "exemplars"
MANIFEST_CACHE = HERE / "vaca-manifest.json"

OLLAMA = "http://127.0.0.1:11434"
DEFAULT_MODELS = ["vaca-r20-q4:latest", "qwen2.5-coder:14b"]

SAMPLE_INPUT = "the quick brown fox the fox\n"
EXPECTED = "words=6 distinct=4"

TASK = (
    "Write a {lang} program that reads all of stdin, splits it into "
    "whitespace-separated words, and prints exactly one line:\n"
    "words=<count> distinct=<distinct-count>\n"
    "Single file, standard library only, no explanation — output the file contents only."
)

# Node's built-in module names, so `require('readline')` is not mistaken for a
# third-party dependency (the `node:` prefix is optional).
NODE_BUILTINS = {
    "assert", "async_hooks", "buffer", "child_process", "cluster", "console",
    "constants", "crypto", "dgram", "diagnostics_channel", "dns", "domain",
    "events", "fs", "http", "http2", "https", "inspector", "module", "net",
    "os", "path", "perf_hooks", "process", "punycode", "querystring",
    "readline", "repl", "stream", "string_decoder", "sys", "timers", "tls",
    "trace_events", "tty", "url", "util", "v8", "vm", "wasi",
    "worker_threads", "zlib",
}

# Third-party markers per language (a stdlib-only rule is part of every contract).
THIRD_PARTY = {
    "python": [r"^\s*import\s+(requests|numpy|pandas|flask|yaml|click)\b",
               r"^\s*from\s+(requests|numpy|pandas|flask|yaml|click)\b"],
    "rust": [r"extern\s+crate\s+\w+", r"use\s+(serde|rand|clap|tokio|regex|anyhow)\b"],
    "go": [r"github\.com/", r"gopkg\.in/", r"example\.com/", r"\byaml\b"],
    "java": [r"^\s*import\s+(?!java|javax)"],
    "csharp": [r"^\s*using\s+(?!System)\w+", r"NuGet"],
    "kotlin": [r"kotlinx\.", r"^\s*import\s+(?!kotlin|java)"],
    "swift": [r"^\s*import\s+(?!Foundation|Swift|Glibc|Darwin)\w+"],
    "php": [r"require\s+['\"]vendor/", r"use\s+\w+\\"],
    "ruby": [r"^\s*require\s+['\"](?!json|set|strscan)"],
    "c": [r"#include\s+<(?!stdio|stdlib|string|ctype|math|errno|time|stdbool|limits|stddef|assert)"],
    "cpp": [r"#include\s+<(?!iostream|string|vector|map|set|unordered_set|unordered_map|algorithm|sstream|fstream|memory|chrono|random|functional|numeric|iomanip|cstdint|cstdio|cstring|cctype|optional|variant|tuple|array|deque|queue|stack|list|iterator|utility|limits|stdexcept>)", r"bits/stdc\+\+\.h"],
}

# Node built-in modules referenced as a bare name (no `node:` prefix).
NODE_IMPORT_RE = re.compile(
    r"(?:from\s+|require\(\s*|import\s*\()['\"]([^'\"]+)['\"]"
)

# The entry-point rule languageGuidance.ts states, as a checkable pattern.
ENTRY_RULES = {
    "go": ("func main()", "declares func main()"),
    "rust": ("fn main", "declares fn main"),
    "c": ("int main", "declares int main"),
    "cpp": ("int main", "declares int main"),
    "java": (r"static\s+void\s+main", "declares static void main"),
    "csharp": (r"static\s+void\s+Main", "declares static void Main"),
    "kotlin": (r"fun\s+main", "declares fun main"),
    "python": (r'if\s+__name__\s*==\s*[\'"]__main__[\'"]', "guards __main__"),
    "php": (r"<\?php", "opens with <?php"),
}

FENCE_RE = re.compile(r"```[a-zA-Z0-9]*\n(.*?)```", re.S)


def ollama_generate(model: str, prompt: str, timeout: int = 300) -> dict:
    body = json.dumps({
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0, "num_ctx": 8192},
    }).encode()
    req = urllib.request.Request(
        f"{OLLAMA}/api/generate", data=body,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def extract_code(text: str) -> tuple[str, bool]:
    """Return (code, had_fences). VACA's known failure class is leaking fences."""
    blocks = FENCE_RE.findall(text)
    if blocks:
        return max(blocks, key=len).strip(), True
    return text.strip(), False


def check_contract(lang: str, code: str, filename: str = "") -> list[str]:
    problems = []
    if lang in ("javascript", "typescript"):
        for spec in NODE_IMPORT_RE.findall(code):
            if spec.startswith("node:"):
                continue
            if spec.split("/")[0] in NODE_BUILTINS:
                continue
            problems.append(f"third-party dependency: {spec}")
        # VACA generates ESM; `require` is illegal in an ES module.
        if filename.endswith(".mjs") and re.search(r"\brequire\s*\(", code):
            problems.append("uses require() in an ES module (.mjs)")
    else:
        for pat in THIRD_PARTY.get(lang, []):
            m = re.search(pat, code, re.M)
            if m:
                problems.append(f"third-party dependency: {m.group(0).strip()[:60]}")
    rule = ENTRY_RULES.get(lang)
    if rule and not re.search(rule[0], code, re.M):
        problems.append(f"does not {rule[1]}")
    return problems


def exemplar_files(lang: str) -> dict[str, str]:
    d = EXEMPLARS / lang
    return {f.name: f.read_text(encoding="utf-8") for f in sorted(d.iterdir()) if f.is_file()}


def probe_language(model: str, lang: str, guidance_block: str) -> dict:
    prompt = f"{TASK.format(lang=lang)}\n\n{guidance_block}"
    started = time.time()
    try:
        out = ollama_generate(model, prompt)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return {"language": lang, "model": model, "error": f"{type(exc).__name__}: {exc}"}
    elapsed = time.time() - started

    raw = out.get("response", "")
    code, fenced = extract_code(raw)
    name = exemplar_name(lang)
    contract = check_contract(lang, code, name)

    # Fence leakage is reported separately from real language mistakes. VACA's
    # own history records fences destroying real builds, so it is worth tracking
    # — but it is a serialization habit, not evidence about whether the model
    # knows the language, and the probe is answering the latter question.
    style: list[str] = []
    if fenced:
        style.append("wrapped the file in a markdown fence")

    gate = T.check(lang, {name: code})
    ran, run_out = T.run_program(lang, {name: code}, SAMPLE_INPUT)
    got = run_out.strip().splitlines()[-1] if run_out.strip() else ""
    correct = ran and got == EXPECTED

    # Compiling is necessary but not sufficient: KNOWN requires it to also RUN
    # and produce the right answer with no contract violation.
    if not gate.available:
        verdict = "UNVERIFIABLE"
    elif not gate.clean:
        verdict = "UNKNOWN"
    elif not contract and correct:
        verdict = "KNOWN"
    elif not contract and not ran:
        # Clean under the gate, but this machine cannot execute it (no launcher).
        verdict = "COMPILES"
    else:
        verdict = "PARTIAL"

    return {
        "language": lang,
        "model": model,
        "verdict": verdict,
        "fenced": fenced,
        "contract_problems": contract,
        "style_warnings": style,
        "gate_available": gate.available,
        "gate_clean": gate.clean,
        "gate_output": gate.output[-1200:],
        "ran": ran,
        "got": got,
        "expected": EXPECTED,
        "seconds": round(elapsed, 1),
        "eval_count": out.get("eval_count"),
        "code": code,
    }


# The filename VACA's file contract would give this language (and the name the
# entry-point rules care about: main.swift, main.kt, Program.cs, Main.java…).
FILENAME = {
    "python": "word_summary.py", "javascript": "word-summary.mjs",
    "typescript": "word-summary.ts", "c": "word_summary.c",
    "cpp": "word_summary.cpp", "go": "word_summary.go", "rust": "word_summary.rs",
    "java": "WordSummary.java", "csharp": "Program.cs", "swift": "main.swift",
    "kotlin": "main.kt", "php": "word_summary.php", "ruby": "word_summary.rb",
}

GOAL = "summarize text read from stdin"


def exemplar_name(lang: str) -> str:
    return FILENAME[lang]


def load_manifest() -> dict:
    """Use the cached manifest, or extract one so the probe knows the contract."""
    if MANIFEST_CACHE.exists():
        return json.loads(MANIFEST_CACHE.read_text(encoding="utf-8"))
    import subprocess
    proc = subprocess.run(["node", str(HERE / "extract.mjs")],
                          capture_output=True, text=True, timeout=180)
    if proc.returncode != 0:
        sys.exit(f"extract.mjs failed:\n{proc.stderr}")
    m = json.loads(proc.stdout)
    MANIFEST_CACHE.write_text(json.dumps(m, indent=2) + "\n", encoding="utf-8")
    return m


def summary_line(res: dict) -> str:
    if "error" in res:
        return f"{res['language']:11s} ERROR        {res['error']}"
    bits = [res["verdict"]]
    if res["contract_problems"]:
        bits.append("; ".join(res["contract_problems"])[:80])
    elif not res["gate_available"]:
        bits.append("toolchain not installed")
    elif not res["gate_clean"]:
        first = next((l for l in res["gate_output"].splitlines() if "error" in l), "")
        bits.append(first.strip()[:80])
    elif not res["ran"]:
        bits.append("compiles; not runnable here")
    if res.get("style_warnings"):
        bits.append(res["style_warnings"][0])
    return f"{res['language']:11s} {bits[0]:12s} {' | '.join(bits[1:])}"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--models", default=",".join(DEFAULT_MODELS))
    ap.add_argument("--languages", default="")
    ap.add_argument("--out", default=str(REPORTS / "language-probe.json"))
    args = ap.parse_args()

    manifest = load_manifest()
    langs = manifest["languages"]["coding"]
    if args.languages:
        wanted = [s.strip() for s in args.languages.split(",") if s.strip()]
        unknown = [w for w in wanted if w not in langs]
        if unknown:
            sys.exit(f"not a VACA coding language: {unknown} (have: {langs})")
        langs = wanted
    models = [s.strip() for s in args.models.split(",") if s.strip()]

    print(f"probing {len(langs)} languages x {len(models)} model(s)")
    print(f"gate toolchains available: "
          f"{[l for l in langs if T.available(l)]}")
    print(f"not installed here: {[l for l in langs if not T.available(l)]}\n")

    results = []
    for model in models:
        print(f"── {model} ──")
        for lang in langs:
            block = manifest["languages"]["guidance"][lang]["block"]
            res = probe_language(model, lang, block)
            results.append(res)
            print("  " + summary_line(res))
        print()

    REPORTS.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps({
        "probed_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "ollama": OLLAMA,
        "task": TASK,
        "sample_input": SAMPLE_INPUT,
        "expected": EXPECTED,
        "build_rev": manifest["repo_rev"],
        "availability": T.availability(),
        "results": results,
    }, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {args.out}")

    # ── gap rows: every language this model did NOT handle cleanly ──
    gaps = []
    for res in results:
        if res.get("verdict") in ("KNOWN",):
            continue
        # A language the toolchain could not verify here is NOT evidence of a
        # gap — it is reported as unverified and left alone.
        if res.get("verdict") in ("KNOWN", "UNVERIFIABLE"):
            continue
        lang = res["language"]
        files = exemplar_files(lang)
        fixed = files.get(FILENAME[lang]) or next(iter(files.values()), "")
        if not fixed:
            continue

        reason = "; ".join(res.get("contract_problems", [])) or \
            next((l for l in res.get("gate_output", "").splitlines() if "error" in l),
                 "does not produce the required output").strip()

        # 1. task → the verified correct program
        gaps.append({
            "instruction": f"Write a {lang} program to {GOAL}.",
            "input": "",
            "output": fixed,
            "source": f"training/vacalatest/exemplars/{lang}",
        })
        # 2. the real failure → the fix (repo's repair-pair convention). This is
        #    the highest-value row: it teaches the exact mistake this model makes.
        gaps.append({
            "instruction": (f"This {lang} file fails VACA's gate: {reason[:160]}. "
                            f"Return the corrected file."),
            "input": res.get("code", ""),
            "output": fixed,
            "source": "training/vacalatest/probe.py#repair",
            "gap": {
                "model": res["model"],
                "verdict": res["verdict"],
                "reason": reason[:400],
                "build_rev": None,
            },
        })

    for g in gaps:
        if "gap" in g:
            g["gap"]["build_rev"] = manifest["repo_rev"]

    if gaps:
        DATASET.mkdir(parents=True, exist_ok=True)
        with (DATASET / "language-gaps.jsonl").open("w", encoding="utf-8") as fh:
            for g in gaps:
                fh.write(json.dumps(g, ensure_ascii=False) + "\n")
        print(f"wrote {DATASET / 'language-gaps.jsonl'} ({len(gaps)} gap rows)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
