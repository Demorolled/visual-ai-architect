#!/usr/bin/env python3
"""
=============================================================================
  Export the fine-tuned Qwen2.5-VL to GGUF (+ mmproj) for serving
  ==================================================================
  Three stages, mirroring the PROVEN R20 pattern in scripts/build-r20-merged.py:

    1. merge    adapter + base  ->  a REAL 16-bit merged safetensors dir
                (unsloth_generic_save_pretrained_merged(..., "merged_16bit")).
                A 4-bit "merge" is not a merge — the result must be re-quantized.
    2. convert  merged  ->  model GGUF + mmproj GGUF via llama.cpp
                (the mmproj is the vision projector; it is a SEPARATE file)
    3. package  emit a Modelfile for Ollama and print the llama-server command

  Vision needs BOTH files at inference: the language model AND the mmproj.
  Ollama can import two FROM lines, but that path has known failures for some
  architectures — the robust option is llama-server --mmproj (an OpenAI-
  compatible /v1 endpoint, which is exactly what backend/src/ai/vision.ts calls).

  Usage:
      # just show the plan / exact commands (no GPU, no writes):
      python3 training/vlm/export_vlm_gguf.py --dry-run \
          --adapter training/vlm/out/adapter --merged-out training/vlm/out/merged

      # full run (needs GPU + disk: merged fp16 ~15.5 GB, GGUF q4 ~4.7 GB):
      python3 training/vlm/export_vlm_gguf.py \
          --adapter training/vlm/out/adapter --merged-out training/vlm/out/merged \
          --out-dir training/vlm/out/gguf --llama-cpp ~/llama.cpp --quant q4_k_m

      # validate an existing merged dir without re-merging:
      python3 training/vlm/export_vlm_gguf.py --check-merged training/vlm/out/merged
=============================================================================
"""

import argparse
import gc
import json
import shutil
import subprocess
import sys
from pathlib import Path

DEFAULT_BASE = "unsloth/Qwen2.5-VL-7B-Instruct"
MODELFILE_NAME = "Modelfile-vaca-vision"


# ─── helpers ────────────────────────────────────────────────────────────────

def free_gb(path: Path) -> float:
    u = shutil.disk_usage(path if path.exists() else path.anchor or "/")
    return u.free / 1e9


def check_disk(path: Path, need_gb: float, label: str) -> None:
    free = free_gb(path)
    if free < need_gb:
        sys.exit(
            f"❌ Only {free:.1f} GB free on {path}; {label} needs ~{need_gb:.0f} GB.\n"
            f"   Free space or point --out-dir / --merged-out at another disk."
        )
    print(f"   💽 free on {path}: {free:.1f} GB (need ~{need_gb:.0f} GB)")


def validate_merged(merged: Path) -> None:
    """The merge must be a REAL 16-bit checkpoint, not a quantized passthrough."""
    st_files = sorted(merged.glob("*.safetensors"))
    if not st_files:
        sys.exit(
            f"❌ {merged} has no *.safetensors — not a merged 16-bit model.\n"
            f"   Run the merge stage first (drop --check-merged), or fix --merged-out."
        )
    try:
        from safetensors import safe_open
    except ImportError:
        sys.exit("❌ safetensors is not installed — pip install -r "
                 "training/vlm/requirements.txt")
    total = sum(f.stat().st_size for f in st_files)
    # 7B fp16 ≈ 15.5 GB. ~4-5 GB means it stayed 4-bit.
    if total < 12e9:
        sys.exit(f"❌ merged size {total / 1e9:.1f} GB — too small for a 16-bit 7B "
                 f"merge; still quantized!")
    for f in st_files:
        with safe_open(str(f), framework="pt") as sf:
            bad = [k for k in sf.keys() if ".absmax" in k or "quant_state" in k]
            if bad:
                sys.exit(f"❌ {f.name} still contains quantized tensors: {bad[:3]}")
    cfg_path = merged / "config.json"
    if not cfg_path.exists():
        sys.exit(f"❌ {merged}/config.json is missing — not a valid merged model.")
    cfg = json.load(open(cfg_path))
    if "quantization_config" in cfg:
        sys.exit("❌ merged config.json still has quantization_config!")
    # A VL model must have kept its vision config.
    if "vision_config" not in cfg:
        print("⚠️  merged config.json has no vision_config — is this the VL model?")
    print(f"✅ merged is a real 16-bit checkpoint ({total / 1e9:.1f} GB, no quantized tensors)")


