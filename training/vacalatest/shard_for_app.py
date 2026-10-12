#!/usr/bin/env python3
"""shard_for_app — split the dataset into files the trainer can actually absorb.

WHY THIS EXISTS
---------------
`llm-training-app/engine.py` does not train on a whole uploaded file. The chain is:

    _file_to_text_mmap(fd)          -> parse_file(max_bytes=16384)   16 KB
    text = text[:8192]              -> StreamedTextDataset           8 KB
    tokenizer(text, truncation=True, max_length=max_length - 1)      ~511 tokens

That last line truncates the file BEFORE chunking, so **every uploaded file
contributes exactly one ~511-token training sample, whatever its size.** Measured
on the real tokenizer: the 5 assembled dataset files (23,700 tokens of content)
delivered 5 x 511 = 2,555 tokens — about 89% of the dataset was silently dropped.

Sharding fixes it without touching the app: keep every output file under the
511-token budget, and each file's whole content is then what gets trained on.
The app's own cap of MAX_FILES_IN_MEMORY = 2000 gives an effective budget of
2000 x 511 ~= 1.0 M tokens of absorbable training signal.

Run it with the app's virtualenv — it needs the real tokenizer, and a
char-based guess would silently reintroduce the truncation this removes:

    V=llm-training-app/.venv/bin/python
    $V training/vacalatest/shard_for_app.py --dry-run
    $V training/vacalatest/shard_for_app.py
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
DATASET = REPO / "training" / "dataset"
OUT = DATASET / "app-shards"

# Mirrors engine.py: max_length = min(config, 512); tokenizer truncates to
# max_length - 1. Anything longer than this per file is lost.
TOKEN_BUDGET = 511
# Mirrors engine.py MAX_FILES_IN_MEMORY.
MAX_FILES = 2000

SOURCES = ["how-vaca-works.jsonl", "languages.jsonl", "language-gaps.jsonl",
           "train.jsonl", "val.jsonl"]


def load_tokenizer():
    try:
        from transformers import AutoTokenizer
    except Exception as exc:  # pragma: no cover - env dependent
        sys.exit(f"needs transformers (run with llm-training-app/.venv/bin/python): {exc}")
    return AutoTokenizer.from_pretrained("Qwen/Qwen2.5-Coder-7B-Instruct",
                                         trust_remote_code=True)


def n_tokens(tok, text: str) -> int:
    return len(tok(text, add_special_tokens=False)["input_ids"])


def shard_lines(lines: list[str], tok, budget: int) -> list[str]:
    """Group whole rows into <=budget-token files; split any row that alone is too big."""
    out: list[str] = []
    cur: list[str] = []
    cur_tokens = 0

    def flush() -> None:
        nonlocal cur, cur_tokens
        if cur:
            out.append("\n".join(cur))
            cur, cur_tokens = [], 0

    for line in lines:
        n = n_tokens(tok, line)
        if n > budget:
            # A single row larger than the budget: cut it at exact token
            # boundaries so no part is truncated.
            flush()
            ids = tok(line, add_special_tokens=False)["input_ids"]
            for i in range(0, len(ids), budget):
                piece = tok.decode(ids[i:i + budget])
                out.append(piece)
            continue
        if cur_tokens + n > budget:
            flush()
        cur.append(line)
        cur_tokens += n
    flush()
    return out


def verified_length(tok, text: str) -> int:
    """Tokens the trainer would actually see for this file text."""
    raw = text[:16384]
    raw = raw[:8192]
    return len(tok(raw, truncation=True, max_length=TOKEN_BUDGET,
                   add_special_tokens=False)["input_ids"])


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--budget", type=int, default=TOKEN_BUDGET)
    args = ap.parse_args()

    tok = load_tokenizer()
    budget = args.budget

    todo = [DATASET / n for n in SOURCES if (DATASET / n).is_file()]
    missing = [n for n in SOURCES if not (DATASET / n).is_file()]
    if missing:
        print(f"note: not present, skipping: {', '.join(missing)}")

    all_lines: list[str] = []
    for p in todo:
        all_lines += [l for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]

    before_tokens = sum(n_tokens(tok, l) for l in all_lines)
    shards = shard_lines(all_lines, tok, budget)
    after_tokens = sum(verified_length(tok, s) for s in shards)

    print(f"rows in      : {len(all_lines)}")
    print(f"shards out   : {len(shards)}  (app cap {MAX_FILES})")
    print(f"content       : {before_tokens} tokens")
    print(f"trainer sees  : {after_tokens} tokens  ({after_tokens / max(before_tokens,1):.1%} of content)")
    print(f"absorbable cap: {MAX_FILES} x {budget} = {MAX_FILES * budget:,} tokens")

    if len(shards) > MAX_FILES:
        sys.exit(f"too many shards ({len(shards)} > {MAX_FILES}) — raise the budget")

    if before_tokens and after_tokens < before_tokens * 0.98:
        sys.exit("sharding lost content — refusing to write")

    if args.dry_run:
        print("\n--dry-run: nothing written")
        return 0

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    for i, s in enumerate(shards, 1):
        (OUT / f"vaca-{i:04d}.txt").write_text(s, encoding="utf-8")
    print(f"\nwrote {len(shards)} file(s) to {OUT}")

    # Prove it through the loader's real truncation chain.
    lost = [(p.name, verified_length(tok, p.read_text(encoding="utf-8")),
             n_tokens(tok, p.read_text(encoding="utf-8")))
            for p in sorted(OUT.iterdir())]
    truncated = [t for t in lost if t[1] < t[2]]
    print(f"shards truncated by the loader: {len(truncated)}")
    if truncated:
        for name, seen, full in truncated[:5]:
            print(f"  {name}: {seen}/{full} tokens")
        sys.exit("a shard is still truncated — nothing can be trained on in full")
    print("every shard is absorbed in full by the trainer")
    return 0


if __name__ == "__main__":
    sys.exit(main())
