#!/usr/bin/env python3
"""
Pick a small OPEN base model to download and continue-train on.

Answers "is there an open LLM I can just download and start training?" with
measured numbers instead of vibes: for each candidate it queries the Hugging
Face API for the REAL download size, parameter count, license and gating
status, then estimates whether it fits THIS machine's GPU.

No torch / no GPU needed — this is a metadata + arithmetic tool, so it runs
anywhere (and is safe as a CI/preflight step).

Usage:
  python3 training/smallbase/pick_base.py                  # the shortlist table
  python3 training/smallbase/pick_base.py --role code      # only code-first bases
  python3 training/smallbase/pick_base.py --vram 24        # target a rented card
  python3 training/smallbase/pick_base.py --json           # machine-readable
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request

HF_API = "https://huggingface.co/api/models/{model}?blobs=true"

# Weights/config we would actually download; exclude alternate formats
# (GGUF/onnx/pth/tf) so the size reflects `from_pretrained`, not repo clutter.
_KEEP_SUFFIXES = (".safetensors", ".bin", ".json", ".model", ".txt", ".py")
_DROP_SUFFIXES = (".gguf", ".onnx", ".pth", ".h5", ".msgpack", ".tflite", ".mlmodel")

# role: what the base already gives you before any training.
#   code  = code completion / repository work
#   speak = fluent short-form English conversation
#   reason= explicit chain-of-thought / thinking traces
#   tiny  = fits anywhere, mainly for smoke tests and tokenizer experiments
CANDIDATES = [
    # ── code-first ────────────────────────────────────────────────────────
    dict(repo="Qwen/Qwen2.5-Coder-1.5B",              role="code",   arch="qwen2",
         note="base (no chat template) — best for continue-pretrain on code"),
    dict(repo="Qwen/Qwen2.5-Coder-1.5B-Instruct",     role="code",   arch="qwen2",
         note="instruct; already SFT'd — start here for code+speaking"),
    dict(repo="Qwen/Qwen2.5-Coder-3B-Instruct",       role="code",   arch="qwen2",
         note="strongest code:quality-per-VRAM at QLoRA on 12GB"),
    dict(repo="Qwen/Qwen2.5-Coder-7B-Instruct",       role="code",   arch="qwen2",
         note="QLoRA only on 12GB; this is the size your 14B rounds use"),
    dict(repo="deepseek-ai/deepseek-coder-1.3b-instruct", role="code", arch="llama",
         note="2k context only — avoid for repo-scale scaffolding"),
    dict(repo="bigcode/tiny_starcoder_py",            role="code",   arch="gpt2",
         note="Python only, 164M, no chat template — tokenizer/loop smoke test"),
    # ── code + explicit reasoning ─────────────────────────────────────────
    dict(repo="Qwen/Qwen3-1.7B",                      role="reason", arch="qwen3",
         note="has a real /think mode — the cheapest honest 'little reasoning'"),
    dict(repo="Qwen/Qwen3-4B",                        role="reason", arch="qwen3",
         note="thinking mode + code, 8GB bf16; QLoRA fine on 12GB"),
    # ── speaking / general ────────────────────────────────────────────────
    dict(repo="Qwen/Qwen2.5-0.5B-Instruct",           role="speak",  arch="qwen2",
         note="0.5B — the ONLY size here that takes a full fine-tune on 12GB"),
    dict(repo="HuggingFaceTB/SmolLM2-1.7B-Instruct",  role="speak",  arch="llama",
         note="clean English, tiny vocab — good fluency base"),
    dict(repo="HuggingFaceTB/SmolLM2-360M-Instruct",  role="speak",  arch="llama",
         note="360M, full fine-tune fits; useful as a fast A/B baseline"),
    dict(repo="microsoft/Phi-3.5-mini-instruct",       role="reason", arch="phi3",
         note="3.8B, MIT, unusually strong reasoning for its size"),
    dict(repo="meta-llama/Llama-3.2-3B-Instruct",      role="speak",  arch="llama",
         note="GATED — needs an accepted license + HF token before download"),
]

# Bytes of training state per parameter, by method. Estimates, not promises:
# they exclude activations, which grow with sequence length.
BYTES_PER_PARAM = {
    "qlora4": 0.55,   # NF4 weights (0.5) + adapter/grad/optimizer shave
    "lora16": 2.35,   # fp16 weights (2.0) + adapter + grads
    "full16": 16.0,   # fp16 weights 2 + grads 2 + AdamW fp32 m/v 8 + master 4
    "full8": 6.0,     # fp16 weights 2 + grads 2 + 8-bit Adam 2
}


def fetch(model: str, timeout: int = 30) -> dict | None:
    """Return the HF model record, or None if missing/offline."""
    try:
        req = urllib.request.Request(
            HF_API.format(model=model),
            headers={"User-Agent": "vaca-pick-base/1.0", "Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError):
        return None


def download_bytes(rec: dict) -> int:
    total = 0
    for sib in rec.get("siblings") or []:
        name = (sib.get("rfilename") or "").lower()
        if name.endswith(_DROP_SUFFIXES):
            continue
        if not name.endswith(_KEEP_SUFFIXES):
            continue
        total += sib.get("size") or 0
    return total


def params_from_record(rec: dict) -> int | None:
    """Prefer exact safetensors parameter counts over filename guessing."""
    st = rec.get("safetensors") or {}
    if st.get("total"):
        return int(st["total"])
    params = st.get("parameters") or {}
    if params:
        return int(sum(params.values()))
    return None


def estimate_vram_gb(n_params: int, method: str) -> float:
    return n_params * BYTES_PER_PARAM[method] / 1e9


def classify(n_params: int, vram_gb: float) -> dict:
    """Which training methods fit in the target VRAM (with ~15% headroom)."""
    fits = {}
    for method in ("qlora4", "lora16", "full8", "full16"):
        need = estimate_vram_gb(n_params, method)
        missing = need * 1.15  # activations / fragmentation headroom
        fits[method] = missing <= vram_gb
    return fits


def main() -> int:
    ap = argparse.ArgumentParser(description="Shortlist a small open base model to train")
    ap.add_argument("--vram", type=float, default=None,
                    help="Target GPU VRAM in GB (default: detect via nvidia-smi, else 12)")
    ap.add_argument("--role", default=None,
                    help="Filter: code | reason | speak | tiny")
    ap.add_argument("--json", action="store_true", help="Emit JSON instead of a table")
    ap.add_argument("--offline-ok", action="store_true",
                    help="Exit 0 even if every HF lookup fails")
    args = ap.parse_args()

    vram = args.vram
    if vram is None:
        vram = detect_vram_gb()

    rows, failures = [], []
    for cand in CANDIDATES:
        if args.role and cand["role"] != args.role:
            continue
        rec = fetch(cand["repo"])
        if rec is None:
            failures.append(cand["repo"])
            continue
        n = params_from_record(rec)
        if not n:
            failures.append(cand["repo"])
            continue
        dl = download_bytes(rec)
        rows.append({
            **cand,
            "params_b": round(n / 1e9, 3),
            "download_gb": round(dl / 1e9, 2),
            "license": (rec.get("cardData") or {}).get("license"),
            "gated": rec.get("gated"),
            "vram": {k: round(estimate_vram_gb(n, k), 1) for k in BYTES_PER_PARAM},
            "fits": classify(n, vram),
        })

    if args.json:
        print(json.dumps({"vram_gb": vram, "rows": rows, "failed": failures}, indent=2))
        return 0 if (rows or args.offline_ok) else 1

    if not rows:
        print("❌ No candidates could be resolved from the Hugging Face API.")
        print("   Check network access to huggingface.co.")
        return 0 if args.offline_ok else 1

    print(f"\n🎯 Small open bases for a {vram:g} GB GPU  "
          f"(download = what `from_pretrained` actually fetches)\n")
    print(f"  {'model':<46} {'role':<7} {'params':>7} {'dl':>7} "
          f"{'QLoRA':>6} {'LoRA':>6} {'full8':>6} {'full16':>6}  license")
    print(f"  {'-'*46} {'-'*7} {'-'*7} {'-'*7} {'-'*6} {'-'*6} {'-'*6} {'-'*6}  {'-'*12}")
    for r in sorted(rows, key=lambda x: (x["role"], x["params_b"])):
        mark = lambda m: "  ✅ " if r["fits"][m] else "  ❌ "   # noqa: E731
        lic = r["license"] or "?"
        if r["gated"]:
            lic += " 🔒"
        print(f"  {r['repo']:<46} {r['role']:<7} {r['params_b']:>6.2f}B "
              f"{r['download_gb']:>6.2f}G"
              f"{mark('qlora4')}{mark('lora16')}{mark('full8')}{mark('full16')}"
              f"  {lic}")

    print(f"\n  columns = peak VRAM estimate for each method, must be ≤ {vram:g} GB")
    print("  ✅ fits   ❌ does not fit (activations + fragmentation roughly included)")
    print("  🔒 gated = accept the license on HF and `huggingface-cli login` first\n")
    print("  notes:")
    for r in sorted(rows, key=lambda x: (x["role"], x["params_b"])):
        print(f"    {r['repo']:<46} {r['note']}")

    if failures:
        print(f"\n  ⚠️  could not resolve: {', '.join(failures)}")
    print("\n  next: python3 training/smallbase/continue_pretrain.py "
          "--base <model> --data code=<glob> --dry-run\n")
    return 0


def detect_vram_gb() -> float:
    """GPU VRAM in GB from nvidia-smi, falling back to the project's known box."""
    import subprocess
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=10,
        )
        if out.returncode == 0:
            vals = [int(x) for x in out.stdout.split() if x.strip().isdigit()]
            if vals:
                return max(vals) / 1024
    except (FileNotFoundError, subprocess.SubprocessError, ValueError):
        pass
    return 12.0


if __name__ == "__main__":
    sys.exit(main())
