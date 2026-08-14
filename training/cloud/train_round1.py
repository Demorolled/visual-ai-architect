#!/usr/bin/env python3
"""
=============================================================================
  ☁️  Cloud QLoRA Trainer — VACA / Veronica (DDP, multi-round)
  ===========================================================
  Self-contained fine-tune of Qwen2.5-7B-Instruct-Uncensored (4-bit QLoRA),
  matching the LOCAL engine exactly:
      LR 2e-4 → 1e-4 → 5e-5 → 2.5e-5 (one round per halving)
      2 epochs · max_seq_length 3072 · LoRA r8/α16/d0.05
      batch 1 · grad-accum 8 · adamw_8bit · GGUF q4_k_m export

  Designed to run on Kaggle (2× T4) across TWO chained kernels, each doing
  2 rounds so every run fits under Kaggle's 12 h runtime cap:
      Kernel 1 (rounds 1-2, LR 2e-4 → 1e-4): trains from the base model.
      Kernel 2 (rounds 3-4, LR 5e-5 → 2.5e-5): resumes from kernel 1's
              round-2 adapter via --load-adapter.

  Usage (Kaggle / torchrun, one process per GPU):
      # Rounds 1-2 (fresh):
      torchrun --standalone --nproc_per_node=2 train_round1.py \
        --dataset train.jsonl --out-dir ./out --rounds 2 --lr 2e-4 \
        --epochs 2 --max-seq-length 3072

      # Rounds 3-4 (resume from a previous adapter dir):
      torchrun --standalone --nproc_per_node=2 train_round1.py \
        --dataset train.jsonl --out-dir ./out --rounds 2 --lr 5e-5 \
        --start-round 3 --load-adapter ./adapter --epochs 2 --max-seq-length 3072

      # Single GPU (no torchrun) still works — just run without it.
      python train_round1.py --dataset train.jsonl --rounds 1 --dry-run

  Outputs (in --out-dir, written by rank 0 only):
      adapter_round{N}/          LoRA adapter after EACH round (chaining base)
      adapter/                   final adapter (copy of the last round)
      Qwen2.5-7B-Instruct-Uncensored-Q4_K_M.gguf   ← deployable tuned model
      results.zip                everything zipped for download
=============================================================================
"""

import argparse
import gc
import json
import os
import shutil
import sys
import time
import zipfile
from datetime import datetime
from pathlib import Path

# ─── DDP setup ──────────────────────────────────────────────────────────────
# torchrun launches one process per GPU with LOCAL_RANK / WORLD_SIZE set.
# Hide every GPU except our rank's BEFORE torch is imported so each process
# sees its own GPU as cuda:0 (required by unsloth + HF Trainer DDP).
LOCAL_RANK = int(os.environ.get("LOCAL_RANK", "0"))
WORLD_SIZE = int(os.environ.get("WORLD_SIZE", "1"))
if WORLD_SIZE > 1:
    # DDP: each rank sees only its own GPU.
    os.environ["CUDA_VISIBLE_DEVICES"] = str(LOCAL_RANK)
elif "CUDA_VISIBLE_DEVICES" not in os.environ:
    # Plain single-GPU python (the Kaggle path). Kaggle reports 2 T4s at the
    # driver level (torch.cuda.device_count()==2) but only GRANTS 1 usable GPU
    # to the training subprocess. With both visible, unsloth's fast attention
    # scatters Q/K/V onto cuda:1 while the attention bias stays on cuda:0:
    #   ValueError: Attention bias and Query/Key/Value should be on the same
    #   device  (query.device: cuda:1, attn_bias: cuda:0)
    # Pin to device 0 unless the caller already chose a device explicitly.
    os.environ["CUDA_VISIBLE_DEVICES"] = "0"
IS_MAIN = LOCAL_RANK == 0

SYSTEM_PROMPT = (
    "You are a Visual AI Architect assistant specializing in GUI development. "
    "You build complete web applications, explain UI patterns, generate code, "
    "and help with frontend development."
)

# LR halving ladder matches the local engine (2e-4 → 1e-4 → 5e-5 → 2.5e-5).
# Round 1 always uses --lr (default 2e-4).


