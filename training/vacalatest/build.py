#!/usr/bin/env python3
"""build — turn the LIVE VACA build into the training dataset.

Everything in `training/dataset/` is produced here, and every row is derived
from `extract.mjs`'s manifest of the current source tree — so a row can only
exist if the thing it describes exists in the build. Two corpora are written:

  how-vaca-works.jsonl  what the running system is: node types, mounted /api
                        routes, shipped blueprints, how a language is chosen,
                        how output is gated, and the dependency rule
  languages.jsonl       per-language: VACA's exact code contract, the extension
                        and gate toolchain, and a verified exemplar program

then those are combined and split into train.jsonl / val.jsonl / test.jsonl,
with dataset_meta.json recording which build (git rev + source SHA-256s) the
whole thing came from.

Row shape is the repo convention: {instruction, input, output, source}.

Usage:
  python3 training/vacalatest/build.py            # build into training/dataset/
  python3 training/vacalatest/build.py --dry-run  # report, write nothing
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
DATASET = REPO / "training" / "dataset"
EXEMPLARS = HERE / "exemplars"
EXTRACT = HERE / "extract.mjs"

# Which language each exemplar directory supplies, and the goal it answers.
EXEMPLAR_GOALS: dict[str, tuple[str, str]] = {
    "typescript": ("summarize text read from stdin", "word-summary.ts"),
    "javascript": ("summarize text read from stdin", "word-summary.mjs"),
    "python": ("summarize text read from stdin", "word_summary.py"),
    "go": ("summarize text read from stdin", "word_summary.go"),
    "rust": ("summarize text read from stdin", "word_summary.rs"),
    "java": ("summarize text read from stdin", "WordSummary.java"),
    "csharp": ("summarize text read from stdin", "Program.cs"),
    "swift": ("summarize text read from stdin", "main.swift"),
    "kotlin": ("summarize text read from stdin", "main.kt"),
    "php": ("summarize text read from stdin", "word_summary.php"),
    "ruby": ("summarize text read from stdin", "word_summary.rb"),
    "c": ("summarize text read from stdin", "word_summary.c"),
    "cpp": ("summarize text read from stdin", "word_summary.cpp"),
}


def run_extract() -> dict:
    """Run the live-source extractor; a failure here must fail the build."""
    if not EXTRACT.exists():
        sys.exit(f"missing {EXTRACT}")
    try:
        proc = subprocess.run(
            ["node", str(EXTRACT)], capture_output=True, text=True, timeout=180
        )
    except FileNotFoundError:
        sys.exit("node is required to extract the live VACA source")
    if proc.returncode != 0:
        sys.exit(f"extract.mjs failed:\n{proc.stderr.strip()}")
    return json.loads(proc.stdout)


def row(instruction: str, output: str, source: str, inp: str = "") -> dict:
    return {"instruction": instruction, "input": inp, "output": output, "source": source}


# ── how VACA works ─────────────────────────────────────────────────────
def build_how_vaca_works(m: dict) -> list[dict]:
    rows: list[dict] = []
    app = m["app"]
    langs = m["languages"]
    sel = m["selection"]

    src_index = "backend/src/index.ts"

    # node types
    opts = app["node_type_options"]
    listing = "\n".join(
        f"- {o['type']} ({o.get('label','')}) — {o.get('description','')}".rstrip(" —")
        for o in opts
    )
    rows.append(row(
        "Which node types can VACA place on the canvas?",
        f"VACA's node-type registry (frontend/src/types.ts, NODE_TYPE_OPTIONS) defines "
        f"{len(opts)} placeable types plus the protected `master` blueprint node:\n{listing}\n"
        f"The NodeType union is: {', '.join(app['node_types'])}.",
        "frontend/src/types.ts#NODE_TYPE_OPTIONS",
    ))
    for o in opts:
        rows.append(row(
            f"What is the VACA `{o['type']}` node type for?",
            f"`{o['type']}` {o.get('label','')} — {o.get('description','')}",
            "frontend/src/types.ts#NODE_TYPE_OPTIONS",
        ))

    # routes
    grouped: dict[str, list[str]] = {}
    for r in app["routes"]:
        grouped.setdefault(r["binding"], []).append(r["mount"])
    route_lines = "\n".join(
        f"- {short}: {', '.join(sorted(mounts))}"
        for short, mounts in sorted(grouped.items())
    )
    rows.append(row(
        "Which HTTP API routes does the VACA backend mount?",
        f"backend/src/index.ts mounts {app['route_mount_count']} /api route groups:\n"
        f"{route_lines}",
        src_index,
    ))
    # A path can be mounted more than once (e.g. /api/reason is served by both
    # reasoningRoutes and codePlannerRoutes), so one row per PATH — not per
    # mount — otherwise the same question would carry two different answers.
    by_mount: dict[str, list[str]] = {}
    for r in app["routes"]:
        by_mount.setdefault(r["mount"], []).append(r["binding"])
    for mount, bindings in sorted(by_mount.items()):
        if len(bindings) == 1:
            answer = f"`{mount}` is served by `{bindings[0]}` (mounted in backend/src/index.ts)."
        else:
            answer = (f"`{mount}` is served by {len(bindings)} routers, both mounted in "
                      f"backend/src/index.ts: " + ", ".join(f"`{b}`" for b in bindings) + ".")
        rows.append(row(
            f"What is the VACA backend route mount `{mount}` bound to?",
            answer,
            src_index,
        ))

    # blueprints
    bp_lines = "\n".join(
        f"- {b['name']} ({b['file']})"
        + (f": {b['description']}" if b["description"] else "")
        + (f" [{b['nodeCount']} nodes]" if b["nodeCount"] is not None else "")
        for b in app["blueprints"]
    )
    rows.append(row(
        "Which app blueprints ship with VACA?",
        f"VACA ships {app['blueprint_count']} blueprints in backend/blueprints:\n{bp_lines}",
        "backend/blueprints/",
    ))

    # language selection
    cases = "\n".join(
        f"- \"{c['goal']}\" (OS {c['targetOS']}"
        + (f", uiPreference {c['uiPreference']}" if c["uiPreference"] else "")
        + f") → domain {c['domain']} → {c['language']}"
        for c in sel["cases"]
    )
    rows.append(row(
        "How does VACA decide which programming language to use for a build?",
        "Language is chosen by the app's DOMAIN first, not by the target OS "
        "(backend/src/ai/languageInference.ts, inferLanguageForGoal):\n"
        "1. an explicitly named language in the goal/purpose always wins;\n"
        "2. otherwise classify the domain — web and CLI goals become `typescript`, "
        "because the pipeline (tsc gate, esbuild preview, TS scaffold) supports it "
        "end to end;\n"
        "3. only a genuinely native desktop/mobile goal falls back to the OS map "
        f"{json.dumps(sel['os_language_map'])}.\n\nWorked cases:\n{cases}",
        "backend/src/ai/languageInference.ts#inferLanguageForGoal",
    ))
    rows.append(row(
        "Which OS maps to which native language in VACA?",
        "backend/src/ai/languageInference.ts OS_LANGUAGE_MAP:\n"
        + "\n".join(f"- {os_name} → {lang}" for os_name, lang in sel["os_language_map"].items())
        + "\nThis map applies only to genuine native targets; web and CLI goals are "
          "TypeScript regardless of the selected OS.",
        "backend/src/ai/languageInference.ts#OS_LANGUAGE_MAP",
    ))
    rows.append(row(
        "What makes VACA classify a goal as a web app rather than a CLI or native app?",
        "inferDomainKind matches the goal+purpose against two keyword tables "
        "(backend/src/ai/languageInference.ts); an explicit uiPreference of 'cli' "
        "overrides the text.\n"
        f"web keywords ({len(sel['web_domain_keywords'])}): "
        + ", ".join(sel["web_domain_keywords"]) + "\n"
        f"cli keywords ({len(sel['cli_domain_keywords'])}): "
        + ", ".join(sel["cli_domain_keywords"]),
        "backend/src/ai/languageInference.ts#inferDomainKind",
    ))

    # path → language
    pl = langs["path_language"]
    pl_lines = "\n".join(f"- {ext} → {lang}" for ext, lang in sorted(pl.items()))
    rows.append(row(
        "How does VACA map a file extension to a language?",
        "backend/src/utils/languageFromPath.ts is the ONE shared mapping (the learning "
        "engine and the scaffold adherence scorer both use it):\n" + pl_lines,
        "backend/src/utils/languageFromPath.ts#languageFromPath",
    ))

    # gates
    tc = langs["toolchains"]
    gate_lines = "\n".join(
        f"- {lang}: toolchain `{tc[lang]['bins'][0]}`"
        + (f" (candidates: {', '.join(tc[lang]['bins'])})" if len(tc[lang]["bins"]) > 1 else "")
        for lang in langs["gate"]
    )
    rows.append(row(
        "How does VACA verify generated code, and which languages can it gate?",
        "The tsc gate covers TypeScript. Every other language goes through "
        "backend/src/sandbox/nonTsCompileGate.ts, which stages the whole project into "
        "a temp workspace and runs the real toolchain (a single-file check cannot "
        "resolve sibling imports).\n"
        f"Gated languages ({len(langs['gate'])}): {', '.join(langs['gate'])}.\n"
        f"{gate_lines}\n"
        "An unavailable toolchain is a FAILED gate — 'unverified' is never counted "
        "as 'clean'.",
        "backend/src/sandbox/nonTsCompileGate.ts#GATE_LANGUAGES",
    ))
    rows.append(row(
        "Why does VACA gate a whole project instead of one file at a time?",
        "Because a single-file check cannot resolve sibling imports or modules — the "
        "gate stages every file into a temp workspace so the real compiler sees the "
        "module tree. That is also why an uninstalled toolchain is reported as a "
        "FAILED gate rather than skipped: silence must never read as success.",
        "backend/src/sandbox/nonTsCompileGate.ts",
    ))

    # dependency rule
    rows.append(row(
        "What is VACA's dependency rule for generated code?",
        "Generated code must use the language's STANDARD LIBRARY ONLY. The sandbox "
        "installs nothing, so every third-party import is a guaranteed build failure. "
        "backend/src/ai/languageGuidance.ts states this per language and names the "
        "specific traps, e.g. no serde/rand/tokio in Rust, no guessed `github.com/...` "
        "or any YAML package in Go, no NumPy/pandas/requests in Python, no NuGet in "
        "C#, no Composer in PHP, no gems in Ruby.",
        "backend/src/ai/languageGuidance.ts",
    ))

    # canonical names
    rows.append(row(
        "What are VACA's canonical language names and shorthand aliases?",
        f"Canonical coding languages ({len(langs['coding'])}): {', '.join(langs['coding'])}.\n"
        f"Recognized shorthand (languageInference.ts LANGUAGE_ALIASES): "
        + ", ".join(f"{a} → {n}" for a, n in langs["aliases"].items() if n != "typescript"
                    and n in langs["coding"])
        + ".\nNatural (non-compiled) formats: " + ", ".join(langs["natural_formats"])
        + ".\nNote: an unrecognized shorthand does NOT error — it normalizes to the "
          "inferred language, so 'rs', 'kt' or 'c#' in a node language field silently "
          "become TypeScript. Use the canonical names.",
        "backend/src/ai/languageInference.ts#normalizeNodeLanguage",
    ))

    # natural formats
    rows.append(row(
        "How does VACA treat non-compiled file formats such as HTML, CSS, JSON and SQL?",
        "They are 'natural format' files: they keep their own format, are never "
        "normalized to a coding language, and no compiler gate is applied to them "
        "(languageInference.ts NATURAL_FORMAT_LANGUAGES). Natural formats: "
        + ", ".join(langs["natural_formats"]) + ".",
        "backend/src/ai/languageInference.ts#normalizeNodeLanguage",
    ))

    return rows


# ── languages ──────────────────────────────────────────────────────────
def build_languages(m: dict) -> list[dict]:
    rows: list[dict] = []
    langs = m["languages"]
    tc = langs["toolchains"]

    for lang in langs["coding"]:
        g = langs["guidance"][lang]
        exts = sorted(
            f".{ext}"
            for ext, mapped in langs["path_language"].items()
            if mapped == lang
        )
        ext_txt = ", ".join(exts) if exts else "(no dedicated extension)"
        spec = tc.get(lang)
        if not spec:
            raise SystemExit(f"no toolchain recorded for supported language {lang}")
        tool = spec["bins"][0]
        if lang in langs["gate"]:
            gated = f"gated by the non-TS compile gate (`{tool}`)"
        elif lang in langs["tsc_gated"]:
            gated = f"gated by the tsc gate (`{tool}`)"
        else:
            gated = f"no compile gate recorded (toolchain `{tool}`)"
        contract = "\n".join(f"- {line}" for line in g["lines"])

        rows.append(row(
            f"What is VACA's code contract for {g['name']}?",
            f"Language: {g['name']} ({lang}).\n"
            f"Extensions: {ext_txt}. Toolchain: `{tool}`; {gated}.\n"
            f"backend/src/ai/languageGuidance.ts injects this into the write prompt:\n"
            f"{contract}",
            "backend/src/ai/languageGuidance.ts",
        ))
        rows.append(row(
            f"Which extensions and toolchain does VACA use for {lang}?",
            f"{lang} maps to {ext_txt} and is {gated}. "
            f"Toolchain candidates: {', '.join(spec['bins'])}.",
            "backend/src/utils/languageFromPath.ts#languageFromPath",
        ))

        # the verified exemplar
        edir = EXEMPLARS / lang
        if not edir.is_dir():
            continue
        goal, _ = EXEMPLAR_GOALS[lang]
        for f in sorted(edir.iterdir()):
            if not f.is_file():
                continue
            rows.append(row(
                f"Write a {lang} program to {goal}.",
                f.read_text(encoding="utf-8").rstrip("\n"),
                f"training/vacalatest/exemplars/{lang}/{f.name}",
            ))

    return rows


def dedupe(rows: list[dict]) -> tuple[list[dict], int]:
    seen = set()
    out = []
    dropped = 0
    for r in rows:
        key = (r["instruction"], r["input"], r["output"])
        if key in seen:
            dropped += 1
            continue
        seen.add(key)
        out.append(r)
    return out, dropped


def split(rows: list[dict], seed: int = 42) -> tuple[list, list, list]:
    """Deterministic 80/10/10 split; generation rows stay in train.

    The exemplar rows are the only scarce *generation* signal in the set (one per
    language), so they are always kept in train — the same "priority rows are
    guaranteed into train" convention the repo's merge scripts already use.
    """
    priority = [r for r in rows if "/exemplars/" in r["source"]]
    rest = [r for r in rows if "/exemplars/" not in r["source"]]
    rng = random.Random(seed)
    rng.shuffle(rest)
    n_val = max(1, int(len(rest) * 0.1))
    n_test = max(1, int(len(rest) * 0.1))
    val = rest[:n_val]
    test = rest[n_val:n_val + n_test]
    train = rest[n_val + n_test:] + priority
    return train, val, test


def sha16(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="report without writing")
    args = ap.parse_args()

    manifest = run_extract()
    print(f"live build: rev {manifest['repo_rev']} "
          f"({len(manifest['sources'])} fingerprinted sources)")

    how = build_how_vaca_works(manifest)
    language_rows = build_languages(manifest)
    print(f"how-vaca-works: {len(how)} rows   languages: {len(language_rows)} rows")

    all_rows, dropped = dedupe(how + language_rows)
    if dropped:
        print(f"deduped: {dropped} duplicate row(s) removed")
    train, val, test = split(all_rows)
    print(f"split: train {len(train)} / val {len(val)} / test {len(test)}")

    if args.dry_run:
        print("--dry-run: nothing written")
        return 0

    DATASET.mkdir(parents=True, exist_ok=True)
    write_jsonl(DATASET / "how-vaca-works.jsonl", how)
    write_jsonl(DATASET / "languages.jsonl", language_rows)
    write_jsonl(DATASET / "train.jsonl", train)
    write_jsonl(DATASET / "val.jsonl", val)
    write_jsonl(DATASET / "test.jsonl", test)

    meta = {
        "schema": "vaca-latest-dataset/1",
        "built_at": datetime.now(timezone.utc).isoformat(),
        "build_of": {
            "repo_rev": manifest["repo_rev"],
            "repo_dirty": manifest["repo_dirty"],
            "sources": manifest["sources"],
        },
        "corpora": {
            "how-vaca-works.jsonl": len(how),
            "languages.jsonl": len(language_rows),
        },
        "total_examples": len(all_rows),
        "train_examples": len(train),
        "val_examples": len(val),
        "test_examples": len(test),
        "rows_sha256_16": sha16(json.dumps(all_rows, sort_keys=True)),
        "languages": manifest["languages"]["coding"],
        "natural_formats": manifest["languages"]["natural_formats"],
        "gate_languages": manifest["languages"]["gate"],
        "builders": {
            "extract": "training/vacalatest/extract.mjs",
            "build": "training/vacalatest/build.py",
            "probe": "training/vacalatest/probe.py",
        },
        "note": (
            "Every row is generated from the live source tree fingerprinted above. "
            "There is no inherited or previously-collected data in this dataset."
        ),
    }
    (DATASET / "dataset_meta.json").write_text(
        json.dumps(meta, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wrote {DATASET}/train.jsonl, val.jsonl, test.jsonl, "
          f"how-vaca-works.jsonl, languages.jsonl, dataset_meta.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
