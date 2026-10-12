#!/usr/bin/env python3
"""negate.py — train the forget task vector, then subtract it.

Two steps:

  1. `train`  fine-tune a LoRA on the FORGET set. The model gets BETTER at the
              domain you want gone. That adapter IS the task vector τ.
  2. `negate` write a copy of the adapter with its `lora_B` matrices scaled by
              −λ. Deployed on the base model that yields

                  W' = W − λ·τ

              i.e. the learned direction is subtracted.

              λ = 0   lora_B is zeroed, so W' = W — the BASE model exactly.
                      This is the control arm: the baseline the sweep is
                      measured against.
              λ = 1   subtracts exactly the vector that was trained.
              λ > 1   over-subtracts (more removal, more collateral).
              λ = -1  applies the adapter as trained (the fine-tune itself).
                      Reachable on purpose: it is the upper bound of how much
                      the model can know about the forgotten domain.

Why negate `lora_B` and not `lora_A`? Either works algebraically (BA is the
outer product), but B is the up-projection, so scaling it keeps A's basis
untouched and makes the sign flip obvious when reading the adapter.

This step needs NO GPU and no base model: it is pure tensor arithmetic on a
few megabytes of adapter weights, so it is safe to run anywhere.

Caveat, stated because it matters: if the adapter was trained with DoRA
(`lora_magnitude_vector`) or has `modules_to_save` weights, negating B alone is
not the whole task vector. Both cases are detected and reported rather than
silently half-applied.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LAMS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5]
SI_RESULT = "adapter_model.safetensors"
BIN_RESULT = "adapter_model.bin"


# ── adapter io ───────────────────────────────────────────────────────────────
def adapter_file(d: Path) -> Path | None:
    for name in (SI_RESULT, BIN_RESULT):
        p = d / name
        if p.exists():
            return p
    return None


def resolve_adapter(src: Path) -> Path:
    """Find where the adapter actually landed.

    `train` hands the trainer `<out>/forget-lora`, but train_student.py saves
    the real thing one level deeper in `final/` (with `checkpoint-N/` rotations
    beside it). Looking only at the top level made a plain `train` -> `negate`
    sequence fail with "no adapter", so resolve it instead of moving it.
    """
    if adapter_file(src):
        return src
    final = src / "final"
    if adapter_file(final):
        return final
    cks = [p for p in src.glob("checkpoint-*") if adapter_file(p)] if src.is_dir() else []
    if cks:
        cks.sort(key=lambda p: int(p.name.split("-")[-1]))
        return cks[-1]
    return src


def load_adapter(d: Path) -> tuple[dict, str]:
    """Return (state_dict, format). Prefers safetensors, falls back to torch .bin."""
    p = adapter_file(d)
    if not p:
        raise SystemExit(f"no adapter_model.safetensors/.bin in {d}")
    if p.name == SI_RESULT:
        try:
            from safetensors.torch import load_file
            return load_file(str(p)), "safetensors"
        except ImportError:
            venv = ROOT / "llm-training-app" / ".venv" / "bin" / "python"
            raise SystemExit(
                "reading a .safetensors adapter needs the `safetensors` package, "
                "which the training venv has and the system python3 does not.\n"
                f"Re-run this step with:\n  {venv} -m training.unlearn negate ...")
    import torch
    return torch.load(str(p), map_location="cpu"), "torch"


def save_adapter(state: dict, d: Path, fmt: str) -> None:
    d.mkdir(parents=True, exist_ok=True)
    if fmt == "safetensors":
        from safetensors.torch import save_file
        save_file(state, str(d / SI_RESULT))
    else:
        import torch
        torch.save(state, str(d / BIN_RESULT))


def audit(state: dict) -> dict:
    """Report adapter features that break the simple B-negation assumption."""
    keys = list(state.keys())
    return {
        "tensors": len(keys),
        "lora_B": sum(1 for k in keys if "lora_B" in k),
        "lora_A": sum(1 for k in keys if "lora_A" in k),
        "dora_magnitude": sum(1 for k in keys if "lora_magnitude_vector" in k),
        "modules_to_save": sum(1 for k in keys if "modules_to_save" in k),
        "other": sum(1 for k in keys
                     if "lora_A" not in k and "lora_B" not in k
                     and "lora_magnitude_vector" not in k and "modules_to_save" not in k),
    }


# ── the negation itself ──────────────────────────────────────────────────────
def negate_tensors(state: dict, lam: float) -> tuple[dict, dict]:
    """Return (new_state, stats) with lora_B scaled by -lam.

    Scaling is applied uniformly, including λ=0: multiplying B by −0 zeroes
    the adapter so W' collapses to W, which makes λ=0 the honest baseline for
    the sweep rather than a second copy of the fine-tune.
    """
    out, scaled, touched_rows = {}, 0, 0
    for k, v in state.items():
        if "lora_B" in k:
            out[k] = v * (-lam)
            scaled += 1
            touched_rows += int(v.numel())
        else:
            out[k] = v
    return out, {"lora_B_scaled": scaled, "params_scaled": touched_rows}


def negate(src: Path, dst_root: Path, lams: list[float]) -> dict:
    src = resolve_adapter(src)
    state, fmt = load_adapter(src)
    info = audit(state)

    warnings = []
    if info["dora_magnitude"]:
        warnings.append("adapter uses DoRA (lora_magnitude_vector): negating lora_B "
                        "does not fully subtract the task vector — retrain without DoRA")
    if info["modules_to_save"]:
        warnings.append("adapter has modules_to_save weights: those are left untouched, "
                        "so the subtraction is partial")
    if info["lora_B"] == 0:
        warnings.append("no lora_B tensors found — is this really a LoRA adapter?")
    if fmt == "torch":
        warnings.append("source adapter is torch .bin; negated copies are written as "
                        ".bin too")

    results = []
    for lam in lams:
        new_state, stats = negate_tensors(state, lam)
        dst = dst_root / f"lambda-{lam:g}"
        save_adapter(new_state, dst, fmt)
        cfg = src / "adapter_config.json"
        if cfg.exists():
            shutil.copy2(cfg, dst / "adapter_config.json")
        results.append({"lambda": lam, "dir": str(dst), **stats})
    return {"source": str(src), "audit": info, "warnings": warnings, "variants": results}


# ── training the forget adapter ──────────────────────────────────────────────
def train_cmd(base: str, data: Path, out: Path, seq: int, epochs: float,
              lr: float, grad_accum: int, val: Path | None = None,
              card_gb: float = 10.5) -> list[str]:
    """Reuse the student's QLoRA trainer — no second implementation to drift.

    `val` is left out on purpose when there is no separate split: train_student
    then carves its own 5% off the training rows. Passing the forget file as its
    own validation set (the earlier behaviour) made val loss meaningless.
    """
    py = ROOT / "llm-training-app" / ".venv" / "bin" / "python"
    trainer = ROOT / "training" / "selfplay" / "train_student.py"
    cmd = [str(py), str(trainer), "--data", str(data), "--out", str(out),
           "--base", base, "--seq", str(seq), "--epochs", str(epochs),
           "--lr", str(lr), "--grad-accum", str(grad_accum),
           # The trainer's default budget assumes 2×12GB. On a single card the
           # same total must fit in one, or accelerate silently offloads layers.
           "--card-gb", str(card_gb)]
    if val is not None:
        cmd += ["--val", str(val)]
    return cmd


def self_test() -> int:
    """Prove the negation identity numerically, independent of LoRA scaling.

    Invariant under test:
        W' = W + s·(B·(-λ))A  ==  W - λ·(W_pos - W)
    where W_pos = W + s·BA is the adapter as trained. It must hold for ANY
    scaling s (PEFT's alpha/r, rsLoRA's alpha/sqrt(r), anything), because we
    only touch B.
    """
    import torch
    torch.manual_seed(0)
    r, din, dout = 4, 8, 6
    A = torch.randn(r, din)
    B = torch.randn(dout, r) * 0.1     # PEFT inits B to zeros; non-zero here to bite
    W = torch.randn(dout, din)
    fails = []

    for s in (1.0, 2.0, 2.8284):        # alpha/r and rsLoRA-style scalings
        tau = s * (B @ A)
        # (1) The identity: negating lora_B by -λ must land exactly λ task
        #     vectors *below* the base weights. This is the whole method, and
        #     it must hold for every scaling because we never touch A or alpha.
        for lam in (0.0, 0.25, 1.0, 1.5):
            W_neg = W + s * ((B * (-lam)) @ A)
            if not torch.allclose(W_neg, W - lam * tau, atol=1e-5):
                fails.append(f"identity s={s} lam={lam}")
        # (2) Composition: applying the trained adapter and then the λ=1
        #     negated adapter must cancel back to the base weights exactly.
        #     This is what "removes the task vector" actually means.
        composed = (W + s * (B @ A)) + s * ((B * -1.0) @ A)
        if not torch.allclose(composed, W, atol=1e-5):
            fails.append(f"cancel s={s}")

    # Round-trip through the on-disk path with a synthetic .bin adapter.
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        src = Path(td) / "src"
        src.mkdir()
        state = {"base_model.model.layers.0.q_proj.lora_A.weight": A,
                 "base_model.model.layers.0.q_proj.lora_B.weight": B,
                 "base_model.model.layers.0.q_proj.base_layer.weight": W}
        (src / "adapter_config.json").write_text('{"r": 4, "lora_alpha": 8}')
        torch.save(state, src / BIN_RESULT)
        rep = negate(src, Path(td) / "out", [0.0, 1.0])
        if len(rep["variants"]) != 2:
            fails.append("negate() did not write both lambda variants")
        back, _ = load_adapter(Path(td) / "out" / "lambda-1")
        got = back["base_model.model.layers.0.q_proj.lora_B.weight"]
        if not torch.allclose(got, -B, atol=1e-6):
            fails.append("round-trip: lora_B was not negated on disk")
        # λ=0 must zero B (the base-model baseline), not copy the fine-tune.
        zero, _ = load_adapter(Path(td) / "out" / "lambda-0")
        zb = zero["base_model.model.layers.0.q_proj.lora_B.weight"]
        if not torch.count_nonzero(zb) == 0:
            fails.append("lambda=0 did not zero lora_B (baseline would be wrong)")
        if not torch.allclose(back["base_model.model.layers.0.q_proj.base_layer.weight"], W):
            fails.append("round-trip: a non-lora_B tensor was modified")

    if fails:
        print("self-test FAILED: " + "; ".join(fails))
        return 1
    print("self-test OK — W − λ·τ identity holds for every scaling; the λ=1 "
          "adapter cancels the trained one exactly; λ=0 zeroes B so the base "
          "model is the baseline; the disk round-trip leaves non-lora_B "
          "tensors untouched")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Negate a forget task vector")
    ap.add_argument("--src", type=Path, help="trained forget adapter dir")
    ap.add_argument("--out", type=Path,
                    default=ROOT / "training" / "unlearn" / "adapters")
    ap.add_argument("--lams", default=",".join(str(x) for x in DEFAULT_LAMS))
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--train", action="store_true",
                    help="train the forget adapter first")
    ap.add_argument("--data", type=Path,
                    default=ROOT / "training" / "unlearn" / "data" / "forget.jsonl")
    ap.add_argument("--base", default="BlossomsAI/Qwen2.5-Coder-14B-Instruct-Uncensored")
    ap.add_argument("--seq", type=int, default=1024)
    ap.add_argument("--epochs", type=float, default=1)
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--grad-accum", type=int, default=4)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    src = args.src or (args.out / "forget-lora")

    if args.train:
        cmd = train_cmd(args.base, args.data, src, args.seq, args.epochs,
                        args.lr, args.grad_accum)
        print("$ " + " ".join(cmd))
        if not args.dry_run:
            rc = subprocess.call(cmd)
            if rc != 0:
                raise SystemExit(f"forget-adapter training failed (exit {rc})")

    lams = [float(x) for x in args.lams.split(",") if x.strip()]
    if args.dry_run:
        print(f"[dry-run] would negate {src} into {args.out}/lambda-* for {lams}")
        return 0
    if not adapter_file(resolve_adapter(src)):
        raise SystemExit(
            f"no adapter_model.safetensors/.bin under {src} (checked the dir, "
            f"{src}/final and {src}/checkpoint-*) — run with --train first, or "
            f"pass --src")
    rep = negate(src, args.out, lams)
    print(json.dumps(rep, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
