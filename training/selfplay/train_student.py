#!/usr/bin/env python3
"""train_student.py — 14B QLoRA student round on 2× RTX 3060 (24 GB total).

Adapted from the repo-proven ``scripts/train_r30_agent.py`` 3-GPU recipe, but
for TWO 12 GB cards. The single 14B is 4-bit sharded across BOTH cards with an
explicit layer map — a per-GPU replica does NOT fit (weights ≈ 9.5 GB + the
fp32 lm_head cast ≈ 2.9 GB > 12 GB), so one sharded model is the only safe path.

Memory profile per 12 GB card (4-bit nf4, seq 1024, batch 1, grad-checkpoint):
  weights ≈ 2.5–3 GB · peft fp32 casts · activations → ~5–7 GB used, headroom
  left for CE logits. KEEP seq ≤ 1024 on 12 GB; raise only with real headroom.

Usage (on the agent, with the training venv):
    <train_python> training/selfplay/train_student.py \
        --data training/selfplay/corpus/r1/train.jsonl \
        --val  training/selfplay/corpus/r1/val.jsonl \
        --out  training/selfplay/models/r1 \
        --seq 1024 --epochs 2 --lr 5e-5 --grad-accum 4
    ... --dry-run    # validate rows + print the plan, no GPU
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from collections.abc import Mapping
from pathlib import Path

SYSTEM_PROMPT = (
    "You are a Visual AI Architect assistant specializing in GUI development. "
    "You build complete web applications, explain UI patterns, generate code, "
    "and help with frontend development."
)
TARGET_MODULES = ["q_proj", "k_proj", "v_proj", "o_proj",
                  "gate_proj", "up_proj", "down_proj"]


def ids_of(x):
    """Shape-proof flat list of token ints.

    transformers >= 5 returns a BatchEncoding (a UserDict Mapping, NOT a dict)
    when tokenize=True; iterating it yields KEYS and crashes Dataset build.
    """
    if x is None:
        return []
    if hasattr(x, "ids"):
        x = x.ids
    if not isinstance(x, Mapping) and hasattr(x, "input_ids"):
        x = x.input_ids
    if isinstance(x, Mapping):
        ids = x.get("input_ids") or x.get("inputIds")
        if ids is None:
            for v in x.values():
                ids = v
                break
        x = ids if ids is not None else []
    if hasattr(x, "tolist"):
        x = x.tolist()
    if isinstance(x, int):
        return [x]
    if isinstance(x, str):
        return [int(x)] if x.lstrip("-").isdigit() else []
    out = []
    for item in x:
        if hasattr(item, "tolist"):
            item = item.tolist()
        if isinstance(item, (list, tuple, Mapping)):
            out.extend(ids_of(item))
        else:
            out.append(int(item))
    return out


def load_rows(path: Path, max_seq: int, tokenizer):
    """instruction/input/output → masked chat-template records."""
    records = []
    for line in path.open(encoding="utf-8"):
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
        if not output or not output.strip():
            continue
        out = output.strip()
        # Keep short-but-legit answers (pick rows are "NODE: A"); drop garbage.
        if not (len(out) >= 3 and (len(out) >= 10
                                   or re.fullmatch(r"(?:NODE\s*[:=]\s*)?[ABC]", out, re.I))):
            continue
        user_text = f"{instruction}\n\n{inp}".strip() if inp else instruction
        sys_prompt = rec.get("system") or SYSTEM_PROMPT
        messages = [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_text},
            {"role": "assistant", "content": out},
        ]
        prompt_ids = ids_of(tokenizer.apply_chat_template(
            messages[:-1], tokenize=True, add_generation_prompt=True))
        full_ids = ids_of(tokenizer.apply_chat_template(
            messages, tokenize=True, add_generation_prompt=False))[:max_seq]
        m = min(len(prompt_ids), len(full_ids))
        records.append({"input_ids": full_ids, "labels": [-100] * m + full_ids[m:]})
    return records


def main() -> int:
    ap = argparse.ArgumentParser(description="14B QLoRA student round (2× RTX 3060)")
    ap.add_argument("--data", required=True)
    ap.add_argument("--val", default=None)
    ap.add_argument("--out", required=True)
    ap.add_argument("--base", default="BlossomsAI/Qwen2.5-Coder-14B-Instruct-Uncensored")
    ap.add_argument("--seq", type=int, default=1024)
    ap.add_argument("--epochs", type=float, default=2)
    ap.add_argument("--lr", type=float, default=5e-5)
    ap.add_argument("--grad-accum", type=int, default=4)
    ap.add_argument("--card-gb", type=float, default=10.5, help="per-card VRAM budget")
    ap.add_argument("--max-train", type=int, default=0, help="cap rows (smoke test)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    train_f = Path(args.data)
    if not train_f.exists():
        print(f"❌ train corpus missing: {train_f}", file=sys.stderr)
        return 1

    n_rows = sum(1 for ln in train_f.open(encoding="utf-8") if ln.strip())
    print(f"[train_student] base={args.base}")
    print(f"[train_student] data={train_f} ({n_rows} rows)")
    print(f"[train_student] seq={args.seq} epochs={args.epochs} lr={args.lr:g} "
          f"accum={args.grad_accum} card_budget={args.card_gb}GB")

    if args.dry_run:
        # Rough 4-bit footprint: 14B × ~0.5 B/param ≈ 7 GB weights, split on 2.
        print(f"[train_student] DRY RUN — ~7 GB 4-bit weights split across 2 cards "
              f"(~3.5 GB/card) + activations at seq {args.seq}. No GPU work done.")
        return 0

    os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
    os.environ.setdefault("PYTORCH_ALLOC_CONF", "expandable_segments:True")
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

    import torch
    from datasets import Dataset as HFDataset, Features, Sequence, Value
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    from transformers import (AutoConfig, AutoModelForCausalLM, AutoTokenizer,
                              BitsAndBytesConfig, DataCollatorForSeq2Seq,
                              Trainer, TrainingArguments)

    n_gpus = torch.cuda.device_count()
    print(f"[train_student] GPUs: {n_gpus} "
          f"{[torch.cuda.get_device_name(i) for i in range(n_gpus)]}")
    if n_gpus < 2:
        print("⚠️  fewer than 2 GPUs — device_map will spread on what exists")

    tokenizer = AutoTokenizer.from_pretrained(args.base, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # ── Explicit layer split (deterministic; 'auto' piles onto one card + OOMs).
    cfg = AutoConfig.from_pretrained(args.base, trust_remote_code=True)
    n_layers = cfg.num_hidden_layers                     # 48 for Qwen2.5-14B
    per = max(1, n_layers // max(n_gpus, 1))
    device_map = {"model.embed_tokens": 0}
    for i in range(n_layers):
        device_map[f"model.layers.{i}"] = min(i // per, max(n_gpus - 1, 0))
    last = max(n_gpus - 1, 0)
    device_map["model.norm"] = last
    device_map["lm_head"] = last
    max_memory = {i: f"{args.card_gb}GB" for i in range(max(1, n_gpus))}
    print(f"[train_student] layer map: {per} layers/card, head on GPU {last}")

    bnb = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
                             bnb_4bit_compute_dtype=torch.float16,
                             bnb_4bit_use_double_quant=True)
    os.makedirs("/tmp/offload", exist_ok=True)
    model = AutoModelForCausalLM.from_pretrained(
        args.base, quantization_config=bnb, device_map=device_map,
        max_memory=max_memory, offload_folder="/tmp/offload",
        offload_state_dict=False, low_cpu_mem_usage=True,
        trust_remote_code=True, torch_dtype=torch.float16,
    )
    torch.cuda.empty_cache()
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
    model = get_peft_model(model, LoraConfig(
        r=8, lora_alpha=16, lora_dropout=0.05, bias="none", task_type="CAUSAL_LM",
        target_modules=TARGET_MODULES))
    model.gradient_checkpointing_enable()
    t, total = model.get_nb_trainable_parameters()
    print(f"[train_student] trainable: {t:,} / {total:,} ({100*t/total:.2f}%)")

    # ── Dataset ──
    recs = load_rows(train_f, args.seq, tokenizer)
    if args.max_train:
        recs = recs[:args.max_train]
    if not recs:
        print("❌ no valid rows after filtering", file=sys.stderr)
        return 1
    val_recs = load_rows(Path(args.val), args.seq, tokenizer) if args.val and Path(args.val).exists() else []
    if not val_recs:
        import random
        random.seed(42); random.shuffle(recs)
        n_val = max(1, int(len(recs) * 0.05))
        val_recs, recs = recs[:n_val], recs[n_val:]

    pad = tokenizer.pad_token_id or tokenizer.eos_token_id or 0
    for r in recs + val_recs:
        n = len(r["input_ids"])
        r["attention_mask"] = [1] * n
        if n < args.seq:
            r["input_ids"] += [pad] * (args.seq - n)
            r["labels"] += [-100] * (args.seq - n)
            r["attention_mask"] += [0] * (args.seq - n)
    feats = Features({"input_ids": Sequence(Value("int32")),
                      "labels": Sequence(Value("int32")),
                      "attention_mask": Sequence(Value("int32"))})
    clean = lambda rs: [{k: ids_of(r[k]) for k in ("input_ids", "labels", "attention_mask")} for r in rs]
    train_ds = HFDataset.from_list(clean(recs), features=feats)
    val_ds = HFDataset.from_list(clean(val_recs), features=feats) if val_recs else None
    print(f"[train_student] rows: {len(train_ds)} train / "
          f"{len(val_ds) if val_ds else 0} val")

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    targs = TrainingArguments(
        output_dir=str(out), num_train_epochs=args.epochs,
        per_device_train_batch_size=1, gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr, lr_scheduler_type="cosine", warmup_steps=10,
        weight_decay=0.01, bf16=False, fp16=True,
        logging_steps=5, save_strategy="steps", save_steps=50, save_total_limit=3,
        dataloader_num_workers=0, dataloader_pin_memory=False,
        remove_unused_columns=False, report_to="none",
        gradient_checkpointing=True, seed=42, ddp_find_unused_parameters=False,
    )
    trainer = Trainer(
        model=model, args=targs, train_dataset=train_ds,
        eval_dataset=val_ds,
        data_collator=DataCollatorForSeq2Seq(tokenizer=tokenizer, padding=True,
                                             max_length=args.seq, return_tensors="pt"),
    )
    t0 = time.time()
    print("[train_student] 🚀 training…")
    trainer.train()
    final = out / "final"
    trainer.save_model(final)
    tokenizer.save_pretrained(final)
    mins = (time.time() - t0) / 60
    print(f"[train_student] ✅ done in {mins:.1f} min → adapter {final}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
