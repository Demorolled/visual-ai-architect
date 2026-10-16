#!/usr/bin/env python3
"""
=============================================================================
  Qwen2.5-VL-7B QLoRA fine-tune — VACA's native multimodal model
  =============================================================
  Fine-tunes Qwen2.5-VL-7B-Instruct (4-bit QLoRA) on the chat-format corpus
  produced by build_vlm_dataset.py, keeping VACA's text behaviour alive by
  replaying the text rows in the same batches (rehearsal, not sequential
  sectors — see training/vlm/README.md).

  Matches the repo's existing cloud trainer conventions
  (training/cloud/train_round1.py):
      LR ladder halved each round · LoRA r=8 / alpha=16 / dropout 0.05
      batch 1 · grad-accum 8 · adamw_8bit · GGUF q4_k_m export

  VRAM: 7B VL at 4-bit + max-seq 2048 fits in ~16 GB (T4 / RTX 3060 12 GB is
  tight — use --max-seq-length 1024 and expect slow steps, or run on Colab).

  Usage:
      # validate the dataset without a GPU / without unsloth installed:
      python3 training/vlm/train_qwen25vl_qlora.py --dataset training/dataset/vlm \
          --image-root data/vlm/images --dry-run

      # real run (needs a GPU + `pip install unsloth trl transformers datasets`):
      python3 training/vlm/train_qwen25vl_qlora.py \
          --dataset training/dataset/vlm --image-root data/vlm/images \
          --out-dir training/vlm/out --rounds 1 --lr 2e-4 --epochs 2

      # resume a later round from a saved adapter:
      python3 training/vlm/train_qwen25vl_qlora.py --dataset ... --image-root ... \
          --out-dir training/vlm/out --start-round 2 --load-adapter training/vlm/out/adapter_round1 --lr 1e-4

  Outputs (in --out-dir):
      adapter_round{N}/     LoRA adapter after EACH round (chaining base)
      adapter/              final adapter (copy of the last round)
=============================================================================
"""

import argparse
import copy
import json
import shutil
import sys
from pathlib import Path

SYSTEM_PROMPT = (
    "You are VACA, a Visual AI Architect assistant. You read screenshots and UI "
    "images, describe them precisely, and use them to build and explain frontend "
    "applications."
)

DEFAULT_MODEL = "unsloth/Qwen2.5-VL-7B-Instruct"


# ─── dependency gate ────────────────────────────────────────────────────────

def ensure_deps():
    """Import the heavy stack with a helpful hint (mirrors train_round1.py)."""
    try:
        import torch, datasets, transformers, trl  # noqa: F401
        from unsloth import FastVisionModel  # noqa: F401
        from unsloth.trainer import UnslothVisionDataCollator  # noqa: F401
    except ImportError as e:
        print("❌ Missing dependency. Install with:")
        print("   pip install unsloth trl transformers datasets accelerate pillow")
        print(f"   (original error: {e})")
        sys.exit(1)


# ─── dataset ────────────────────────────────────────────────────────────────

def read_jsonl(path: Path) -> list:
    rows = []
    if not path.exists():
        return rows
    with open(path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as e:
                sys.exit(f"❌ {path}:{i} is not valid JSON: {e}")
    return rows


def absolutise_images(rows: list, image_root: Path, errors: list) -> list:
    """Rewrite message image entries to absolute paths the collator can load."""
    out = []
    for r in rows:
        msgs = copy.deepcopy(r.get("messages", []))
        for m in msgs:
            content = m.get("content")
            if not isinstance(content, list):
                continue
            for part in content:
                if part.get("type") != "image":
                    continue
                img = part.get("image")
                if not img:
                    errors.append(f"row missing image path: {r.get('source')}")
                    continue
                p = Path(img)
                part["image"] = str(p if p.is_absolute() else (image_root / p))
                if not Path(part["image"]).exists():
                    errors.append(f"image not found: {part['image']}")
        out.append({"messages": msgs, "modality": r.get("modality", "text")})
    return out


def load_split(dataset_dir: Path, image_root: Path, split: str, errors: list) -> list:
    return absolutise_images(read_jsonl(dataset_dir / f"{split}.jsonl"), image_root, errors)


def validate(dataset_dir: Path, image_root: Path) -> tuple:
    if not dataset_dir.exists():
        sys.exit(f"❌ --dataset dir not found: {dataset_dir}")
    errors: list = []
    train = load_split(dataset_dir, image_root, "train", errors)
    val = load_split(dataset_dir, image_root, "val", errors)
    if errors:
        print("❌ Dataset validation FAILED:")
        for e in errors[:20]:
            print(f"   - {e}")
        sys.exit(1)
    if not train:
        sys.exit(f"❌ {dataset_dir}/train.jsonl is empty or missing.")
    n_img = sum(1 for r in train if r["modality"] == "image")
    return train, val, n_img


# ─── training ───────────────────────────────────────────────────────────────

def lr_for_round(base_lr: float, round_index: int) -> float:
    """Round 1 uses base_lr; each later round halves it (repo convention)."""
    return base_lr / (2 ** (round_index - 1))


def run_round(args, train, val, tokenizer, round_index: int, load_adapter: str | None):
    import torch
    from unsloth import FastVisionModel
    from unsloth.trainer import UnslothVisionDataCollator
    from trl import SFTConfig, SFTTrainer

    lr = args.lr if round_index == 1 else lr_for_round(args.lr, round_index)

    if round_index == 1 and not load_adapter:
        print(f"⬇️  Loading base {args.model} (4-bit QLoRA)...")
        model, tokenizer = FastVisionModel.from_pretrained(
            model_name=args.model,
            max_seq_length=args.max_seq_length,
            load_in_4bit=True,
        )
        model = FastVisionModel.get_peft_model(
            model,
            finetune_vision_layers=False,      # freeze ViT — biggest VRAM saving
            finetune_language_layers=True,
            finetune_attention_modules=True,
            finetune_mlp_modules=True,
            r=args.lora_r,
            lora_alpha=args.lora_alpha,
            lora_dropout=args.lora_dropout,
            bias="none",
            random_state=args.seed,
        )
    else:
        print(f"↻  Resuming round {round_index} from {load_adapter}")
        model, tokenizer = FastVisionModel.from_pretrained(
            model_name=load_adapter,
            max_seq_length=args.max_seq_length,
            load_in_4bit=True,
        )

    out_round = Path(args.out_dir) / f"adapter_round{round_index}"
    out_round.mkdir(parents=True, exist_ok=True)

    cfg = SFTConfig(
        output_dir=str(out_round),
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        num_train_epochs=args.epochs,
        learning_rate=lr,
        warmup_ratio=0.03,
        lr_scheduler_type="cosine",
        logging_steps=args.logging_steps,
        save_strategy="no",
        optim="adamw_8bit",
        weight_decay=0.01,
        max_seq_length=args.max_seq_length,
        dataset_text_field="",            # required for the vision collator
        dataset_kwargs={"skip_prepare_dataset": True},
        remove_unused_columns=False,
        seed=args.seed,
        report_to="none",
    )

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        data_collator=UnslothVisionDataCollator(model, tokenizer),
        train_dataset=train,
        eval_dataset=val or None,
        args=cfg,
    )

    print(f"🏋️  Round {round_index}: lr={lr:g} epochs={args.epochs} "
          f"rows={len(train)} seq={args.max_seq_length}")
    trainer.train()

    model.save_pretrained(str(out_round))
    tokenizer.save_pretrained(str(out_round))
    print(f"  ✅ adapter -> {out_round}")
    return model, tokenizer, out_round


