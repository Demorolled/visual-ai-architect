#!/usr/bin/env python3
"""
Continue-pretrain (domain-adapt) a downloaded open base model on your own text.

This is the "download an LLM off the internet, then begin training it" path —
the complement to `training/fromscratch/` (which starts at random init for a
very different reason: it wants a *knowledge-free* model, which no amount of
training a downloaded base can give you).

What it does
  raw text files ──▶ tokenize ──▶ pack into fixed-length blocks ──▶ next-token
  loss (optionally LoRA / 4-bit) with a cosine LR schedule.

Because it trains on *packed raw text* rather than chat pairs, it adapts the
base to a domain (your corpus, your code stacks, your prose) without teaching
it a chat format. Do instruction-following afterwards with the SFT trainer
(`training/cloud/train_round1.py` or `training/selfplay/train_student.py`).

Usage
  # 0. look (no GPU, no download)
  python3 training/smallbase/continue_pretrain.py --base Qwen/Qwen2.5-Coder-1.5B \\
      --data code='training/dataset/**/*.txt' --dry-run

  # 1. real run, LoRA, 4-bit, one 12 GB card
  python3 training/smallbase/continue_pretrain.py --base Qwen/Qwen2.5-Coder-1.5B \\
      --data code='corpora/code/**/*.ts' \\
      --data prose='docs/**/*.md' \\
      --out-dir training/smallbase/out/step1

  # 2. resume / continue an LR ladder (halve each round, matches the R-series)
  python3 training/smallbase/continue_pretrain.py --base Qwen/Qwen2.5-Coder-1.5B \\
      --data code='corpora/code/**/*.ts' --load-adapter training/smallbase/out/step1/final \\
      --lr 5e-5 --out-dir training/smallbase/out/step2
"""
from __future__ import annotations

import argparse
import glob as globlib
import json
import math
import os
import random
import sys
import time
from pathlib import Path

# Splits are recorded so an ablation can be re-run identically months later.
DEFAULT_LORA_TARGETS = [
    "q_proj", "k_proj", "v_proj", "o_proj",
    "gate_proj", "up_proj", "down_proj",
]
DEFAULT_BLACKLIST_SUFFIXES = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz",
    ".tar", ".pt", ".pth", ".bin", ".safetensors", ".gguf", ".onnx", ".npz",
    ".mp3", ".mp4", ".wav", ".so", ".dll", ".dylib", ".pyc", ".lock",
}
# Directories that are never corpus material.
DEFAULT_BLACKLIST_PARTS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build",
    ".cache", "site-packages", ".next", "coverage", ".pytest_cache",
}


# ─── Corpus ──────────────────────────────────────────────────────────────────

def iter_files(pattern: str) -> list[Path]:
    """Expand a glob (absolute or repo-relative) to text files, filtered."""
    pat = os.path.expanduser(pattern)
    if not os.path.isabs(pat):
        pat = str(Path.cwd() / pat)
    out = []
    for raw in globlib.glob(pat, recursive=True):
        p = Path(raw)
        if not p.is_file():
            continue
        if p.suffix.lower() in DEFAULT_BLACKLIST_SUFFIXES:
            continue
        if DEFAULT_BLACKLIST_PARTS & set(p.parts):
            continue
        if p.stat().st_size == 0:
            continue
        out.append(p)
    return sorted(out)


def parse_slices(pairs: list[str]) -> dict[str, str]:
    slices: dict[str, str] = {}
    for pair in pairs:
        if "=" not in pair:
            print(f"❌ --data must be NAME=GLOB, got: {pair}")
            sys.exit(2)
        name, pattern = pair.split("=", 1)
        name = name.strip()
        if not name:
            print(f"❌ --data slice name cannot be empty: {pair}")
            sys.exit(2)
        slices[name] = pattern.strip()
    return slices