def _barrier():
    """Sync all ranks before rank-0 saves (no-op without DDP)."""
    import torch
    if torch.distributed.is_available() and torch.distributed.is_initialized():
        torch.distributed.barrier()


# ─── Dependencies ───────────────────────────────────────────────────────────

def ensure_deps():
    """Import heavy libs with a helpful install hint if missing."""
    try:
        import torch, datasets, transformers, trl  # noqa
        from unsloth import FastLanguageModel, is_bfloat16_supported  # noqa
    except ImportError as e:
        print("❌ Missing dependency. In a notebook run first:")
        print('   !pip install -q unsloth trl transformers datasets accelerate')
        print(f"   (original error: {e})")
        sys.exit(1)


# ─── Dataset ────────────────────────────────────────────────────────────────

def load_dataset(path: str, tokenizer, max_seq_length: int):
    """Load instruction/input/output JSONL, tokenize with assistant-only
    label masking (prompt-length detection, same as the local engine)."""
    p = Path(path)
    if not p.exists():
        print(f"❌ Dataset not found: {path}")
        sys.exit(1)

    records = []
    with open(p, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            instruction = rec.get("instruction", "")
            input_text = rec.get("input", "")
            output_text = rec.get("output", "")

            if not output_text or len(output_text) < 10:
                continue

            user_text = instruction
            if input_text and input_text.strip() and input_text != "Auto-learned conversation":
                user_text = f"{instruction}\n\n{input_text}"

            messages = [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_text.strip()},
                {"role": "assistant", "content": output_text.strip()},
            ]

            prompt_ids = tokenizer.apply_chat_template(
                messages[:-1], tokenize=True, add_generation_prompt=True
            )
            prompt_len = len(prompt_ids)

            full_ids = tokenizer.apply_chat_template(
                messages, tokenize=True, add_generation_prompt=False
            )
            if len(full_ids) > max_seq_length:
                full_ids = full_ids[:max_seq_length]

            labels = [-100] * min(prompt_len, len(full_ids)) + \
                     full_ids[min(prompt_len, len(full_ids)):]

            records.append({
                "input_ids": full_ids,
                "attention_mask": [1] * len(full_ids),
                "labels": labels,
            })

    if not records:
        print("❌ No valid records found in dataset!")
        sys.exit(1)

    print(f"  Loaded {len(records)} records from {p.name}")

    from datasets import Dataset as HFDataset
    pad_id = tokenizer.pad_token_id or tokenizer.eos_token_id or 0
    for rec in records:
        rec["input_ids"] = (rec["input_ids"] + [pad_id] * max_seq_length)[:max_seq_length]
        rec["attention_mask"] = (rec["attention_mask"] + [0] * max_seq_length)[:max_seq_length]
        rec["labels"] = (rec["labels"] + [-100] * max_seq_length)[:max_seq_length]

    ds = HFDataset.from_list(records)
    return ds.train_test_split(test_size=0.1, seed=42)


# ─── Evaluation ─────────────────────────────────────────────────────────────

def evaluate(model, val_dataset, max_samples: int = 60):
    import torch
    model.eval()
    device = next(model.parameters()).device
    total, correct, examples, correct_ex = 0, 0, 0, 0
    with torch.no_grad():
        for i in range(min(len(val_dataset), max_samples)):
            rec = val_dataset[i]
            input_ids = torch.tensor(rec["input_ids"], device=device).unsqueeze(0)
            attention_mask = torch.tensor(rec["attention_mask"], device=device).unsqueeze(0)
            labels = torch.tensor(rec["labels"], device=device).unsqueeze(0)
            outputs = model(input_ids=input_ids, attention_mask=attention_mask)
            preds = torch.argmax(outputs.logits[..., :-1, :], dim=-1)
            labels = labels[..., 1:]
            mask = labels != -100
            tc = ((preds == labels) & mask).sum().item()
            tt = mask.sum().item()
            correct += tc
            total += tt
            if ((preds == labels) & mask).all() and mask.any():
                correct_ex += 1
            examples += 1
    model.train()
    acc = round(correct / total, 4) if total else 0
    em = round(correct_ex / max(examples, 1), 4)
    return acc, em


