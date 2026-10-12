#!/usr/bin/env python3
"""
train_r23.py — R23 QLoRA (3× RTX 3060, model-parallel, ONE process)
===================================================================
Replicates the PROVEN local pattern (train_14b_3gpu.py → out/14b-3gpu) with the
R22-expanded hyperparams: base BlossomsAI/Qwen2.5-Coder-14B-Instruct-Uncensored,
4-bit QLoRA r8/α16/d0.05 on all 7 modules, LR 5e-5, bf16, gradient checkpointing.
One process loads the 14B split across all 3 GPUs (device_map balanced) — the
approach that works on this box (unsloth's per-rank DDP hit "invalid device ordinal").

Usage (all 3 GPUs):
    CUDA_VISIBLE_DEVICES=0,1,2 llm-training-app/.venv/bin/python train_r23.py \
        --data training/cloud/round23-all.jsonl --output-dir training/cloud/out/round23
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

MODEL_NAME = "BlossomsAI/Qwen2.5-Coder-14B-Instruct-Uncensored"
SYSTEM_PROMPT = (
    "You are a Visual AI Architect assistant specializing in GUI development. "
    "You build complete web applications, explain UI patterns, generate code, "
    "and help with frontend development."
)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--output-dir", default="training/cloud/out/round23")
    ap.add_argument("--max-seq-length", type=int, default=2048)
    ap.add_argument("--epochs", type=float, default=2)
    ap.add_argument("--lr", type=float, default=5e-5)
    ap.add_argument("--grad-accum", type=int, default=4)
    ap.add_argument("--test", action="store_true", help="12-step smoke test")
    ap.add_argument("--device-map", default="balanced_low_0",
                    help="accelerate device_map (balanced_low_0 | auto | balanced)")
    ap.add_argument("--model", default=MODEL_NAME)
    args = ap.parse_args()

    print("=" * 60)
    print("  R23 QLoRA — 3-GPU model parallel (14B)")
    print(f"  model : {args.model}")
    print(f"  data  : {args.data}")
    print(f"  seq   : {args.max_seq_length} | epochs {args.epochs} | lr {args.lr:.1e}")
    print("=" * 60)

    import torch
    from datasets import Dataset as HFDataset
    from transformers import (
        AutoModelForCausalLM,
        AutoTokenizer,
        BitsAndBytesConfig,
        DataCollatorForSeq2Seq,
        Trainer,
        TrainingArguments,
    )
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training

    bnb = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )
    tokenizer = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    print("Loading 14B split across GPUs…")
    model = AutoModelForCausalLM.from_pretrained(
        args.model,
        quantization_config=bnb,
        device_map=args.device_map,
        trust_remote_code=True,
        torch_dtype=torch.bfloat16,
    )
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
    model = get_peft_model(model, LoraConfig(
        r=8, lora_alpha=16, lora_dropout=0.05, bias="none", task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                        "gate_proj", "up_proj", "down_proj"],
    ))
    model.gradient_checkpointing_enable()
    t, total = model.get_nb_trainable_parameters()
    print(f"Trainable: {t:,} / {total:,} ({100 * t / total:.2f}%)")
    for i in range(torch.cuda.device_count()):
        print(f"  GPU {i}: {torch.cuda.memory_allocated(i) / 1024**3:.1f} GB")

    # ─── Dataset: instruction/input/output → chat template, prompt masked ──
    p = Path(args.data)
    if not p.exists():
        print(f"❌ dataset not found: {p}", file=sys.stderr)
        sys.exit(1)
    records = []
    for line in p.open(encoding="utf-8"):
        line = line.strip()
        if not line:
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        instruction = rec.get("instruction", "")
        inp = rec.get("input", "") or ""
        output = rec.get("output", "")
        if not output or len(output.strip()) < 10:
            continue
        user_text = f"{instruction}\n\n{inp}".strip() if inp else instruction
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_text},
            {"role": "assistant", "content": output.strip()},
        ]
        prompt_ids = tokenizer.apply_chat_template(
            messages[:-1], tokenize=True, add_generation_prompt=True)
        full_ids = tokenizer.apply_chat_template(
            messages, tokenize=True, add_generation_prompt=False)
        full_ids = full_ids[: args.max_seq_length]
        labels = [-100] * min(len(prompt_ids), len(full_ids)) + \
                 full_ids[min(len(prompt_ids), len(full_ids)):]
        records.append({"input_ids": full_ids, "labels": labels})

    if not records:
        print("❌ no valid rows", file=sys.stderr)
        sys.exit(1)
    pad = tokenizer.pad_token_id or tokenizer.eos_token_id or 0
    for r in records:
        n = len(r["input_ids"])
        r["attention_mask"] = [1] * n
        if n < args.max_seq_length:
            r["input_ids"] += [pad] * (args.max_seq_length - n)
            r["labels"] += [-100] * (args.max_seq_length - n)
            r["attention_mask"] += [0] * (args.max_seq_length - n)
    ds = HFDataset.from_list(records).train_test_split(test_size=0.05, seed=42)
    print(f"rows: {len(ds['train'])} train / {len(ds['test'])} val")

    targs = TrainingArguments(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        lr_scheduler_type="cosine",
        warmup_steps=10,
        weight_decay=0.01,
        bf16=True,
        logging_steps=5,
        save_strategy="steps",
        save_steps=100,
        save_total_limit=3,
        dataloader_num_workers=2,
        remove_unused_columns=False,
        report_to="none",
        gradient_checkpointing=True,
        seed=42,
    )
    trainer = Trainer(
        model=model,
        args=targs,
        train_dataset=ds["train"],
        data_collator=DataCollatorForSeq2Seq(
            tokenizer=tokenizer, padding=True,
            max_length=args.max_seq_length, return_tensors="pt"),
    )
    if args.test:
        targs.max_steps = 12
        targs.num_train_epochs = 1.0

    print("\n🚀 Training…")
    t0 = time.time()
    try:
        trainer.train()
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
    print(f"\n✅ Done in {(time.time() - t0) / 60:.1f} min")
    out = os.path.join(args.output_dir, "final")
    trainer.save_model(out)
    tokenizer.save_pretrained(out)
    print(f"saved adapter: {out}")


if __name__ == "__main__":
    main()