def read_slice(patterns: dict[str, str], cap_mb: float, log=print) -> dict[str, list[str]]:
    """Read every slice into memory as a list of documents.

    A cap is mandatory: globbing something like `/` by accident should be a
    refusal, not an OOM three minutes into training.
    """
    budget = int(cap_mb * 1024 * 1024)
    docs: dict[str, list[str]] = {}
    for name, pattern in patterns.items():
        files = iter_files(pattern)
        if not files:
            print(f"❌ slice '{name}' matched no files: {pattern}")
            sys.exit(1)
        used, kept, truncated = 0, [], False
        for f in files:
            try:
                text = f.read_text(encoding="utf-8", errors="ignore")
            except OSError as e:
                log(f"  ⚠️  skip {f}: {e}")
                continue
            text = text.strip()
            if not text:
                continue
            used += len(text.encode("utf-8"))
            if used > budget:
                truncated = True
                break
            kept.append(text)
        docs[name] = kept
        note = f" (capped at {cap_mb:g} MB)" if truncated else ""
        log(f"  📄 {name:<12} {len(kept):>6} docs / {len(files)} files{note}")
    return docs


def split_docs(docs: dict[str, list[str]], val_frac: float, seed: int):
    rng = random.Random(seed)
    train, val = {}, {}
    for name, items in docs.items():
        idx = list(range(len(items)))
        rng.shuffle(idx)
        n_val = max(1, int(len(idx) * val_frac)) if len(idx) > 1 else 0
        val_idx = set(idx[:n_val])
        train[name] = [items[i] for i in idx if i not in val_idx]
        # Tiny corpus (1-2 docs): evaluate on what we trained on rather than
        # silently skipping the slice.
        val[name] = [items[i] for i in idx if i in val_idx] or list(items)
    return train, val


def pack_blocks(tokenizer, texts: list[str], max_seq_length: int,
                allow_partial: bool = False, pad_id: int = 0) -> list[tuple[list[int], int]]:
    """Tokenize and concatenate, then cut into blocks of `max_seq_length`.

    Documents are joined with EOS so the model learns end-of-document and the
    packer never fuses two files without a boundary token.

    Returns (input_ids, real_length) pairs. `real_length` < len(input_ids) only
    for a padded trailing block, so the caller can mask the padding out of the
    loss — otherwise a padded block would quietly report a better val loss.
    """
    eos = tokenizer.eos_token_id
    stream: list[int] = []
    for text in texts:
        ids = tokenizer(text, add_special_tokens=False)["input_ids"]
        if not ids:
            continue
        stream.extend(ids)
        if eos is not None:
            stream.append(eos)
    if not stream:
        return []

    blocks = [stream[i:i + max_seq_length]
              for i in range(0, len(stream), max_seq_length)]
    out = [(b, len(b)) for b in blocks if len(b) == max_seq_length]

    # A small corpus (and every validation slice of one) can be shorter than a
    # single block. Dropping the tail would silently delete a slice from the
    # per-slice val loss — the exact signal the A6 check reads — so pad it
    # instead and let the caller mask the padding.
    if allow_partial and len(blocks[-1]) < max_seq_length:
        tail = blocks[-1]
        out.append((tail + [pad_id] * (max_seq_length - len(tail)), len(tail)))
    return out


