#!/usr/bin/env python3
"""
train_sky1_agent_3gpu.py — VACA Sky-T1 SFT on the agent computer's 3× RTX 3060.

Local port of the Kaggle Sky1 run (train_sky1_kaggle.ipynb) adapted for the
agent host llmlab@192.168.1.234:
  * 3× RTX 3060 (12 GB each, ~27 GB free after dspark gemma-4-12B serve)
  * Ampere → bf16 IS supported (T4s on Kaggle lacked it) → use bf16, not fp16
  * No unsloth (its Triton kernels broke on low-VRAM/older archs; plain
    transformers + PEFT QLoRA is the proven, stable path)
  * device_map='auto' so the 14B W4 model + gradient checkpointing spread
    across all 3 cards cleanly.

Run:
  source ~/vaca-venv/bin/activate
  python3 backend/scripts/train_sky1_agent_3gpu.py
"""
import json
import os
import sys
import glob
from pathlib import Path

os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import torch

ROOT = Path(__file__).resolve().parent.parent.parent  # project root (backend/scripts/..0/..)
CORPUS = ROOT / "training" / "cloud" / "sky1"
train_f = CORPUS / "train.jsonl"
val_f = CORPUS / "val.jsonl"

BASE = "BlossomsAI/Qwen2.5-Coder-14B-Instruct-Uncensored"
SEQ = int(os.environ.get("VACA_SEQ", "2048"))
BATCH = 1
GRAD_ACCUM = 4
LR = 5e-5
EPOCHS = 1
OUT = Path(os.environ.get("VACA_OUT", "/home/llmlab/vaca-training/sky1-agent"))
MAX_TRAIN = int(os.environ.get("VACA_MAX_TRAIN", "0"))  # slice for a fast run


