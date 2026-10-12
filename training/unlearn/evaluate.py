#!/usr/bin/env python3
"""evaluate.py — measure what each λ actually removed, and what it cost.

Perplexity is used, but only over the COMPLETION tokens (the answer), given the
instruction as context. Measuring the whole sequence would mostly score the
question, which nobody wanted removed.

Two numbers per λ:

  forget Δ%  how much worse the model got at the domain we wanted gone.
             BIGGER is the goal. A rising perplexity means the model can no
             longer predict those answers.
  retain Δ%  how much worse it got at what must be preserved (VACA + code).
             Ideally ~0. This is the guardrail against buying the first number
             with brain damage.

A λ only counts as a candidate if it keeps retain damage under
`--max-retain-delta` (default 5%). Among those, the largest forget gain wins.
Reporting the best-forget λ even when it wrecks retain would be dishonest, so
the verdict is constrained and the rejected arms are still shown.

Runtime note: this loads the full base model, so it needs transformers + peft +
torch (the `llm-training-app` venv) and a GPU for anything 7B+. Use
`--retain-limit` to keep the retain pass affordable; a few hundred rows is
plenty to detect damage.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA = ROOT / "training" / "unlearn" / "data"
DEFAULT_ADAPTERS = ROOT / "training" / "unlearn" / "adapters"
DEFAULT_BASE = "BlossomsAI/Qwen2.5-Coder-14B-Instruct-Uncensored"
DEFAULT_MAX_RETAIN_DELTA = 5.0


def _read_jsonl(p: Path) -> list:
    out = []
    if not p.exists():
        return out
    with p.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return out


def require_stack() -> None:
    missing = []
    try:
        import torch  # noqa: F401
    except Exception:
        missing.append("torch")
    for m in ("transformers", "peft"):
        try:
            __import__(m)
        except Exception:
            missing.append(m)
    if missing:
        raise SystemExit(
            "missing " + ", ".join(missing) + ".\n"
            "Evaluation needs the training stack. Use the training interpreter:\n"
            f"  {ROOT}/llm-training-app/.venv/bin/python -m training.unlearn.evaluate ...\n"
            "(the system python3 has torch but not transformers/peft)")


def load_model(base: str, adapter: Path | None, load_4bit: bool = True):
    """Load base (optionally 4-bit) and attach the adapter if given."""
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    tok = AutoTokenizer.from_pretrained(base)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token

    kwargs = {"device_map": "auto", "torch_dtype": torch.float16}
    # Pin a per-card budget so `auto` can never decide a layer belongs on the CPU.
    # Without this, `auto` sizes its plan from the VRAM free at that instant, and
    # a reload after some load/unload churn sees less of it and dispatches a layer
    # to the CPU — which transformers refuses for a 4-bit model.
    n_gpu = torch.cuda.device_count()
    if n_gpu:
        kwargs["max_memory"] = {i: "10GiB" for i in range(n_gpu)}
    if load_4bit:
        try:
            from transformers import BitsAndBytesConfig
            kwargs["quantization_config"] = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_use_double_quant=True,
                bnb_4bit_compute_dtype=torch.float16,
            )
        except Exception:
            pass                      # fall back to fp16 if bnb is unavailable

    model = AutoModelForCausalLM.from_pretrained(base, **kwargs)
    if adapter is not None:
        from peft import PeftModel
        model = PeftModel.from_pretrained(model, str(adapter))
    model.eval()
    return model, tok


def prompt_ids(tok, instruction: str) -> list[int]:
    """Token ids for a chat-formatted user turn.

    The bug this guards: `apply_chat_template(..., tokenize=True)` does not
    return token ids in every transformers version — 5.x returns the rendered
    TEXT. `list()` of that is a list of single characters, so the ids became
    strings and `torch.tensor` raised "too many dimensions 'str'", silently
    skipping every row in the sweep (all arms scored 0 rows). Normalise all
    four shapes it can hand back: str, BatchEncoding, tensor, list.
    """
    if getattr(tok, "chat_template", None):
        out = tok.apply_chat_template([{"role": "user", "content": instruction}],
                                      tokenize=True, add_generation_prompt=True)
        if isinstance(out, str):
            return tok(out, add_special_tokens=False).input_ids
        if hasattr(out, "input_ids"):
            inner = out.input_ids
            return list(inner[0]) if inner and isinstance(inner[0], list) else list(inner)
        if hasattr(out, "tolist"):
            flat = out.tolist()
            return flat[0] if flat and isinstance(flat[0], list) else flat
        return list(out)
    return tok(instruction, add_special_tokens=True).input_ids


def completion_nll(model, tok, instruction: str, output: str, max_len: int) -> float | None:
    """Mean negative log-likelihood over the answer tokens only."""
    import torch

    if not output.strip():
        return None
    prompt_ids_ = prompt_ids(tok, instruction)

    target_ids = tok(output, add_special_tokens=False).input_ids
    ids = (list(prompt_ids_) + list(target_ids) + [tok.eos_token_id])[:max_len]
    n_prompt = min(len(prompt_ids_), len(ids))
    if len(ids) - n_prompt < 1:
        return None

    with torch.no_grad():
        t = torch.tensor([ids], device=model.device)
        logits = model(t).logits[:, :-1, :].float()
        labels = t[:, 1:]
        losses = torch.nn.functional.cross_entropy(
            logits.reshape(-1, logits.size(-1)), labels.reshape(-1), reduction="none")
    # Index i of `losses` predicts ids[i+1]; answer tokens start at n_prompt-1.
    start = max(n_prompt - 1, 0)
    ans = losses[start:]
    if ans.numel() == 0:
        return None
    return float(ans.mean().item())


def score_set(model, tok, rows: list, max_len: int, label: str = "") -> dict:
    nlls, skipped = [], 0
    for i, r in enumerate(rows, 1):
        try:
            v = completion_nll(model, tok, r.get("instruction", ""), r.get("output", ""), max_len)
        except Exception:
            v = None
        if v is None:
            skipped += 1
        else:
            nlls.append(v)
        if label and (i % 25 == 0 or i == len(rows)):
            print(f"  [{label}] {i}/{len(rows)}")
    if not nlls:
        return {"rows": 0, "skipped": skipped, "nll": None, "ppl": None}
    mean = sum(nlls) / len(nlls)
    return {"rows": len(nlls), "skipped": skipped, "nll": round(mean, 4),
            "ppl": round(math.exp(min(mean, 50)), 2)}     # exp() guard: huge NLL overflow


def delta_pct(base_v, new_v) -> float | None:
    """Perplexity change vs baseline, as a percentage."""
    if base_v in (None, 0) or new_v is None:
        return None
    return round(100.0 * (new_v - base_v) / base_v, 1)


def _score_arm(label: str, adapter: Path | None, model, tok, forget: list,
               retain: list, max_len: int) -> dict:
    f = score_set(model, tok, forget, max_len, f"{label} forget")
    r = score_set(model, tok, retain, max_len, f"{label} retain")
    return {"label": label, "adapter": str(adapter) if adapter else None,
            "forget": f, "retain": r}


def evaluate(base: str, variants: list[tuple[str, Path]], forget: list, retain: list,
             max_len: int, load_4bit: bool = True) -> list:
    """Score every arm off ONE base load, swapping adapters in place.

    Reloading per arm was not merely slow (six 14B loads) — it was unreliable.
    `device_map="auto"` sizes its plan from the VRAM free at that moment, so
    after a few load/unload cycles it decided a layer belonged on the CPU, and
    transformers refuses a 4-bit model with CPU-dispatched modules ("Some
    modules are dispatched on the CPU or the disk"). The sweep died part-way
    with no report written. A single load removes that failure mode.
    """
    results = []
    model, tok = load_model(base, None, load_4bit)

    print("scoring base (λ=0 control)…")
    results.append(_score_arm("base (λ=0 control)", None, model, tok,
                              forget, retain, max_len))

    peft_model = None
    for i, (label, path) in enumerate(variants):
        # Adapter names become torch module names, which reject "." and "λ", so
        # the human label cannot be one. Index them instead.
        name = f"arm{i}"
        if peft_model is None:
            from peft import PeftModel
            peft_model = PeftModel.from_pretrained(model, str(path), adapter_name=name)
            peft_model.eval()
        else:
            peft_model.load_adapter(str(path), adapter_name=name)
        peft_model.set_adapter(name)
        print(f"scoring {label}…")
        results.append(_score_arm(label, path, peft_model, tok, forget, retain, max_len))
        if i:                     # drop the arm we just left; only lora_B differs anyway
            try:
                peft_model.delete_adapter(f"arm{i - 1}")
            except Exception:
                pass

    del model, peft_model
    try:
        import torch
        torch.cuda.empty_cache()
    except Exception:
        pass

    # Everything is expressed relative to the true baseline (λ=0 = no adapter).
    base_f = results[0]["forget"]["ppl"]
    base_r = results[0]["retain"]["ppl"]
    for row in results:
        row["forget_delta_pct"] = delta_pct(base_f, row["forget"]["ppl"])
        row["retain_delta_pct"] = delta_pct(base_r, row["retain"]["ppl"])
    return results


def verdict(results: list, max_retain_delta: float) -> dict:
    """Best forget gain that stays inside the retain budget."""
    eligible, rejected = [], []
    for row in results[1:]:                       # skip the baseline
        rd, fd = row.get("retain_delta_pct"), row.get("forget_delta_pct")
        if rd is None or fd is None:
            rejected.append({"label": row["label"], "why": "unscorable"})
        elif rd > max_retain_delta:
            rejected.append({"label": row["label"],
                             "why": f"retain damage {rd}% > {max_retain_delta}%"})
        else:
            eligible.append(row)
    if not eligible:
        return {"winner": None, "why": "no λ kept retain damage within budget",
                "rejected": rejected}
    win = max(eligible, key=lambda r: r["forget_delta_pct"])
    return {
        "winner": win["label"],
        "adapter": win["adapter"],
        "forget_gain_pct": win["forget_delta_pct"],
        "retain_cost_pct": win["retain_delta_pct"],
        "candidates": [{"label": r["label"], "forget_delta_pct": r["forget_delta_pct"],
                        "retain_delta_pct": r["retain_delta_pct"]} for r in eligible],
        "rejected": rejected,
    }


def write_report(results: list, verdict_: dict, out: Path, meta: dict) -> None:
    # mkdir the output dir itself. Creating only its parent (an easy slip) works
    # when `negate` already made the directory and fails on a standalone run.
    out.mkdir(parents=True, exist_ok=True)
    lines = ["# Unlearning sweep", "",
             f"- base model: `{meta['base']}`",
             f"- forget rows scored: {meta['forget_rows']}",
             f"- retain rows scored: {meta['retain_rows']}",
             f"- retain budget: {meta['max_retain_delta']}%", "",
             "| arm | forget ppl | forget Δ | retain ppl | retain Δ | verdict |",
             "|---|---|---|---|---|---|"]
    for i, r in enumerate(results):
        fd = r.get("forget_delta_pct")
        rd = r.get("retain_delta_pct")
        v = "baseline" if i == 0 else (
            "✅ candidate" if (rd is not None and rd <= meta["max_retain_delta"])
            else "❌ over budget")
        lines.append(f"| {r['label']} | {r['forget']['ppl']} | "
                     f"{fd if fd is None else f'+{fd}%'} | {r['retain']['ppl']} | "
                     f"{rd if rd is None else f'{rd:+}%'} | {v} |")
    w = verdict_.get("winner")
    lines += ["", "## Verdict", ""]
    if w:
        lines.append(f"**{w}** — forget improved {verdict_['forget_gain_pct']:+}% "
                     f"for {verdict_['retain_cost_pct']:+}% retain damage.")
        lines.append(f"\nAdapter: `{verdict_['adapter']}`")
    else:
        lines.append(f"**No usable λ.** {verdict_['why']}")
    if verdict_.get("rejected"):
        lines += ["", "Rejected arms:"]
        lines += [f"- `{r['label']}` — {r['why']}" for r in verdict_["rejected"]]
    lines += ["", "> A rising forget perplexity is the *only* thing being asked for here. "
                  "Confirm it by reading a few generations before deploying: a model can "
                  "also lose an answer by becoming incoherent, and retain Δ is what "
                  "separates the two."]
    (out / "sweep.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (out / "sweep.json").write_text(
        json.dumps({"meta": meta, "results": results, "verdict": verdict_}, indent=2),
        encoding="utf-8")


def run(base: str = DEFAULT_BASE, data: Path = DEFAULT_DATA,
        adapters: Path = DEFAULT_ADAPTERS, out: Path = DEFAULT_ADAPTERS,
        lams: str = "0.25,0.5,0.75,1.0,1.25", max_len: int = 1024,
        max_retain_delta: float = DEFAULT_MAX_RETAIN_DELTA,
        load_4bit: bool = True, dry_run: bool = False) -> int:
    """The sweep, callable from the package CLI without re-parsing argv."""
    if dry_run:
        found = sorted(p for p in adapters.glob("lambda-*"))
        print("[dry-run] unlearning sweep plan")
        print(f"  base model    : {base}")
        print(f"  forget set    : {data / 'forget.jsonl'}")
        print(f"  retain set    : {data / 'retain.jsonl'}")
        print(f"  arms to score : 1 baseline + {len(found)} λ variants")
        for v in found:
            print(f"    - {v.name}")
        print(f"  retain budget : {max_retain_delta}%")
        print(f"  report        : {out}/sweep.{{md,json}}")
        if not found:
            print("  ! no lambda-* adapters found yet — run `negate` first")
        return 0

    require_stack()
    forget = [r for r in _read_jsonl(data / "forget.jsonl")
              if (r.get("output") or "").strip()]
    retain = _read_jsonl(data / "retain.jsonl")
    if not forget:
        raise SystemExit("forget.jsonl has no answers — build it with "
                         "--forget-source=harvest or --forget-file first")
    if not retain:
        raise SystemExit("retain.jsonl is empty — without it, damage is unmeasurable")

    variants = []
    for lam in [x for x in lams.split(",") if x.strip()]:
        d = adapters / f"lambda-{float(lam):g}"
        if d.exists():
            variants.append((f"λ={float(lam):g}", d))
        else:
            print(f"  ! skipping λ={lam}: {d} not found")
    if not variants:
        raise SystemExit("no lambda-* adapters to evaluate")

    results = evaluate(base, variants, forget, retain, max_len, load_4bit=load_4bit)
    v = verdict(results, max_retain_delta)
    meta = {"base": base, "forget_rows": len(forget),
            "retain_rows": len(retain), "max_retain_delta": max_retain_delta}
    write_report(results, v, out, meta)

    print(f"\n{'arm':14s} {'forget ppl':>10s} {'forget Δ':>9s} {'retain ppl':>10s} {'retain Δ':>9s}")
    for r in results:
        print(f"{r['label']:14s} {str(r['forget']['ppl']):>10s} "
              f"{str(r.get('forget_delta_pct')):>9s} {str(r['retain']['ppl']):>10s} "
              f"{str(r.get('retain_delta_pct')):>9s}")
    print(f"\nverdict: {v.get('winner') or v.get('why')}")
    print(f"report -> {out}/sweep.md")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Evaluate the unlearning λ sweep")
    ap.add_argument("--base", default=DEFAULT_BASE)
    ap.add_argument("--data", type=Path, default=DEFAULT_DATA)
    ap.add_argument("--adapters", type=Path, default=DEFAULT_ADAPTERS)
    ap.add_argument("--out", type=Path, default=DEFAULT_ADAPTERS)
    ap.add_argument("--lams", default="0.25,0.5,0.75,1.0,1.25",
                    help="which λ arms to score (must exist on disk)")
    ap.add_argument("--max-len", type=int, default=1024)
    ap.add_argument("--max-retain-delta", type=float, default=DEFAULT_MAX_RETAIN_DELTA)
    ap.add_argument("--no-4bit", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    return run(args.base, args.data, args.adapters, args.out, args.lams,
               args.max_len, args.max_retain_delta, not args.no_4bit, args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
