#!/usr/bin/env python3
"""
curriculum — standalone app-agnostic self-improvement pipeline.

Flow: corpus → dictionary → tiered tests → validation → student eval → dataset → train.

Works on ANY app: point config.yaml at a different corpus (docs + source) and
the same pipeline builds a dictionary, writes difficulty-laddered tests,
validates them with the teacher, tests the student model on them, and emits a
fine-tune dataset.

Usage:
  python3 curriculum/curriculum.py plan [--limit-chunks 6]
  python3 curriculum/curriculum.py dictionary [--limit-chunks 60]
  python3 curriculum/curriculum.py tests [--max-topics 40] [--tests-per-tier 1]
  python3 curriculum/curriculum.py validate [--limit 120]
  python3 curriculum/curriculum.py eval [--limit 120]
  python3 curriculum/curriculum.py dataset
  python3 curriculum/curriculum.py train-script
  python3 curriculum/curriculum.py all [--smoke]   # everything end to end

Every stage is resumable and append-only; re-running continues where it stopped.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from lib import io, pipeline, train  # noqa: E402
from lib.llm import extract_json  # noqa: E402


def load_config(path: Path) -> dict:
    import yaml  # type: ignore
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def out_dir(cfg: dict) -> Path:
    p = Path(cfg.get("out_dir", HERE / "out"))
    p.mkdir(parents=True, exist_ok=True)
    return p


def cmd_plan(cfg, args) -> int:
    files = io.corpus_files(cfg.get("app", {}).get("corpus", {}))
    total_chars = sum(p.stat().st_size for p in files)
    print(f"corpus: {len(files)} files, {total_chars:,} bytes")
    plan = list(pipeline.chunk_plan(cfg["app"]["corpus"]))
    print(f"chunks: {len(plan)}")
    for cid, path, _ in plan[: args.limit_chunks or 15]:
        print(f"  {cid}")
    return 0


def cmd_dictionary(cfg, args) -> int:
    app = cfg["app"]
    d = pipeline.build_dictionary(cfg["app"]["corpus"], out_dir(cfg), cfg["teacher"],
                                  limit_chunks=args.limit_chunks)
    merged = pipeline.merge_dictionary(d)
    out = out_dir(cfg) / "dictionary.json"
    out.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
    topics = sorted({e["topic"] for e in merged})
    facts = sum(len(e["facts"]) for e in merged)
    print(f"\n[dictionary] {len(d)} raw entries → {len(topics)} topics, {facts} facts → {out}")
    for t in topics[:25]:
        print(f"  • {t}")
    if len(topics) > 25:
        print(f"  … +{len(topics) - 25} more")
    return 0


def cmd_tests(cfg, args) -> int:
    dictionary = json.loads((out_dir(cfg) / "dictionary.json").read_text(encoding="utf-8"))
    raw = pipeline.generate_tests(cfg["app"], out_dir(cfg), cfg["teacher"], dictionary,
                                  max_topics=args.max_topics,
                                  tests_per_tier=args.tests_per_tier)
    by_tier = {}
    for t in raw:
        by_tier[t["tier"]] = by_tier.get(t["tier"], 0) + 1
    print(f"\n[tests] {len(raw)} raw tests: " + ", ".join(f"t{t}={n}" for t, n in sorted(by_tier.items())))
    return 0


def cmd_validate(cfg, args) -> int:
    raw = io.load_jsonl(out_dir(cfg) / "tests-raw.jsonl")
    valid = pipeline.validate_tests(cfg["app"], out_dir(cfg), cfg["teacher"], raw, limit=args.limit)
    by_tier = {}
    for t in valid:
        by_tier[t["tier"]] = by_tier.get(t["tier"], 0) + 1
    print(f"\n[validate] {len(valid)}/{len(raw)} validated: "
          + ", ".join(f"t{t}={n}" for t, n in sorted(by_tier.items())))
    return 0


def cmd_eval(cfg, args) -> int:
    valid = io.load_jsonl(out_dir(cfg) / "tests-validated.jsonl")
    rows = pipeline.eval_student(cfg["app"], out_dir(cfg), cfg["teacher"], cfg["student"],
                                 valid, limit=args.limit)
    summary = pipeline.eval_summary(rows)
    (out_dir(cfg) / "eval-summary.json").write_text(
        json.dumps(summary, indent=2), encoding="utf-8")
    print(f"\n[eval] {summary['passed']}/{summary['total']} passed")
    for tier, s in summary["by_tier"].items():
        print(f"  tier {tier}: {s['passed']}/{s['n']} passed, avg score {s['avg_score']}")
    return 0


def cmd_dataset(cfg, args) -> int:
    valid = io.load_jsonl(out_dir(cfg) / "tests-validated.jsonl")
    ds = pipeline.build_dataset(cfg["app"], out_dir(cfg), valid, cfg["app"].get("name", "app"))
    return 0


def cmd_train_script(cfg, args) -> int:
    ds = out_dir(cfg) / "dataset" / f"curriculum-{cfg['app'].get('name', 'app').lower().replace(' ', '-')}.jsonl"
    launch = train.write_launch_script(out_dir(cfg), ds)
    train.print_instructions(out_dir(cfg), ds, launch)
    return 0


def cmd_all(cfg, args) -> int:
    rc = cmd_dictionary(cfg, args)
    if rc:
        return rc
    rc = cmd_tests(cfg, args)
    if rc:
        return rc
    rc = cmd_validate(cfg, args)
    if rc:
        return rc
    rc = cmd_eval(cfg, args)
    if rc:
        return rc
    return cmd_dataset(cfg, args)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--config", default=str(HERE / "config.yaml"))
    sub = p.add_subparsers(dest="cmd", required=True)

    for name in ("plan", "dictionary", "tests", "validate", "eval", "dataset",
                 "train-script", "all"):
        sp = sub.add_parser(name)
        sp.add_argument("--limit-chunks", type=int, default=None)
        sp.add_argument("--max-topics", type=int, default=None)
        sp.add_argument("--tests-per-tier", type=int, default=1)
        sp.add_argument("--limit", type=int, default=None)

    args = p.parse_args(argv)
    cfg = load_config(Path(args.config))
    handlers = {
        "plan": cmd_plan, "dictionary": cmd_dictionary, "tests": cmd_tests,
        "validate": cmd_validate, "eval": cmd_eval, "dataset": cmd_dataset,
        "train-script": cmd_train_script, "all": cmd_all,
    }
    return handlers[args.cmd](cfg, args)


if __name__ == "__main__":
    sys.exit(main())