def main():
    print("TORCH", torch.__version__, "| CUDA", torch.version.cuda)
    n = torch.cuda.device_count()
    print("GPUs:", n, [torch.cuda.get_device_name(i) for i in range(n)])
    print("bf16 supported:", torch.cuda.is_bf16_supported())

    if not train_f.exists():
        print("❌ train corpus missing:", train_f)
        sys.exit(1)

    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

    # ── 4-bit QLoRA quant config ──
    quant = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
        bnb_4bit_quant_type="nf4",
    )

    print("\n⬇️  Loading base", BASE, "(4-bit QLoRA, spread across GPUs)...")
    n_gpu = torch.cuda.device_count()
    # Force a BALANCED split: 'auto' tends to stack the 14B + fp32 lm_head +
    # activations onto one card and OOMs. Capping each 3060 leaves headroom on
    # every card so the loss/backward step has room. Keep ~1.5GB slack per card.
    cap_gb = float(os.environ.get("VACA_MEM_GB", "8"))  # 8GB/card = 24GB budget: fits model, balances

    # If caps are too low, 'auto' spills to CPU/disk (validate_environment fails).
    # 8GB each leaves ~1.5GB weight headroom per card for activations + loss.
    max_memory = {i: f"{cap_gb:.0f}GB" for i in range(n_gpu)}
    model_kwargs = dict(
        device_map="auto",
        torch_dtype=torch.bfloat16,
        quantization_config=quant,
        attn_implementation="flash_attention_2",
        max_memory=max_memory,
    )
    # flash_attention_2 may not be built for this arch; retry without it.
    try:
        model = AutoModelForCausalLM.from_pretrained(BASE, **model_kwargs)
    except Exception as e:
        print("flash_attention_2 unavailable, retrying eager:", str(e)[:120])
        model_kwargs.pop("attn_implementation")
        model = AutoModelForCausalLM.from_pretrained(BASE, **model_kwargs)
    tokenizer = AutoTokenizer.from_pretrained(BASE)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token

    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
    lora = LoraConfig(
        r=8, lora_alpha=16, target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                                            "gate_proj", "up_proj", "down_proj"],
        lora_dropout=0, bias="none", task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, lora)
    model.config.use_cache = False
    model.print_trainable_parameters()

    # ── Tokenize (assistant-only labels) ──
    SYSTEM = ("You are VACA's code architect. Think step by step, then give a "
              "working, small, fast, reusable solution.")
    print("\n⚙️  Tokenizing corpus...")
    rows = 0
    with open(train_f) as f:
        for line in f:
            if line.strip():
                rows += 1
    train_rows = rows
    if MAX_TRAIN:
        train_rows = min(MAX_TRAIN, rows)

    def build_ids(text):
        rec = json.loads(text)
        user = rec["instruction"].strip()
        if rec.get("input") and rec["input"].strip() and rec["input"] != "Auto-learned conversation":
            user = f"{rec['instruction']}\n\n{rec['input']}"
        msgs = [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user},
            {"role": "assistant", "content": rec["output"].strip()},
        ]
        pids = tokenizer.apply_chat_template(msgs[:-1], tokenize=True, add_generation_prompt=True)
        fids = tokenizer.apply_chat_template(msgs, tokenize=True, add_generation_prompt=False)
        # transformers v5 returns BatchEncoding; be tolerant of both forms.
        prompt_ids = pids["input_ids"] if hasattr(pids, "keys") and "input_ids" in pids else pids
        full_ids = fids["input_ids"] if hasattr(fids, "keys") and "input_ids" in fids else fids
        if len(full_ids) > SEQ:
            full_ids = full_ids[:SEQ]
        k = min(len(prompt_ids), len(full_ids))
        labels = [-100] * k + full_ids[k:]
        full_ids = (full_ids + [tokenizer.pad_token_id or tokenizer.eos_token_id] * SEQ)[:SEQ]
        labels = (labels + [-100] * SEQ)[:SEQ]
        return {"input_ids": full_ids, "attention_mask": [1] * len(full_ids), "labels": labels}

    print(f"  train rows: {rows} (using {train_rows})")
    recs = []
    with open(train_f) as f:
        for i, line in enumerate(f):
            if not line.strip():
                continue
            recs.append(build_ids(line))
            if MAX_TRAIN and len(recs) >= MAX_TRAIN:
                break

    val_rows = 0
    import random
    random.seed(42)
    random.shuffle(recs)
    n_val = max(1, int(len(recs) * 0.1))
    ds_train = recs[n_val:]
    ds_val = recs[:n_val]
    print(f"  train {len(ds_train)} | val {len(ds_val)}")

    # Small in-memory dataset
    from datasets import Dataset as HFDataset, concatenate_datasets

    def tok_ds(rows):
        d = {k: [r[k] for r in rows] for k in ("input_ids", "attention_mask", "labels")}
        return HFDataset.from_dict(d)

    train_ds = tok_ds(ds_train)
    eval_ds = tok_ds(ds_val)

    # ── Trainer ──
    from transformers import TrainingArguments, Trainer
    from transformers import DataCollatorForLanguageModeling

    data_collator = DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False)

    OUT.mkdir(parents=True, exist_ok=True)
    warmup_steps = max(1, int(len(ds_train) / (BATCH * GRAD_ACCUM) * 0.05))
    args = TrainingArguments(
        output_dir=str(OUT),
        per_device_train_batch_size=BATCH,
        gradient_accumulation_steps=GRAD_ACCUM,
        num_train_epochs=EPOCHS,
        learning_rate=LR,
        warmup_steps=warmup_steps,  # v5 dropped warmup_ratio
        logging_steps=5,
        logging_strategy="steps",
        eval_strategy="steps",       # v5 renamed from evaluation_strategy
        eval_steps=25,
        save_strategy="steps",
        save_steps=100,
        bf16=True,
        fp16=False,
        gradient_checkpointing=True,
        report_to=[],
        dataloader_pin_memory=False,
        remove_unused_columns=False,
    )

    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=train_ds,
        eval_dataset=eval_ds,
        data_collator=data_collator,
    )
    print("🏋️  Training...")
    trainer.train()

    final = OUT / "final"
    model.save_pretrained(str(final))
    tokenizer.save_pretrained(str(final))
    print("✅ adapter saved →", final)


if __name__ == "__main__":
    main()