def encode_slices(tokenizer, train, val, max_seq_length, log=print):
    from datasets import Dataset as HFDataset
    pad_id = tokenizer.pad_token_id
    if pad_id is None:
        pad_id = tokenizer.eos_token_id if tokenizer.eos_token_id is not None else 0

    # The packer chunks on purpose, so a document longer than the model's
    # context is expected and safe. Raise the tokenizer's own limit while
    # packing so transformers stops warning that a 49k-token file "will result
    # in indexing errors" — we never hand an unchunked document to the model —
    # and restore it afterwards so the saved tokenizer config is unchanged.
    _orig_max_len = getattr(tokenizer, "model_max_length", None)
    if isinstance(_orig_max_len, int) and 0 < _orig_max_len < 10**9:
        tokenizer.model_max_length = 10**9

    def to_ds(d, allow_partial: bool):
        out = []
        for name, texts in d.items():
            blocks = pack_blocks(tokenizer, texts, max_seq_length, allow_partial, pad_id)
            log(f"  🧱 {name:<12} {len(blocks):>6} blocks of {max_seq_length} tok")
            for ids, real_len in blocks:
                labels = list(ids)
                for i in range(real_len, len(labels)):
                    labels[i] = -100          # ignored by the cross-entropy
                out.append({
                    "input_ids": ids,
                    "labels": labels,
                    "attention_mask": [1] * real_len + [0] * (len(ids) - real_len),
                    "slice": name,
                })
        if not out:
            print("❌ No training blocks produced — is the corpus large enough "
                  "for this --max-seq-length?")
            sys.exit(1)
        # with_format("torch") is load-bearing: on datasets>=4 with torch>=2 the
        # default DataLoader collation hands back plain nested LISTS, so
        # batch["input_ids"].to(dev) raises AttributeError.
        ds = HFDataset.from_list(out).with_format("torch")
        return ds, sorted({r["slice"] for r in out})

    try:
        train_ds, slice_names = to_ds(train, allow_partial=False)
        val_ds, _ = to_ds(val, allow_partial=True)
    finally:
        if _orig_max_len is not None:
            tokenizer.model_max_length = _orig_max_len

    log(f"  ✓ train {len(train_ds)} blocks · val {len(val_ds)} blocks"
        f" · slices: {', '.join(slice_names)}")
    return train_ds, val_ds, slice_names


# ─── Model ───────────────────────────────────────────────────────────────────

def load_model(args, log=print):
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
    from peft import LoraConfig, get_peft_model, PeftModel, prepare_model_for_kbit_training

    log(f"⬇️  Loading base {args.base} ({'4-bit NF4' if args.load_in_4bit else 'fp16/bf16'})...")
    tokenizer = AutoTokenizer.from_pretrained(args.base, trust_remote_code=args.trust_remote_code)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token

    quant = None
    if args.load_in_4bit:
        compute_dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
        quant = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
            bnb_4bit_compute_dtype=compute_dtype,
        )

    # transformers 5.x renamed the dtype kwarg; pass whichever this version takes
    # so the run is not polluted by a deprecation warning.
    try:
        from transformers import __version__ as _tf_version
        _tf_major = int(_tf_version.split(".")[0])
    except Exception:
        _tf_major = 4
    dtype_kw = ({"dtype": "auto"} if _tf_major >= 5 else {"torch_dtype": "auto"})
    if quant is not None:
        dtype_kw = {}          # the quant config already dictates the compute dtype

    model = AutoModelForCausalLM.from_pretrained(
        args.base,
        quantization_config=quant,
        device_map={"": 0} if args.device == "cuda:0" else args.device,
        trust_remote_code=args.trust_remote_code,
        **dtype_kw,
    )
    model.config.use_cache = False

    if args.mode == "full":
        if args.load_in_4bit:
            print("❌ --mode full cannot be combined with --load-in-4bit "
                  "(you cannot backprop through NF4 weights).")
            sys.exit(2)
        if args.load_adapter:
            print("❌ --load-adapter is a LoRA resume path; it needs --mode lora.")
            sys.exit(2)
        for p in model.parameters():
            p.requires_grad = True
        log("  ⚙️  full fine-tune: all parameters trainable")
    else:
        if args.load_in_4bit:
            model = prepare_model_for_kbit_training(model)
        targets = args.target_modules or detect_targets(model)
        if not targets:
            print("❌ Could not detect LoRA target modules. Pass --target-modules "
                  "q_proj,k_proj,v_proj,o_proj explicitly.")
            sys.exit(1)
        cfg = LoraConfig(
            r=args.lora_r, lora_alpha=args.lora_alpha, lora_dropout=args.lora_dropout,
            bias="none", task_type="CAUSAL_LM", target_modules=targets,
        )
        model = get_peft_model(model, cfg)
        trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
        total = sum(p.numel() for p in model.parameters())
        log(f"  ⚙️  LoRA r={args.lora_r} α={args.lora_alpha} on {len(targets)} proj "
            f"modules · {trainable/1e6:.1f}M trainable ({100*trainable/total:.2f}%)")

    if args.load_adapter:
        model = PeftModel.from_pretrained(model, args.load_adapter, is_trainable=True)
        log(f"  ↩️  resumed adapter: {args.load_adapter}")

    model.train()
    n_dev = torch.cuda.device_count() if torch.cuda.is_available() else 0
    if n_dev and args.device.startswith("cuda"):
        log(f"  🟢 {torch.cuda.get_device_name(0)} · "
            f"{torch.cuda.get_device_properties(0).total_memory/1e9:.1f} GB")
    else:
        log("  ⚠️  no CUDA GPU visible — this will be very slow")
    return model, tokenizer


