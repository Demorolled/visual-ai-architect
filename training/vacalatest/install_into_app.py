#!/usr/bin/env python3
"""install_into_app — register the built dataset with LLM Training Studio.

The studio does not read `training/dataset/` directly; it owns a file catalog and
copies each registered file into `llm-training-app/data/uploads/`. So rather than
dropping files in behind its back, this drives the app's OWN ingest path
(`engine.Engine.ingest_file`) — the same code the GUI's upload button runs — and
then saves its metadata.

Usage:
  python3 training/vacalatest/install_into_app.py --dry-run
  python3 training/vacalatest/install_into_app.py
  python3 training/vacalatest/install_into_app.py --files train.jsonl,val.jsonl
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
DATASET = REPO / "training" / "dataset"
APP = REPO / "llm-training-app"

DEFAULT_FILES = [
    "how-vaca-works.jsonl", "languages.jsonl", "train.jsonl", "val.jsonl",
    "language-gaps.jsonl",
]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--files", default=",".join(DEFAULT_FILES))
    ap.add_argument("--dir", default=None,
                    help="ingest a folder instead (e.g. dataset/app-shards — see "
                         "shard_for_app.py for why shards beat whole corpora here)")
    ap.add_argument("--reset", action="store_true",
                    help="clear the studio's uploads/categories/catalog first. Re-installing "
                         "without this ORPHANS copies: ingest_file mirrors each file into "
                         "data/categories/<category>/, and those copies are not removed "
                         "when the catalog entry goes away.")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if args.dir:
        folder = Path(args.dir)
        if not folder.is_absolute():
            folder = DATASET / args.dir
        if not folder.is_dir():
            sys.exit(f"not a folder: {folder}")
        paths = sorted(p for p in folder.iterdir() if p.is_file())
    else:
        names = [s.strip() for s in args.files.split(",") if s.strip()]
        paths = []
        for n in names:
            p = DATASET / n
            if not p.is_file():
                sys.exit(f"missing dataset file: {p}\nrun: python3 training/vacalatest/build.py")
            paths.append(p)

    total = sum(1 for p in paths for _ in p.open(encoding="utf-8"))
    print(f"dataset: {DATASET}")
    for p in paths:
        n = sum(1 for _ in p.open(encoding="utf-8"))
        print(f"  {p.name:24s} {n:4d} rows  {p.stat().st_size/1024:8.1f} KB")
    print(f"  {'TOTAL':24s} {total:4d} rows")

    if args.dry_run:
        print("\n--dry-run: nothing ingested")
        return 0

    sys.path.insert(0, str(APP))
    try:
        from engine import Engine, UPLOADS_DIR, CATEGORIES_DIR, METADATA_FILE  # noqa: E402
    except Exception as exc:  # pragma: no cover - env dependent
        sys.exit(f"cannot import the studio engine from {APP}: {exc}")

    if args.reset:
        import shutil
        removed = 0
        for d in (UPLOADS_DIR, CATEGORIES_DIR):
            if d.is_dir():
                removed += sum(1 for p in d.rglob("*") if p.is_file())
                shutil.rmtree(d)
            d.mkdir(parents=True, exist_ok=True)
        catalog = APP / "data" / "catalog.db"
        if catalog.exists():
            catalog.unlink()
        if METADATA_FILE.exists():
            METADATA_FILE.unlink()
        print(f"--reset: cleared {removed} file(s) from uploads/ + categories/, "
              f"and the catalog\n")

    eng = Engine()
    before = len(eng.files)
    # ingest_files_batch passes each entry straight to ingest_file, which uses
    # Path methods (p.suffix / p.stat / p.name) — so Paths, not strings.
    ingested = eng.ingest_files_batch(list(paths))
    eng.save_metadata(force=True)
    after = len(eng.files)

    print(f"\nregistered {len(ingested)} file(s) with LLM Training Studio "
          f"(catalog {before} → {after})")
    for entry in ingested:
        print(f"  {entry['name']:24s} category={entry['category']}")
    print(f"\nuploads dir: {APP / 'data' / 'uploads'}")
    print("They now appear in the studio's file list and are usable for a training run.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
