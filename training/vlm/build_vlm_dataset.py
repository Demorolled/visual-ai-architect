#!/usr/bin/env python3
"""
=============================================================================
  Build the Qwen2.5-VL fine-tuning dataset for VACA
  =============================================
  Merges TWO kinds of rows into ONE chat-format corpus:

    * image rows  — (image, instruction, answer) pairs for the vision path
    * text rows   — the existing {instruction,input,output} corpora, replayed
                    alongside so the fine-tune does not forget VACA's text
                    behaviour (rehearsal against catastrophic forgetting).

  Output rows use the HF / Qwen2-VL chat schema the trainer consumes:

      {"messages": [
         {"role": "user",      "content": [{"type":"image","image":REL},
                                           {"type":"text","text":PROMPT}]},
         {"role": "assistant", "content": [{"type":"text","text":ANSWER}]}],
       "modality": "image" | "text",
       "source":   "<where the row came from>"}

  Image paths are stored RELATIVE to --image-root so the same dataset works
  after upload to Colab / Kaggle (the trainer re-roots them with --image-root).

  Usage:
      python3 training/vlm/build_vlm_dataset.py \
        --pairs data/vlm/pairs.jsonl \
        --image-root data/vlm/images \
        --text-corpus training/dataset/train.jsonl \
        --text-corpus training/dataset/how-vaca-works.jsonl \
        --out-dir training/dataset/vlm

      python3 training/vlm/build_vlm_dataset.py --dry-run   # report, write nothing

  Expects one row per line. `--pairs` rows look like:
      {"image": "shot-0001.png", "instruction": "...", "output": "...",
       "source": "optional"}
=============================================================================
"""

import argparse
import hashlib
import json
import random
import sys
from pathlib import Path

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}


# ─── row builders ───────────────────────────────────────────────────────────

def image_row(rel: str, instruction: str, output: str, source: str) -> dict:
    """One image+text turn in the Qwen2-VL chat schema."""
    return {
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": rel},
                    {"type": "text", "text": instruction},
                ],
            },
            {"role": "assistant", "content": [{"type": "text", "text": output}]},
        ],
        "modality": "image",
        "source": source,
    }


def text_row(instruction: str, inp: str, output: str, source: str) -> dict:
    """A text-only row — same corpus shape as training/dataset/*.jsonl."""
    prompt = instruction if not inp else f"{instruction}\n\n{inp}"
    return {
        "messages": [
            {"role": "user", "content": [{"type": "text", "text": prompt}]},
            {"role": "assistant", "content": [{"type": "text", "text": output}]},
        ],
        "modality": "text",
        "source": source,
    }


# ─── loaders ────────────────────────────────────────────────────────────────

