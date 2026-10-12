#!/usr/bin/env python3
"""verify_exemplars — gate and RUN every exemplar against the real toolchain.

The exemplars are the ground-truth "correct program" rows in the language
dataset, so they must be held to a higher standard than "looks plausible":

  1. compile gate — the same command VACA's nonTsCompileGate uses
  2. execution    — run it on a fixed input and compare stdout byte-for-byte
  3. contract     — no markdown fences, no third-party imports, and (for the
                    languages VACA singles out) none of the named traps

A toolchain that is not installed is reported as `unavailable`, never as a pass.

Usage:
  python3 training/vacalatest/verify_exemplars.py
  python3 training/vacalatest/verify_exemplars.py --json    # + write the report
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import toolchains as T  # noqa: E402

EXEMPLARS = HERE / "exemplars"
REPORTS = HERE / "reports"

# The one input every exemplar must handle identically.
SAMPLE_INPUT = "the quick brown fox the fox\n"
EXPECTED_OUTPUT = "words=6 distinct=4"

# VACA-specific traps, straight out of languageGuidance.ts. Each entry is
# (language, needle, why) and the exemplar must NOT contain the needle.
FORBIDDEN = [
    ("go", "github.com/", "no third-party Go modules (offline: go get fails)"),
    ("go", "gopkg.in/", "no third-party Go modules"),
    ("go", "yaml", "there is no YAML package in the Go standard library"),
    ("cpp", "bits/stdc++.h", "GCC-only header, not portable"),
    ("c", "<iostream>", "that is C++, not C"),
    ("java", "System.console()", "null when stdin is piped"),
    ("swift", "input.characters", "`.characters` was removed from Swift"),
    ("swift", "@main", "`@main` is illegal in a file named main.swift"),
    ("kotlin", "kotlinx.", "no external Kotlin dependencies"),
    ("kotlin", "isDigitsOnly", "no such helper in Kotlin"),
    ("php", "composer", "no Composer packages"),
    ("ruby", "gem ", "no external Ruby gems"),
    ("python", "import requests", "no pip packages"),
    ("python", "import numpy", "no pip packages"),
    ("typescript", "from 'react'", "the sandbox installs nothing"),
]

EXPECTED_FILES = {
    "python": ["word_summary.py"],
    "javascript": ["word-summary.mjs"],
    "typescript": ["word-summary.ts"],
    "c": ["word_summary.c"],
    "cpp": ["word_summary.cpp"],
    "go": ["word_summary.go"],
    "rust": ["word_summary.rs"],
    "java": ["WordSummary.java"],
    "csharp": ["Program.cs"],
    "swift": ["main.swift"],
    "kotlin": ["main.kt"],
    "php": ["word_summary.php"],
    "ruby": ["word_summary.rb"],
}


def load_exemplars() -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    for d in sorted(EXEMPLARS.iterdir()):
        if d.is_dir():
            out[d.name] = {f.name: f.read_text(encoding="utf-8")
                           for f in sorted(d.iterdir()) if f.is_file()}
    return out


# Languages whose `#` starts a line comment (the trap check must ignore prose).
HASH_COMMENT_LANGUAGES = {"python", "ruby", "php", "bash"}


def strip_comments(language: str, code: str) -> str:
    """Remove comments so a trap named in explanatory prose is not a false hit.

    The exemplars deliberately document the traps they avoid (e.g. a Java
    comment saying "not System.console()"), so the checker must look at the
    code that would actually be compiled.
    """
    # /* ... */ works in the C family, Go, Swift, Kotlin, PHP, JS/TS and Java.
    if language not in HASH_COMMENT_LANGUAGES or language == "php":
        code = re.sub(r"/\*.*?\*/", "", code, flags=re.S)
    # '//' line comments: not in python/ruby, where '//' is integer division.
    if language not in {"python", "ruby"}:
        code = re.sub(r"//[^\n]*", "", code)
    # '#' line comments.
    if language in HASH_COMMENT_LANGUAGES:
        code = re.sub(r"#[^\n]*", "", code)
    return code


def contract_failures(language: str, files: dict[str, str]) -> list[str]:
    problems = []
    for name, code in files.items():
        if "```" in code:
            problems.append(f"{name}: contains a markdown fence")
    for lang, needle, why in FORBIDDEN:
        if lang != language:
            continue
        for name, code in files.items():
            if needle in strip_comments(language, code):
                problems.append(f"{name}: contains {needle!r} — {why}")
    expected = EXPECTED_FILES.get(language)
    if expected and sorted(files) != sorted(expected):
        problems.append(f"files {sorted(files)} != expected {sorted(expected)}")
    return problems


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", action="store_true", help="write reports/exemplars.json")
    args = ap.parse_args()

    exemplars = load_exemplars()
    results = []
    failed = 0

    for lang in T.GATED_LANGUAGES:
        files = exemplars.get(lang)
        if not files:
            results.append({"language": lang, "verdict": "MISSING"})
            failed += 1
            print(f"  {lang:11s} MISSING   no exemplar directory")
            continue

        problems = contract_failures(lang, files)
        gate = T.check(lang, files)
        ran, output = T.run_program(lang, files, SAMPLE_INPUT)
        got = output.strip().splitlines()[-1] if output.strip() else ""
        executed = ran and got == EXPECTED_OUTPUT

        if problems:
            verdict = "FAIL"
        elif not gate.available:
            verdict = "UNAVAILABLE"
        elif not gate.clean:
            verdict = "FAIL"
        elif "compile-verified only" in output or "cannot execute" in output:
            verdict = "COMPILE-OK"
        elif executed:
            verdict = "PASS"
        else:
            verdict = "FAIL"

        if verdict in ("FAIL", "MISSING"):
            failed += 1

        results.append({
            "language": lang,
            "verdict": verdict,
            "contract_problems": problems,
            "gate": gate.as_dict(),
            "ran": ran,
            "got": got,
            "expected": EXPECTED_OUTPUT,
        })

        note = ""
        if verdict == "FAIL":
            note = " | ".join(problems) or gate.output.strip().splitlines()[:1] and gate.output.strip().splitlines()[0] or output[:80]
        print(f"  {lang:11s} {verdict:12s} {note}")

    print()
    ok = [r["language"] for r in results if r["verdict"] == "PASS"]
    compile_ok = [r["language"] for r in results if r["verdict"] == "COMPILE-OK"]
    unavail = [r["language"] for r in results if r["verdict"] == "UNAVAILABLE"]
    print(f"PASS (compiled + ran correct): {len(ok)}/{len(results)}  {ok}")
    if compile_ok:
        print(f"COMPILE-OK (cannot execute here): {compile_ok}")
    if unavail:
        print(f"UNAVAILABLE (toolchain missing): {unavail}")

    if args.json:
        REPORTS.mkdir(parents=True, exist_ok=True)
        (REPORTS / "exemplars.json").write_text(
            json.dumps({
                "sample_input": SAMPLE_INPUT,
                "expected_output": EXPECTED_OUTPUT,
                "availability": T.availability(),
                "results": results,
                "failed": failed,
            }, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"wrote {REPORTS / 'exemplars.json'}")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