# ─── main ───────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description="Qwen2.5-VL-7B QLoRA fine-tune for VACA.")
    ap.add_argument("--dataset", type=Path, required=True,
                    help="dir with train.jsonl / val.jsonl (from build_vlm_dataset.py)")
    ap.add_argument("--image-root", type=Path, required=True,
                    help="root the dataset's relative image paths resolve against")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--out-dir", type=Path, default=Path("training/vlm/out"))
    ap.add_argument("--rounds", type=int, default=1)
    ap.add_argument("--lr", type=float, default=2e-4)
    ap.add_argument("--epochs", type=float, default=2.0)
    ap.add_argument("--max-seq-length", type=int, default=2048)
    ap.add_argument("--lora-r", type=int, default=8)
    ap.add_argument("--lora-alpha", type=int, default=16)
    ap.add_argument("--lora-dropout", type=float, default=0.05)
    ap.add_argument("--batch-size", type=int, default=1)
    ap.add_argument("--grad-accum", type=int, default=8)
    ap.add_argument("--logging-steps", type=int, default=1)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--start-round", type=int, default=1)
    ap.add_argument("--load-adapter", type=str, default=None)
    ap.add_argument("--dry-run", action="store_true",
                    help="validate the dataset and print the plan; no model load")
    args = ap.parse_args()

    train, val, n_img = validate(args.dataset, args.image_root)

    print("📋 VLM fine-tune plan")
    print(f"   base model     : {args.model}")
    print(f"   dataset        : {args.dataset}  (train={len(train)} val={len(val)} image_rows={n_img})")
    print(f"   image root     : {args.image_root}")
    print(f"   rounds         : {args.rounds} (start={args.start_round}) "
          f"LR ladder: " + " → ".join(f"{lr_for_round(args.lr, i):g}" for i in range(args.start_round, args.start_round + args.rounds)))
    print(f"   lora           : r={args.lora_r} alpha={args.lora_alpha} dropout={args.lora_dropout}")
    print(f"   seq len        : {args.max_seq_length} · epochs {args.epochs} · "
          f"batch {args.batch_size} × accum {args.grad_accum}")
    print(f"   output         : {args.out_dir}")

    if n_img == 0:
        print("⚠️  ZERO image rows — this run cannot teach the model to see.")
    if args.dry_run:
        print("🔎 --dry-run: dataset is valid; no training performed.")
        return

    ensure_deps()

    import torch  # noqa: F401
    if not torch.cuda.is_available():
        sys.exit("❌ No CUDA GPU visible. Use Colab/Kaggle or a GPU host, or run --dry-run.")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    model = tokenizer = None
    load_adapter = args.load_adapter
    last_adapter = None
    for i in range(args.start_round, args.start_round + args.rounds):
        model, tokenizer, last_adapter = run_round(args, train, val, tokenizer, i, load_adapter)
        load_adapter = str(last_adapter)

    final = Path(args.out_dir) / "adapter"
    if final.exists():
        shutil.rmtree(final)
    shutil.copytree(last_adapter, final)
    print(f"\n✅ done — final adapter at {final}")
    print("   Next: python3 training/vlm/export_vlm_gguf.py "
          f"--adapter {final} --base {args.model} --merged-out {args.out_dir}/merged "
          f"--out-dir {args.out_dir}/gguf")


if __name__ == "__main__":
    main()