def detect_targets(model) -> list[str]:
    """Find which of the usual projection names this architecture actually has."""
    names = {n.split(".")[-1] for n, _ in model.named_modules()}
    return [t for t in DEFAULT_LORA_TARGETS if t in names]


# ─── Training loop ───────────────────────────────────────────────────────────

def lr_at(step: int, total: int, base_lr: float, warmup: int, floor_frac: float = 0.1) -> float:
    """Linear warmup then cosine decay to `floor_frac` of base_lr."""
    if step < warmup:
        return base_lr * (step + 1) / max(1, warmup)
    span = max(1, total - warmup)
    prog = min(1.0, (step - warmup) / span)
    return base_lr * (floor_frac + (1 - floor_frac) * 0.5 * (1 + math.cos(math.pi * prog)))


def evaluate(model, val_ds, batch_size: int, max_blocks_per_slice: int = 32, log=print):
    """Average val loss overall, plus a breakdown per corpus slice.

    The budget is **per slice**, not global. A global cap over a slice-ordered
    validation set spends the whole budget on the first slice and silently
    omits the rest from the per-slice table — and that table is the A6
    slice-collapse signal, so an omitted slice would look like a healthy one.
    """
    import torch
    from torch.utils.data import DataLoader
    model.eval()
    dev = next(model.parameters()).device

    # Fair subsample: at most max_blocks_per_slice blocks from each slice.
    seen: dict[str, int] = {}
    keep: list[int] = []
    for i, s in enumerate(val_ds["slice"]):
        if seen.get(s, 0) < max_blocks_per_slice:
            seen[s] = seen.get(s, 0) + 1
            keep.append(i)
    sub = val_ds.select(keep).with_format("torch")

    loader = DataLoader(sub, batch_size=batch_size, shuffle=False)
    per_slice: dict[str, list[float]] = {}
    total_loss, n = 0.0, 0
    with torch.no_grad():
        for batch in loader:
            ids = batch["input_ids"].to(dev)
            att = batch["attention_mask"].to(dev)
            labels = batch["labels"].to(dev)
            out = model(input_ids=ids, attention_mask=att, labels=labels)
            total_loss += out.loss.item()
            n += 1
            for s in batch["slice"]:
                per_slice.setdefault(s, []).append(out.loss.item())
    model.train()
    avg = total_loss / max(1, n)
    return avg, {s: sum(v) / len(v) for s, v in per_slice.items()}


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Continue-pretrain a downloaded base model on raw text (VACA)")
    ap.add_argument("--base", required=True,
                    help="HF id or local dir (e.g. Qwen/Qwen2.5-Coder-1.5B)")
    ap.add_argument("--data", action="append", default=[], metavar="NAME=GLOB",
                    help="Corpus slice; repeatable. e.g. --data code='corpora/code/**/*.ts'")
    ap.add_argument("--out-dir", default="training/smallbase/out/run1")
    ap.add_argument("--mode", choices=["lora", "full"], default="lora")
    ap.add_argument("--load-in-4bit", action="store_true",
                    help="NF4 QLoRA (recommended at 12 GB)")
    ap.add_argument("--load-adapter", default=None, help="Resume from an adapter dir")
    ap.add_argument("--target-modules", default=None,
                    help="Comma-separated LoRA targets (default: auto-detect)")
    ap.add_argument("--lora-r", type=int, default=16)
    ap.add_argument("--lora-alpha", type=int, default=32)
    ap.add_argument("--lora-dropout", type=float, default=0.05)
    ap.add_argument("--max-seq-length", type=int, default=1024)
    ap.add_argument("--batch-size", type=int, default=2)
    ap.add_argument("--grad-accum", type=int, default=8)
    ap.add_argument("--lr", type=float, default=None,
                    help="Default: 1e-4 (lora) / 2e-5 (full)")
    ap.add_argument("--epochs", type=float, default=1.0)
    ap.add_argument("--max-steps", type=int, default=0, help="0 = derive from epochs")
    ap.add_argument("--warmup-steps", type=int, default=50)
    ap.add_argument("--grad-clip", type=float, default=1.0)
    ap.add_argument("--weight-decay", type=float, default=0.1)
    ap.add_argument("--val-frac", type=float, default=0.01)
    ap.add_argument("--eval-every", type=int, default=100)
    ap.add_argument("--eval-blocks-per-slice", type=int, default=32,
                    help="Val blocks sampled PER SLICE (bounded cost, full slice coverage)")
    ap.add_argument("--save-every", type=int, default=200)
    ap.add_argument("--max-mb-per-slice", type=float, default=2048.0,
                    help="Safety cap per slice so a bad glob cannot OOM the box")
    ap.add_argument("--device", default="cuda:0")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--trust-remote-code", action="store_true")
    ap.add_argument("--dry-run", action="store_true",
                    help="Read the corpus, print the plan, exit (needs no GPU)")
    args = ap.parse_args()

    if args.lr is None:
        args.lr = 2e-5 if args.mode == "full" else 1e-4
    if args.target_modules:
        args.target_modules = [t.strip() for t in args.target_modules.split(",") if t.strip()]
    if not args.data:
        print("❌ --data is required (NAME=GLOB). Nothing to train on.")
        return 2
    if args.mode == "full" and args.load_in_4bit:
        print("❌ --mode full cannot be combined with --load-in-4bit "
              "(you cannot backprop through NF4 weights).")
        return 2
    if args.mode == "full" and args.load_adapter:
        print("❌ --load-adapter is a LoRA resume path; it needs --mode lora.")
        return 2

    random.seed(args.seed)
    try:
        import torch
        torch.manual_seed(args.seed)
    except ImportError:
        torch = None

    print("\n════════ continue-pretrain ════════")
    print(f"  base      : {args.base}")
    print(f"  mode      : {args.mode}"
          f"{' + NF4 4-bit' if args.load_in_4bit else ''}")
    print(f"  seq / batch: {args.max_seq_length} × {args.batch_size}"
          f" × grad-accum {args.grad_accum}"
          f" = {args.max_seq_length*args.batch_size*args.grad_accum:,} tok/step (effective)")
    print(f"  lr        : {args.lr:g} (warmup {args.warmup_steps}, cosine → 10%)")
    print(f"  out       : {args.out_dir}")
    print(f"  seed      : {args.seed}")

    patterns = parse_slices(args.data)
    print("\n📚 corpus")
    docs = read_slice(patterns, args.max_mb_per_slice)
    train_docs, val_docs = split_docs(docs, args.val_frac, args.seed)

    if args.dry_run:
        total_chars = sum(len(t) for items in train_docs.values() for t in items)
        # Rough: most code/text tokenizes to ~3.5 chars/token.
        est_tokens = int(total_chars / 3.5)
        steps = est_tokens // (args.max_seq_length * args.batch_size * args.grad_accum)
        print(f"\n  ≈ {total_chars/1e6:.2f} M chars ≈ {est_tokens/1e6:.2f} M tokens"
              f" → ~{steps:,} optimizer steps/epoch")
        print(f"\n✅ dry-run OK — corpus readable, plan coherent.")
        print(f"   Drop --dry-run to train. Ensure torch+transformers+peft+datasets "
              f"are installed (see training/smallbase/requirements.txt).")
        print("   (--dry-run never downloads the base model.)\n")
        return 0

    try:
        import torch
        from torch.utils.data import DataLoader
        from transformers import AutoTokenizer
    except ImportError as e:
        print(f"❌ Missing training dependency: {e}\n"
              "   pip install -r training/smallbase/requirements.txt")
        return 1
    if not torch.cuda.is_available() and args.device.startswith("cuda"):
        print("❌ CUDA requested but not available. Use --device cpu (slow) or fix the GPU.")
        return 1

    model, tokenizer = load_model(args)

    print("\n🧱 packing")
    train_ds, val_ds, slices = encode_slices(
        tokenizer, train_docs, val_docs, args.max_seq_length)

    eff_batch = args.batch_size * args.grad_accum
    steps_per_epoch = max(1, len(train_ds) // eff_batch)
    total_steps = args.max_steps or max(1, int(steps_per_epoch * args.epochs))

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    run_cfg = {**vars(args), "total_steps": total_steps, "slices": slices,
               "train_blocks": len(train_ds), "val_blocks": len(val_ds)}
    (out_dir / "run_config.json").write_text(json.dumps(run_cfg, indent=2))
    print(f"\n🏋️  {total_steps} steps ({steps_per_epoch}/epoch, {args.epochs} epoch)\n")

    trainable = [p for p in model.parameters() if p.requires_grad]
    optimizer = torch.optim.AdamW(trainable, lr=args.lr,
                                  betas=(0.9, 0.95), weight_decay=args.weight_decay)
    loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True,
                        drop_last=True, generator=torch.Generator().manual_seed(args.seed))

    dev = next(model.parameters()).device
    step, epoch, t0 = 0, 0, time.time()
    history = []
    while step < total_steps:
        epoch += 1
        for batch in loader:
            if step >= total_steps:
                break
            lr = lr_at(step, total_steps, args.lr, args.warmup_steps)
            for g in optimizer.param_groups:
                g["lr"] = lr

            ids = batch["input_ids"].to(dev)
            att = batch["attention_mask"].to(dev)
            labels = batch["labels"].to(dev)
            out = model(input_ids=ids, attention_mask=att, labels=labels)
            (out.loss / args.grad_accum).backward()

            if (step + 1) % args.grad_accum == 0:
                torch.nn.utils.clip_grad_norm_(trainable, args.grad_clip)
                optimizer.step()
                optimizer.zero_grad(set_to_none=True)

            if step % 10 == 0:
                print(f"  step {step:>6}/{total_steps}  loss {out.loss.item():.4f}  "
                      f"lr {lr:.2e}  epoch {epoch}  "
                      f"{time.time()-t0:.0f}s", flush=True)

            if args.eval_every and step and step % args.eval_every == 0:
                vl, per_slice = evaluate(model, val_ds, args.batch_size,
                                        args.eval_blocks_per_slice)
                print(f"  📊 val loss {vl:.4f}  " +
                      "  ".join(f"{s}={v:.3f}" for s, v in sorted(per_slice.items())))
                history.append({"step": step, "val_loss": vl, "per_slice": per_slice,
                                "lr": lr})
                (out_dir / "history.json").write_text(json.dumps(history, indent=2))

            if args.save_every and step and step % args.save_every == 0:
                save(model, tokenizer, out_dir / f"step{step}", args)
                print(f"  💾 saved {out_dir}/step{step}")

            step += 1

    final = out_dir / "final"
    save(model, tokenizer, final, args)
    print(f"\n✅ done — {total_steps} steps in {(time.time()-t0)/60:.1f} min")
    print(f"   adapter/model: {final}")
    if args.mode == "full":
        print("   Next: merge → GGUF → ollama (see training/cloud/README.md)")
    else:
        print("   Next: SFT it on instruction pairs (training/cloud/train_round1.py),\n"
              "   or merge the adapter into the base and convert to GGUF —\n"
              "   copy the pattern in scripts/build-r20-merged.py.")
        if (out_dir / "history.json").exists():
            print(f"   Val loss history: {out_dir}/history.json")
    return 0


def save(model, tokenizer, path: Path, args) -> None:
    path.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(str(path))
    tokenizer.save_pretrained(str(path))


if __name__ == "__main__":
    sys.exit(main())