def _read_jsonl(path: Path):
    with open(path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError as e:
                sys.exit(f"❌ {path}:{i} is not valid JSON: {e}")


def load_pairs(pairs: Path, image_root: Path, errors: list) -> list:
    rows = []
    for rec in _read_jsonl(pairs):
        img = rec.get("image") or rec.get("image_path")
        instruction = rec.get("instruction") or rec.get("prompt") or rec.get("question")
        output = rec.get("output") or rec.get("answer") or rec.get("response")
        if not img or not instruction or not output:
            errors.append(f"{pairs}: row missing image/instruction/output: {rec}")
            continue
        # Normalise to a path relative to --image-root.
        abs_img = (image_root / img).resolve()
        if not abs_img.exists():
            errors.append(f"{pairs}: image not found: {abs_img}")
            continue
        try:
            rel = abs_img.relative_to(image_root.resolve()).as_posix()
        except ValueError:
            errors.append(f"{pairs}: image {abs_img} is outside --image-root {image_root}")
            continue
        rows.append(
            image_row(rel, instruction, output, rec.get("source", f"{pairs.name}#{img}"))
        )
    return rows


def load_text_corpus(path: Path) -> list:
    rows = []
    for rec in _read_jsonl(path):
        instruction = rec.get("instruction")
        output = rec.get("output")
        if not instruction or not output:
            continue
        rows.append(
            text_row(
                instruction,
                rec.get("input", "") or "",
                output,
                rec.get("source", path.name),
            )
        )
    return rows


def load_sidecar_captions(images_dir: Path, instruction: str) -> list:
    """Scan a directory for images with a same-named .txt caption sidecar."""
    rows = []
    for img in sorted(images_dir.rglob("*")):
        if img.suffix.lower() not in IMAGE_EXTS:
            continue
        cap = img.with_suffix(".txt")
        if not cap.exists():
            continue
        text = cap.read_text(encoding="utf-8").strip()
        if not text:
            continue
        rel = img.relative_to(images_dir).as_posix()
        rows.append(image_row(rel, instruction, text, f"sidecar:{rel}"))
    return rows


# ─── split ──────────────────────────────────────────────────────────────────

def split(rows: list, val_frac: float, test_frac: float, seed: int) -> dict:
    rng = random.Random(seed)
    shuffled = rows[:]
    rng.shuffle(shuffled)
    n = len(shuffled)
    n_test = int(round(n * test_frac))
    n_val = int(round(n * val_frac))
    return {
        "test": shuffled[:n_test],
        "val": shuffled[n_test : n_test + n_val],
        "train": shuffled[n_test + n_val :],
    }


def write_jsonl(path: Path, rows: list) -> None:
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def sha16(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


# ─── main ───────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description="Build the Qwen2.5-VL dataset for VACA.")
    ap.add_argument("--pairs", type=Path, action="append", default=[],
                    help="JSONL of {image,instruction,output} (repeatable)")
    ap.add_argument("--image-root", type=Path, default=None,
                    help="Root the --pairs image paths are relative to")
    ap.add_argument("--image-dir", type=Path, action="append", default=[],
                    help="Directory of images with .txt caption sidecars (repeatable)")
    ap.add_argument("--caption-instruction", type=str,
                    default="Describe this image in detail.",
                    help="Instruction used for sidecar-caption rows")
    ap.add_argument("--text-corpus", type=Path, action="append", default=[],
                    help="Existing {instruction,input,output} JSONL to replay (repeatable)")
    ap.add_argument("--out-dir", type=Path, default=Path("training/dataset/vlm"))
    ap.add_argument("--val-frac", type=float, default=0.10)
    ap.add_argument("--test-frac", type=float, default=0.10)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--dry-run", action="store_true", help="Report only; write nothing")
    args = ap.parse_args()

    errors: list = []
    rows: list = []

    for pairs in args.pairs:
        if not pairs.exists():
            sys.exit(f"❌ --pairs not found: {pairs}")
        root = args.image_root or pairs.parent
        rows += load_pairs(pairs, root, errors)

    for d in args.image_dir:
        if not d.exists():
            sys.exit(f"❌ --image-dir not found: {d}")
        rows += load_sidecar_captions(d, args.caption_instruction)

    for c in args.text_corpus:
        if not c.exists():
            sys.exit(f"❌ --text-corpus not found: {c}")
        rows += load_text_corpus(c)

    if errors:
        print("❌ Dataset build FAILED — malformed rows:")
        for e in errors[:20]:
            print(f"   - {e}")
        sys.exit(1)

    if not rows:
        sys.exit("❌ No rows produced. Pass --pairs, --image-dir and/or --text-corpus.")

    n_img = sum(1 for r in rows if r["modality"] == "image")
    n_txt = len(rows) - n_img
    parts = split(rows, args.val_frac, args.test_frac, args.seed)

    print(f"📦 rows: {len(rows)}  (image={n_img}  text={n_txt})")
    for name in ("train", "val", "test"):
        n = len(parts[name])
        m = sum(1 for r in parts[name] if r["modality"] == "image")
        print(f"   {name:<5} {n:>6}  (image={m})")

    if n_img == 0:
        print("⚠️  ZERO image rows — fine-tuning this will NOT teach the model to see.")
        print("   Add --pairs / --image-dir with real image-caption data.")

    if args.dry_run:
        print("🔎 --dry-run: nothing written.")
        return

    if args.out_dir.exists() and any(args.out_dir.iterdir()):
        print(f"⚠️  {args.out_dir} is not empty — overwriting its .jsonl files.")
    args.out_dir.mkdir(parents=True, exist_ok=True)
    for name in ("train", "val", "test"):
        write_jsonl(args.out_dir / f"{name}.jsonl", parts[name])

    meta = {
        "schema": "vaca-vlm-dataset/1",
        "image_root": str((args.image_root or (args.pairs[0].parent if args.pairs else args.out_dir)).resolve()),
        "counts": {"total": len(rows), "image": n_img, "text": n_txt,
                   **{k: len(v) for k, v in parts.items()}},
        "split": {"val_frac": args.val_frac, "test_frac": args.test_frac, "seed": args.seed},
        "sources": {
            "pairs": [str(p) for p in args.pairs],
            "image_dirs": [str(d) for d in args.image_dir],
            "text_corpora": [str(c) for c in args.text_corpus],
        },
        "sha16": {p.name: sha16(p) for p in [*args.pairs, *args.text_corpus] if p.exists()},
    }
    (args.out_dir / "vlm_dataset_meta.json").write_text(
        json.dumps(meta, indent=2) + "\n", encoding="utf-8"
    )
    print(f"✅ wrote {args.out_dir}/train.jsonl val.jsonl test.jsonl vlm_dataset_meta.json")
    if n_img:
        print("   Next: python3 training/vlm/train_qwen25vl_qlora.py "
              f"--dataset {args.out_dir} --image-root {meta['image_root']}")
    print("   ⚠️  Text-only rows cannot teach vision. Real image-caption data is required")
    print("      for the vision path to work (see training/vlm/README.md).")


if __name__ == "__main__":
    main()