# ─── Main ───────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="Cloud QLoRA trainer (VACA, DDP multi-round)")
    ap.add_argument("--dataset", default="train.jsonl",
                    help="Path to instruction/input/output JSONL dataset")
    ap.add_argument("--out-dir", default="out", help="Output directory")
    ap.add_argument("--rounds", type=int, default=1, help="Number of LR-decay rounds in THIS run (default 1)")
    ap.add_argument("--start-round", type=int, default=1,
                    help="Global round number of this run's first round (1 for kernel 1, 3 for kernel 2)")
    ap.add_argument("--epochs", type=int, default=2, help="Epochs per round")
    ap.add_argument("--lr", type=float, default=2e-4, help="LR of this run's first round (2e-4 kernel 1, 5e-5 kernel 2)")
    ap.add_argument("--load-adapter", default=None,
                    help="Path to a previous run's adapter dir to resume from (kernel 2)")
    ap.add_argument("--max-seq-length", type=int, default=3072, help="Sequence length (3072; 4096+ risks OOM on T4 16GB)")
    ap.add_argument("--batch-size", type=int, default=1, help="Per-device batch size")
    ap.add_argument("--grad-accum", type=int, default=8, help="Gradient accumulation steps")
    ap.add_argument("--no-gguf", action="store_true",
                    help="Skip GGUF q4_k_m export (crash-prone on Kaggle); save merged 16-bit safetensors instead, convert to GGUF locally")
    ap.add_argument("--dry-run", action="store_true", help="Print config and exit (no GPU)")
    args = ap.parse_args()

    print("=" * 60)
    print("  ☁️  Cloud QLoRA Trainer (VACA) — DDP multi-round")
    print("=" * 60)
    print(f"  Dataset        : {args.dataset}")
    print(f"  Output dir     : {args.out_dir}")
    print(f"  Rounds         : {args.start_round}-{args.start_round + args.rounds - 1} "
          f"(first LR = {args.lr:.1e})")
    print(f"  Epochs/round   : {args.epochs}")
    print(f"  Max seq length : {args.max_seq_length}")
    print(f"  Batch / accum  : {args.batch_size} / {args.grad_accum}")
    print(f"  Load adapter   : {args.load_adapter or '(none — fresh from base)'}")
    print(f"  DDP            : world_size={WORLD_SIZE} local_rank={LOCAL_RANK}")
    print(f"  GGUF export    : {'SKIPPED (--no-gguf) — merged 16-bit safetensors instead' if args.no_gguf else 'q4_k_m'}")
    print("=" * 60)

    if args.dry_run:
        print("\n✅ Dry run — config OK, no GPU work performed.")
        return

    ensure_deps()

    import torch
    from unsloth import FastLanguageModel, is_bfloat16_supported
    from transformers import TrainingArguments
    from trl import SFTTrainer

    # TRL >= 0.14 moved max_seq_length/dataset_text_field/packing out of the
    # SFTTrainer constructor into SFTConfig (and TRL 1.x REMOVED the legacy
    # kwargs). Detect which API exists so the script runs on any pip-resolved
    # version.
    try:
        from trl import SFTConfig
        _HAS_SFTCONFIG = True
    except ImportError:
        _HAS_SFTCONFIG = False

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    model_name = "Orion-zhen/Qwen2.5-7B-Instruct-Uncensored"
    if IS_MAIN:
        print(f"\n  Loading model: {model_name} (4-bit QLoRA)...")

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=model_name,
        max_seq_length=args.max_seq_length,
        dtype=None,  # auto bf16/fp16
        load_in_4bit=True,
        device_map="auto",
    )
    model = FastLanguageModel.get_peft_model(
        model,
        r=8,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                        "gate_proj", "up_proj", "down_proj"],
        lora_alpha=16,
        lora_dropout=0.05,
        bias="none",
        use_gradient_checkpointing="unsloth",
        random_state=42,
        max_seq_length=args.max_seq_length,
    )

    # Resume from a previous run's adapter (kernel 2 loads kernel 1's output).
    if args.load_adapter:
        from peft import PeftModel
        adapter_path = Path(args.load_adapter)
        if not adapter_path.exists():
            print(f"❌ --load-adapter path not found: {adapter_path}")
            sys.exit(1)
        if IS_MAIN:
            print(f"  🔁 Resuming from adapter: {adapter_path}")
        if isinstance(model, PeftModel):
            model.load_adapter(str(adapter_path), adapter_name="resume")
            model.set_adapter("resume")
        else:
            model = PeftModel.from_pretrained(model, str(adapter_path))

    if IS_MAIN:
        trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
        total = sum(p.numel() for p in model.parameters())
        print(f"  Trainable params: {trainable:,} ({100 * trainable / total:.2f}%)")

    print(f"\n  Loading dataset: {args.dataset}")
    split = load_dataset(args.dataset, tokenizer, args.max_seq_length)
    train_ds, val_ds = split["train"], split["test"]
    if IS_MAIN:
        print(f"  Train: {len(train_ds)} | Val: {len(val_ds)}")

    use_bf16 = is_bfloat16_supported()
    effective_batch = args.batch_size * args.grad_accum
    warmup = max(1, int(0.03 * len(train_ds) * args.epochs // effective_batch))

    base_args = dict(
        output_dir=str(out_dir),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        warmup_steps=warmup,
        lr_scheduler_type="constant",
        optim="adamw_8bit",
        max_grad_norm=0.3,
        weight_decay=0.01,
        logging_steps=10,
        save_steps=20,        # guarantee checkpoint dirs (trained LoRA recovery point)
        save_total_limit=3,
        bf16=use_bf16,
        fp16=not use_bf16,
        dataloader_num_workers=4,
        remove_unused_columns=False,
        report_to="none",
        ddp_find_unused_parameters=False,
    )

    steps_per_round = max(1, len(train_ds) // effective_batch * args.epochs)
    best_acc, best_em = 0.0, 0.0
    start = time.time()
    last_adapter_dir = None

    for round_i in range(1, args.rounds + 1):
        global_round = args.start_round + round_i - 1
        lr = args.lr * (0.5 ** (round_i - 1))  # halve LR every round
        if IS_MAIN:
            print(f"\n{'─' * 50}")
            print(f"  Round {global_round} | LR: {lr:.1e} | steps: {steps_per_round}")
            print(f"{'─' * 50}")

        if _HAS_SFTCONFIG:
            import inspect
            sft_args = SFTConfig(
                learning_rate=lr,
                max_seq_length=args.max_seq_length,
                dataset_text_field=None,
                packing=False,
                **base_args,
            )
            # TRL 1.x renamed tokenizer→processing_class; pass whichever the
            # installed version accepts (dataset is pre-tokenized, so either
            # works — this only satisfies the trainer's processing-class slot).
            params = inspect.signature(SFTTrainer.__init__).parameters
            kw = {}
            if "processing_class" in params:
                kw["processing_class"] = tokenizer
            elif "tokenizer" in params:
                kw["tokenizer"] = tokenizer
            trainer = SFTTrainer(model=model, args=sft_args,
                                train_dataset=train_ds, **kw)
        else:
            trainer = SFTTrainer(
                model=model,
                tokenizer=tokenizer,
                args=TrainingArguments(learning_rate=lr, **base_args),
                train_dataset=train_ds,
                max_seq_length=args.max_seq_length,
                dataset_text_field=None,
                packing=False,
            )
        trainer.train()

        acc, em = evaluate(model, val_ds)
        if IS_MAIN:
            elapsed = (time.time() - start) / 60
            print(f"  📊 Round {global_round} ({elapsed:.1f}m): Acc={acc*100:.2f}% EM={em*100:.2f}%")
        if acc > best_acc:
            best_acc, best_em = acc, em

        # Save this round's adapter (rank 0 only) — the last one is the
        # resume point for the next chained kernel.
        _barrier()
        if IS_MAIN:
            round_adapter = out_dir / f"adapter_round{global_round}"
            model.save_pretrained(str(round_adapter))
            # Round-11 lesson: unsloth/peft save_pretrained writes the PRE-TRAINING
            # snapshot at top level and the CURRENT (trained) LoRA under resume/.
            # Promote the trained one so the round adapter is genuinely trained.
            resume_dir = round_adapter / "resume"
            if (resume_dir / "adapter_model.safetensors").exists():
                for f in resume_dir.iterdir():
                    if f.is_file():
                        shutil.copy2(f, round_adapter / f.name)
                shutil.rmtree(resume_dir)
                print(f"  ⚠️  promoted trained LoRA from {round_adapter.name}/resume/ (unsloth save quirk)")
            tokenizer.save_pretrained(str(round_adapter))
            # Sanity: the saved adapter MUST differ from the one we loaded.
            if args.load_adapter:
                import hashlib

                def _sha(p):
                    return hashlib.sha256(p.read_bytes()).hexdigest()

                a = _sha(round_adapter / "adapter_model.safetensors")
                b = _sha(Path(args.load_adapter) / "adapter_model.safetensors")
                if a == b:
                    print("  ❌❌ SANITY FAIL: saved adapter == loaded adapter — training did NOT"
                          " apply! Investigate before deploying.")
                    print("  ❌❌ Aborting — refusing to ship untrained weights (R11 bug guard).")
                    sys.exit(1)
                else:
                    print("  ✅ SANITY OK: saved adapter differs from loaded adapter (training applied)")
            last_adapter_dir = round_adapter
            print(f"  💾 Round {global_round} adapter → {round_adapter.name}/")
        _barrier()

        gc.collect()
        torch.cuda.empty_cache()

    # ─── Final adapter + GGUF export + zip (rank 0 only) ──────────────
    _barrier()
    if IS_MAIN:
        adapter_dir = out_dir / "adapter"
        if last_adapter_dir is not None and last_adapter_dir.exists():
            shutil.copytree(str(last_adapter_dir), str(adapter_dir), dirs_exist_ok=True)
        else:
            adapter_dir.mkdir(parents=True, exist_ok=True)
            model.save_pretrained(str(adapter_dir))
            tokenizer.save_pretrained(str(adapter_dir))
        print(f"  💾 Final adapter → {adapter_dir.name}/")

        if args.no_gguf:
            print("\n  🚫 --no-gguf: saving merged 16-bit safetensors (GGUF built locally)...")
            # Round-11 lesson: save_pretrained_merged() merges the PRE-TRAINING
            # snapshot (same unsloth quirk) — merge the LIVE trained model instead.
            merged_model = model.merge_and_unload()
            merged_model.save_pretrained(str(out_dir))
            tokenizer.save_pretrained(str(out_dir))
            ggufs = []
        else:
            print("\n  🔄 Exporting to GGUF (q4_k_m)...")
            model.save_pretrained_gguf(
                str(out_dir), tokenizer, quantization_method="q4_k_m"
            )
            ggufs = sorted(out_dir.glob("*.gguf"))
            if ggufs:
                g = ggufs[0]
                print(f"  📁 GGUF: {g.name} ({g.stat().st_size / 1e9:.2f} GB)")
        zip_name = out_dir / "results.zip"
        with zipfile.ZipFile(zip_name, "w", zipfile.ZIP_DEFLATED) as zf:
            for d in out_dir.iterdir():
                if d.is_dir() and (d.name.startswith("adapter")):
                    for f in d.rglob("*"):
                        if f.is_file():
                            zf.write(f, f.relative_to(out_dir))
            for g in ggufs:
                zf.write(g, g.name)
        print(f"  📦 Results zipped → {zip_name} ({zip_name.stat().st_size / 1e6:.1f} MB)")

        total_min = (time.time() - start) / 60
        print(f"\n{'=' * 50}")
        print(f"  ✅ Done in {total_min:.1f}m | Best Acc: {best_acc*100:.2f}% EM: {best_em*100:.2f}%")
        print(f"  Download: {zip_name}  (contains adapter_round*/ + adapter/"
              + ("" if args.no_gguf else " + GGUF")
              + "); merged safetensors are separate files in {out_dir}")
        print(f"{'=' * 50}")


if __name__ == "__main__":
    main()