# ─── stage 1: merge ─────────────────────────────────────────────────────────

def do_merge(adapter: Path, base: str, merged: Path, max_seq: int) -> None:
    if not (adapter / "adapter_model.safetensors").exists():
        sys.exit(f"❌ no adapter_model.safetensors in {adapter}")

    cfg = json.load(open(adapter / "adapter_config.json"))
    print(f"   adapter: r={cfg.get('r')} alpha={cfg.get('lora_alpha')} "
          f"base={cfg.get('base_model_name_or_path')}")

    import torch
    from unsloth import FastVisionModel
    from unsloth.save import unsloth_generic_save_pretrained_merged

    print(f"⬇️  Loading base {base} (4-bit) for merge...")
    model, tokenizer = FastVisionModel.from_pretrained(
        model_name=base,
        max_seq_length=max_seq,
        load_in_4bit=True,
        device_map="auto",
    )
    from peft import PeftModel
    model = PeftModel.from_pretrained(model, str(adapter))

    merged.mkdir(parents=True, exist_ok=True)
    print(f"💾 Saving merged 16-bit safetensors -> {merged}")
    unsloth_generic_save_pretrained_merged(
        model, save_directory=str(merged), tokenizer=tokenizer, save_method="merged_16bit",
    )
    tokenizer.save_pretrained(str(merged))
    del model
    gc.collect()
    torch.cuda.empty_cache()


# ─── stage 2: convert ───────────────────────────────────────────────────────

def convert_commands(llama_cpp: Path, merged: Path, out_dir: Path, quant: str) -> list:
    conv = llama_cpp / "convert_hf_to_gguf.py"
    f16 = out_dir / f"{merged.name}-f16.gguf"
    quanted = out_dir / f"{merged.name}-{quant.upper()}.gguf"
    quanter = llama_cpp / "build" / "bin" / "llama-quantize"
    return [
        [sys.executable, str(conv), str(merged), "--outfile", str(f16), "--outtype", "f16"],
        [str(quanter), str(f16), str(quanted), quant.upper()],
    ]


def do_convert(llama_cpp: Path, merged: Path, out_dir: Path, quant: str) -> list:
    conv = llama_cpp / "convert_hf_to_gguf.py"
    if not conv.exists():
        sys.exit(f"❌ {conv} not found. Clone/build llama.cpp and pass --llama-cpp.")
    out_dir.mkdir(parents=True, exist_ok=True)
    for cmd in convert_commands(llama_cpp, merged, out_dir, quant):
        print("▶ " + " ".join(cmd))
        r = subprocess.run(cmd)
        if r.returncode != 0:
            sys.exit(f"❌ command failed ({r.returncode})")
    # llama.cpp writes the vision projector as mmproj-*.gguf next to the output.
    mmproj = sorted(merged.parent.glob("mmproj*.gguf")) + sorted(out_dir.glob("mmproj*.gguf"))
    if not mmproj:
        print("⚠️  No mmproj*.gguf found. The vision projector was NOT exported — "
              "check that convert_hf_to_gguf.py supports this model and that "
              "vision_config is present in the merged config.")
    return mmproj


def write_modelfile(out_dir: Path, model_gguf: Path, mmproj: Path | None) -> Path:
    lines = [
        "# Modelfile-vaca-vision — serve fine-tuned Qwen2.5-VL through Ollama.",
        "#   ollama create vaca-vision-r3 -f <this file>",
        "#",
        f"FROM {model_gguf.name}",
    ]
    if mmproj:
        lines.append(f"FROM {mmproj.name}")
    lines += ["PARAMETER num_ctx 16384", "PARAMETER temperature 0.7", "PARAMETER top_p 0.8", ""]
    mf = out_dir / MODELFILE_NAME
    mf.write_text("\n".join(lines), encoding="utf-8")
    return mf


