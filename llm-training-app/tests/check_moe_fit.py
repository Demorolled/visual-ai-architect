#!/usr/bin/env python3
"""Measure whether a base model fits for LoRA fine-tuning on this machine.

Uses engine.Engine._load_model_for_training — the exact loader the GUI uses — so the
numbers reflect the real path: 4-bit NF4 quantisation, device_map="auto", and all-linear
LoRA when a Mixture-of-Experts base is detected. Then runs one real forward+backward step.

If the engine's loader refuses the model, this retries with device_map={"": 0} to say
whether the refusal was accelerate's sharding choice or a genuine lack of VRAM — those
need different fixes.

    ./.venv/bin/python tests/check_moe_fit.py allenai/OLMoE-1B-7B-0924

Needs the model present locally or a network connection, and a CUDA GPU (the non-CUDA
path is fp32 on CPU, which is not representative).
"""
import os
import sys
import time
import traceback

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import torch

import engine as E


def peak_host_ram_gb():
    """Peak resident set size of this process, in GB."""
    with open("/proc/self/status") as fh:
        for line in fh:
            if line.startswith("VmHWM"):
                return int(line.split()[1]) / 1024 / 1024
    return 0.0


model_id = sys.argv[1] if len(sys.argv) > 1 else "allenai/OLMoE-1B-7B-0924"
max_len = int(os.environ.get("MAX_LEN", "512"))
print(f"model: {model_id}\nmax_length: {max_len}", flush=True)

free_b, total_b = torch.cuda.mem_get_info()
print(f"VRAM free before load: {(total_b - free_b) / 1024**3:.2f} GB used "
      f"of {total_b / 1024**3:.2f} GB", flush=True)

eng = E.Engine()
cfg = {"model_name": model_id, "max_length": max_len, "batch_size": 1}

# ── attempt 1: the engine's real loader ──────────────────────────────────────
t0 = time.time()
loaded = eng._load_model_for_training(cfg)
print(f"\n[engine loader, device_map='auto'] {time.time() - t0:.0f}s -> "
      f"{'OK' if loaded else 'REFUSED'}", flush=True)

via = "engine loader (device_map='auto')"

if loaded is None:
    # transformers' caching_allocator_warmup (modeling_utils.py) reserves the model's
    # *unquantised* fp16 size on the GPU before loading, and it only runs when a
    # device_map was supplied. For a 7B model that reservation is >10 GiB, which cannot
    # fit a 12 GB card even though the 4-bit weights only need ~4 GB. Passing no
    # device_map at all skips the warmup, so retry that way.
    print("[retry] loading with NO device_map (skips the fp16-sized allocation warmup)",
          flush=True)
    try:
        from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
        quant = BitsAndBytesConfig(
            load_in_4bit=True, bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_use_double_quant=True, bnb_4bit_quant_type="nf4")
        torch.cuda.set_device(0)
        t0 = time.time()
        model = AutoModelForCausalLM.from_pretrained(
            model_id, quantization_config=quant,
            trust_remote_code=True, torch_dtype=torch.float16)
        tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)
        tokenizer.pad_token = tokenizer.pad_token or tokenizer.eos_token
        loaded = (model, tokenizer)
        via = "no device_map (warmup skipped)"
        print(f"  OK in {time.time() - t0:.0f}s — the refusal was the device-map warmup, "
              f"not the VRAM", flush=True)
    except Exception:
        print("\n[retry failed] full traceback:")
        traceback.print_exc()
        print("\nRESULT: DOES NOT FIT on this GPU")
        sys.exit(1)

model, tok = loaded
torch.cuda.reset_peak_memory_stats()
print(f"\nsource of this model:        {via}")
print(f"VRAM after load (allocated): {torch.cuda.memory_allocated() / 1024**3:.2f} GB")
print(f"VRAM after load (reserved):  {torch.cuda.memory_reserved() / 1024**3:.2f} GB")
print(f"host RAM peak (VmHWM):       {peak_host_ram_gb():.2f} GB")

peft_cfg = getattr(model, "peft_config", {}).get("default")
print(f"LoRA target_modules:         {getattr(peft_cfg, 'target_modules', None)}")

if not isinstance(model, torch.nn.Module):
    print("model is not a torch Module — cannot continue")
    sys.exit(1)

trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
total = sum(p.numel() for p in model.parameters())
print(f"trainable params:            {trainable / 1e6:.1f} M of {total / 1e6:.0f} M "
      f"({100.0 * trainable / max(total, 1):.3f}%)")

lora_modules = [n for n, _ in model.named_modules() if "lora_" in n]
expert_lora = [n for n in lora_modules if "expert" in n.lower()]
print(f"modules carrying LoRA:       {len(lora_modules)} "
      f"(of which on expert layers: {len(expert_lora)})")
if expert_lora:
    print(f"  for example: {expert_lora[0]}")

# ── one real optimisation step ───────────────────────────────────────────────
device = next(model.parameters()).device
text = "def add(a, b):\n    return a + b\n"
batch = tok([text] * 8, return_tensors="pt", truncation=True,
            max_length=max_len, padding=True)
batch = {k: v.to(device) for k, v in batch.items()}

model.train()
t0 = time.time()
try:
    out = model(**batch, labels=batch["input_ids"])
    out.loss.backward()
except torch.cuda.OutOfMemoryError as exc:
    print(f"\nOOM during the training step: {exc}")
    print(f"VRAM peak allocated at OOM: {torch.cuda.max_memory_allocated() / 1024**3:.2f} GB")
    print("RESULT: LOADS BUT DOES NOT TRAIN at this sequence length")
    sys.exit(2)
except Exception:
    print("\nfailed during the training step:")
    traceback.print_exc()
    print("RESULT: LOADS BUT DOES NOT TRAIN")
    sys.exit(2)

print(f"\nforward+backward:            {time.time() - t0:.1f}s, loss {out.loss.item():.3f}")
print(f"VRAM peak allocated:         {torch.cuda.max_memory_allocated() / 1024**3:.2f} GB")
print(f"VRAM peak reserved:          {torch.cuda.max_memory_reserved() / 1024**3:.2f} GB")
print(f"host RAM peak (VmHWM):       {peak_host_ram_gb():.2f} GB")
print("\nRESULT: FITS — load plus one training step completed")
