#!/usr/bin/env python3
"""verify — check the built dataset is well-formed, split cleanly, and NOT STALE.

The interesting check is the last one. `dataset_meta.json` records the source
files the dataset was generated from, so this re-runs the live extractor and
compares fingerprints. If VACA's source changed since the build, the dataset is
stale and this fails — which is the whole point of "datasets on the latest
build": a stale dataset must be impossible to mistake for a current one.

Usage:
  python3 training/vacalatest/verify.py
"""
from __future__ import annotations

import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
DATASET = REPO / "training" / "dataset"
SPEC = "vaca-latest-dataset/1"

REQUIRED_KEYS = {"instruction", "input", "output", "source"}

failures: list[str] = []
checks = 0


def check(ok: bool, label: str, detail: str = "") -> None:
    global checks
    checks += 1
    if ok:
        print(f"  PASS  {label}")
    else:
        print(f"  FAIL  {label}" + (f" — {detail}" if detail else ""))
        failures.append(label)


def load(name: str) -> list[dict]:
    path = DATASET / name
    if not path.is_file():
        return []
    rows = []
    with path.open(encoding="utf-8") as fh:
        for i, line in enumerate(fh, 1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as exc:
                failures.append(f"{name}:{i} invalid JSON — {exc}")
    return rows


def main() -> int:
    print("files")
    for name in ("how-vaca-works.jsonl", "languages.jsonl", "train.jsonl",
                 "val.jsonl", "test.jsonl", "dataset_meta.json"):
        check((DATASET / name).is_file(), f"{name} exists")

    meta = json.loads((DATASET / "dataset_meta.json").read_text(encoding="utf-8")) \
        if (DATASET / "dataset_meta.json").is_file() else {}

    print("\nschema")
    how = load("how-vaca-works.jsonl")
    languages = load("languages.jsonl")
    train = load("train.jsonl")
    val = load("val.jsonl")
    test = load("test.jsonl")

    for name, rows in (("how-vaca-works", how), ("languages", languages),
                       ("train", train), ("val", val), ("test", test)):
        # Gap rows carry an extra "gap" key describing the probe failure.
        bad_schema = [r for r in rows if not REQUIRED_KEYS.issubset(r)]
        check(len(bad_schema) == 0, f"{name}: every row has {sorted(REQUIRED_KEYS)}",
              f"{len(bad_schema)} bad row(s)")
        empty = [r for r in rows if not r.get("output", "").strip()]
        check(len(empty) == 0, f"{name}: no empty outputs", f"{len(empty)} empty")
        unsourced = [r for r in rows if not r.get("source", "").strip()]
        check(len(unsourced) == 0, f"{name}: every row names its source",
              f"{len(unsourced)} unsourced")

    print("\nsplit")
    total = len(train) + len(val) + len(test)
    check(total == len(how) + len(languages),
          "train+val+test covers every corpus row",
          f"{total} vs {len(how) + len(languages)}")
    check(meta.get("train_examples") == len(train), "meta train count matches")
    check(meta.get("val_examples") == len(val), "meta val count matches")
    check(meta.get("test_examples") == len(test), "meta test count matches")
    check(meta.get("total_examples") == total, "meta total matches",
          f"{meta.get('total_examples')} vs {total}")

    # Leakage: the same instruction must not sit in two different splits.
    def keys(rows):
        return Counter((r["instruction"], r["input"]) for r in rows)

    kt, kv, ks = keys(train), keys(val), keys(test)
    overlap = (kt & kv) + (kt & ks) + (kv & ks)
    check(sum(overlap.values()) == 0, "no instruction appears in two splits",
          f"{sum(overlap.values())} overlapping")

    # Every generation row kept in train (the split policy).
    gen = [r for r in (val + test) if "/exemplars/" in r["source"]]
    check(len(gen) == 0, "generation exemplars stay in train", f"{len(gen)} leaked out")

    print("\nlanguage coverage")
    expected_langs = set(meta.get("languages", []))
    have = {r["source"].split("/")[-2] for r in languages
            if "/exemplars/" in r["source"]}
    check(expected_langs == have,
          f"one exemplar row per coding language ({len(expected_langs)})",
          f"missing {sorted(expected_langs - have)}, unexpected {sorted(have - expected_langs)}")
    contract = [r for r in languages if r["instruction"].startswith("What is VACA's code contract")]
    check(len(contract) == len(expected_langs),
          f"a code-contract row for all {len(expected_langs)} languages",
          f"found {len(contract)}")

    print("\nprobe gaps")
    gpath = DATASET / "language-gaps.jsonl"
    if gpath.is_file():
        gaps = load("language-gaps.jsonl")
        check(len(gaps) > 0, "language-gaps.jsonl has rows")
        bad = [g for g in gaps if not REQUIRED_KEYS.issubset(g) or not g["output"].strip()]
        check(len(bad) == 0, "every gap row has a non-empty corrected answer",
              f"{len(bad)} bad")
        repairs = [g for g in gaps if g["instruction"].startswith("This ")]
        check(all(g["input"].strip() for g in repairs),
              "every repair row carries the failing code as input")
        print(f"        {len(gaps)} gap rows ({len(repairs)} repair pairs)")
    else:
        print("        (no probe has been run yet)")

    print("\ntraceability (every source path exists in this repo)")
    missing = []
    for r in how + languages:
        src = r["source"].split("#")[0]
        if src.endswith("/"):
            if not (REPO / src).is_dir():
                missing.append(src)
        elif not (REPO / src).exists():
            missing.append(src)
    check(len(missing) == 0, "all row sources exist", f"missing {sorted(set(missing))[:5]}")

    print("\nstaleness (dataset vs the LIVE source tree)")
    proc = subprocess.run(["node", str(HERE / "extract.mjs")],
                          capture_output=True, text=True, timeout=180)
    if proc.returncode != 0:
        check(False, "live extractor ran", proc.stderr.strip()[:200])
    else:
        live = json.loads(proc.stdout)
        recorded = meta.get("build_of", {}).get("sources", {})
        check(bool(recorded), "meta records the source fingerprints")
        drifted = []
        for path, info in recorded.items():
            now = live["sources"].get(path)
            if now is None:
                drifted.append(f"{path} (gone)")
            elif now["sha256"] != info["sha256"]:
                drifted.append(f"{path} (changed)")
        check(len(drifted) == 0, "dataset matches the current build (not stale)",
              f"{len(drifted)} drifted: {drifted[:4]}")
        check(live["repo_rev"] == meta.get("build_of", {}).get("repo_rev"),
              "meta records the build's git revision")

    print(f"\n{checks - len(failures)}/{checks} checks passed")
    if failures:
        print("FAILED:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("dataset OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