# ─── main ───────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description="Merge + export Qwen2.5-VL to GGUF.")
    ap.add_argument("--adapter", type=Path, help="LoRA adapter dir to merge")
    ap.add_argument("--base", default=DEFAULT_BASE, help="HF base model id or path")
    ap.add_argument("--merged-out", type=Path, default=Path("training/vlm/out/merged"))
    ap.add_argument("--out-dir", type=Path, default=Path("training/vlm/out/gguf"))
    ap.add_argument("--llama-cpp", type=Path, default=Path("~/llama.cpp").expanduser())
    ap.add_argument("--quant", default="q4_k_m")
    ap.add_argument("--max-seq-length", type=int, default=2048)
    ap.add_argument("--check-merged", type=Path, default=None,
                    help="validate an existing merged dir and exit")
    ap.add_argument("--skip-merge", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    out_dir = args.out_dir
    merged = args.merged_out
    model_gguf = merged.parent / f"{merged.name}-{args.quant.upper()}.gguf"

    if args.check_merged:
        validate_merged(args.check_merged)
        return

    if not args.adapter and not args.skip_merge:
        sys.exit("❌ pass --adapter <adapter dir> (or --skip-merge / --check-merged).")

    print("📋 VLM GGUF export plan")
    print(f"   stage 1 merge   : {args.adapter} + {args.base} -> {merged}")
    print(f"   stage 2 convert : llama.cpp @ {args.llama_cpp} -> {out_dir} ({args.quant})")
    print(f"   stage 3 package : {out_dir / MODELFILE_NAME} (+ mmproj)")

    if args.dry_run:
        check_disk(merged.parent, 16, "stage 1 merge (fp16 7B)")
        check_disk(out_dir, 8, "stage 2 convert (f16 + quant)")
        print("\n   exact commands that WOULD run:")
        if not args.skip_merge:
            print("     [python] FastVisionModel.from_pretrained(base) + PeftModel(...) "
                  '+ unsloth_generic_save_pretrained_merged("merged_16bit")')
        for cmd in convert_commands(args.llama_cpp, merged, out_dir, args.quant):
            print("     " + " ".join(cmd))
        print(f"     [write] {out_dir / MODELFILE_NAME}  (FROM model + FROM mmproj)")
        print("\n   serve (robust path):")
        print(f"     {args.llama_cpp}/build/bin/llama-server -m <model>.gguf "
              f"--mmproj <mmproj>.gguf --host 0.0.0.0 --port 8000")
        print("🔎 --dry-run: nothing written.")
        return

    if not args.skip_merge:
        check_disk(merged.parent, 16, "stage 1 merge (fp16 7B)")
        do_merge(args.adapter, args.base, merged, args.max_seq_length)
    validate_merged(merged)
    check_disk(out_dir, 8, "stage 2 convert (f16 + quant)")

    mmproj_list = do_convert(args.llama_cpp, merged, out_dir, args.quant)
    model_gguf = out_dir / f"{merged.name}-{args.quant.upper()}.gguf"
    mf = write_modelfile(out_dir, model_gguf, mmproj_list[0] if mmproj_list else None)

    print(f"\n✅ exported: {model_gguf}")
    if mmproj_list:
        print(f"   mmproj  : {mmproj_list[0]}")
    else:
        print("   ⚠️  no mmproj — vision will not work until one is produced.")
    print(f"   modelfile: {mf}")
    print("\n   Serve (robust):  llama-server -m <model>.gguf --mmproj <mmproj>.gguf "
          "--host 0.0.0.0 --port 8000")
    print("   Then point backend/src/ai/vision.ts at that base URL (model 'vaca-vision-r3').")


if __name__ == "__main__":
    main()
