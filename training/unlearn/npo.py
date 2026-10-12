#!/usr/bin/env python3
"""npo.py — NPO unlearning with a retain KL term (stronger than task-vector negation).

Task-vector negation subtracts a direction and stops there. It is cheap and
surgical, but it cannot push past what the forget adapter represented, and it
has no notion of "stay close to the original on everything else".

NPO (Negative Preference Optimization) trains the removal directly:

    L_NPO = -(2/β) · log σ( β · ( log π_ref(y|x) - log π_θ(y|x) ) )

Treating the forget response as a *rejected* sample in DPO terms. Why not plain
gradient ascent? Because GA pushes with constant force forever and the model
collapses into incoherence. NPO's logistic term saturates: once π_θ is far below
π_ref the gradient fades, so it stops before the model is destroyed.

The gradient with respect to the forget response's log-probability is

    dL / d log π_θ = 2·σ( -β·(log π_ref - log π_θ) )

which is exactly where β does its job:

    β → 0    the sigmoid is 1 everywhere, giving a constant push identical to
             gradient ascent (2·σ(0) = 1) — unlearns hard, collapses easily.
    β → ∞    the sigmoid dies as soon as θ drops below the reference, so the
             update stops early — safer, weaker.
    At a fixed gap, the gradient shrinks monotonically as β grows.

Measured, not assumed: `--self-test` pins all three of those limits numerically.

A retain KL term keeps everything else pinned:

    L = L_NPO(forget) + λ_retain · KL( π_θ(·|x_r) ‖ π_ref(·|x_r) )

The reference model is the *same* base with the LoRA adapter disabled
(PEFT's `disable_adapter()`), so this needs one model in memory, not two —
which matters a lot on a 12 GB card.

The loss maths is pure tensor work and is unit-tested by `--self-test`
(numeric gradient sign, the β→∞ gradient-ascent limit, and KL being zero with
zero gradient at π_θ = π_ref). The training loop needs the full stack plus a
base model, so it belongs on the agent box.

    python3 -m training.unlearn npo --self-test
    python3 -m training.unlearn npo --dry-run
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA = ROOT / "training" / "unlearn" / "data"
DEFAULT_OUT = ROOT / "training" / "unlearn" / "adapters" / "npo-lora"


# ── loss maths (pure; no model needed) ───────────────────────────────────────
def npo_loss(logp_theta, logp_ref, beta: float = 0.5):
    """Per-sample NPO loss from sequence log-probabilities.

    logp_theta / logp_ref are sums of token log-probs for the FORGET response.
    Positive gradient w.r.t. logp_theta is the whole point: gradient descent
    then pushes the forget response's probability DOWN.
    """
    import torch
    gap = logp_ref - logp_theta                       # >0 once θ knows it less
    return -(2.0 / beta) * torch.nn.functional.logsigmoid(beta * gap)


def retain_kl(logits_theta, logits_ref, chunk: int = 64):
    """KL(π_θ ‖ π_ref) over next-token distributions, mean over positions.

    Chunked over positions because a full (T × vocab) float32 tensor for a
    150k-vocab model is hundreds of MB.
    """
    import torch
    import torch.nn.functional as F
    total, n = 0.0, 0
    for i in range(0, logits_theta.size(1), chunk):
        lt = logits_theta[:, i:i + chunk].float()
        lr = logits_ref[:, i:i + chunk].float()
        logp_t = F.log_softmax(lt, dim=-1)
        logp_r = F.log_softmax(lr, dim=-1)
        # KL(P‖Q) = Σ P (logP - logQ); P is detached, we only differentiate Q.
        kl = (logp_t.exp() * (logp_t - logp_r)).sum(-1)
        total = total + kl.sum()
        n += kl.numel()
    return total / max(n, 1)


def total_loss(logp_theta, logp_ref, kl, beta: float = 0.5, kl_weight: float = 1.0):
    return npo_loss(logp_theta, logp_ref, beta).mean() + kl_weight * kl


# ── model-side helpers ───────────────────────────────────────────────────────
def seq_logprob(model, ids, n_prompt: int):
    """Sum of log P(response tokens | prompt) for each row of a batch."""
    import torch
    import torch.nn.functional as F
    logits = model(ids).logits[:, :-1].float()
    labels = ids[:, 1:]
    lp = F.log_softmax(logits, dim=-1).gather(-1, labels.unsqueeze(-1)).squeeze(-1)
    start = max(n_prompt - 1, 0)
    return lp[:, start:].sum(-1)


def encode(tok, instruction: str, output: str, max_len: int):
    import torch
    from .evaluate import prompt_ids   # handles version differences in the template
    p = list(prompt_ids(tok, instruction))
    o = tok(output, add_special_tokens=False).input_ids + [tok.eos_token_id]
    ids = (p + list(o))[:max_len]
    return torch.tensor([ids]), min(len(p), len(ids))


def kl_on_prompt(model, tok, instruction: str, max_len: int = 256):
    """Next-token KL between θ and the reference on a retain prompt."""
    import torch
    from .evaluate import prompt_ids
    ids = prompt_ids(tok, instruction)[:max_len]
    if len(ids) < 2:
        return torch.zeros((), device=model.device)
    t = torch.tensor([ids], device=model.device)
    logits_theta = model(t).logits
    with model.disable_adapter():                     # ref = same base, no LoRA
        with torch.no_grad():
            logits_ref = model(t).logits
    return retain_kl(logits_theta, logits_ref)


def train(data: Path = DEFAULT_DATA, out: Path = DEFAULT_OUT, base: str = "",
          seq: int = 1024, epochs: float = 1, lr: float = 5e-5,
          beta: float = 0.5, kl_weight: float = 1.0, retain_ratio: int = 1,
          grad_accum: int = 4, dry_run: bool = False,
          card_gb: float = 10.5) -> int:
    from .evaluate import DEFAULT_BASE, require_stack
    base = base or DEFAULT_BASE

    forget = [r for r in _read_jsonl(data / "forget.jsonl")
              if (r.get("output") or "").strip()]
    retain = _read_jsonl(data / "retain.jsonl")

    print("NPO unlearning plan")
    print(f"  base model   : {base}")
    print(f"  forget       : {len(forget)} rows   retain: {len(retain)} rows "
          f"(1 KL term per {retain_ratio} forget step)")
    print(f"  β={beta}  λ_retain={kl_weight}  lr={lr}  epochs={epochs}  seq={seq}")
    print(f"  out          : {out}")
    if dry_run:
        # A dry run must work before the data exists — that is the point of it.
        for missing, howto in (("forget", "sets --forget-source harvest"),
                               ("retain", "training.selfplay.vaca_domain")):
            rows = forget if missing == "forget" else retain
            if not rows:
                print(f"  ! {missing} set is EMPTY — build it first: {howto}")
        return 0

    if not forget:
        raise SystemExit("forget.jsonl has no answers — harvest it first")
    if not retain:
        raise SystemExit("retain.jsonl is empty — the KL term would have nothing "
                         "to pin, which is how unlearning turns into collapse")

    require_stack()
    import torch
    from peft import LoraConfig, get_peft_model
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

    tok = AutoTokenizer.from_pretrained(base)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token
    qcfg = None
    try:
        qcfg = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
                                  bnb_4bit_use_double_quant=True,
                                  bnb_4bit_compute_dtype=torch.float16)
    except Exception:
        pass
    # NPO holds TWO passes over the same weights (θ and the adapter-disabled
    # reference), so the per-card budget matters more here than in the trainer.
    n_gpu = torch.cuda.device_count() if torch.cuda.is_available() else 0
    max_mem = {i: f"{card_gb}GB" for i in range(n_gpu)} if n_gpu else None
    model = AutoModelForCausalLM.from_pretrained(
        base, device_map="auto" if n_gpu else "cpu", torch_dtype=torch.float16,
        quantization_config=qcfg, max_memory=max_mem, low_cpu_mem_usage=True)
    model = get_peft_model(model, LoraConfig(
        r=8, lora_alpha=16, lora_dropout=0.05, bias="none", task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                        "gate_proj", "up_proj", "down_proj"]))
    model.print_trainable_parameters()

    opt = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=lr)
    steps = max(1, int(epochs * len(forget)))
    model.train()
    opt.zero_grad()
    for step in range(steps):
        f = forget[step % len(forget)]
        ids, n_prompt = encode(tok, f["instruction"], f["output"], seq)
        ids = ids.to(model.device)
        lp_theta = seq_logprob(model, ids, n_prompt)
        with model.disable_adapter():
            with torch.no_grad():
                lp_ref = seq_logprob(model, ids, n_prompt)
        kl = torch.zeros((), device=model.device)
        if kl_weight > 0 and step % retain_ratio == 0:
            r = retain[(step // retain_ratio) % len(retain)]
            kl = kl_on_prompt(model, tok, r["instruction"], max_len=256).to(model.device)
        loss = (total_loss(lp_theta, lp_ref, kl, beta, kl_weight) / grad_accum)
        loss.backward()
        if (step + 1) % grad_accum == 0 or step == steps - 1:
            opt.step()
            opt.zero_grad()
        if step % 5 == 0 or step == steps - 1:
            print(f"  step {step + 1}/{steps}  loss {loss.item() * grad_accum:.4f}  "
                  f"logp_theta {lp_theta.mean().item():.3f}  "
                  f"logp_ref {lp_ref.mean().item():.3f}  kl {float(kl):.4f}")
    out.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(str(out))
    (out / "npo_run.json").write_text(json.dumps(
        {"base": base, "beta": beta, "kl_weight": kl_weight, "lr": lr,
         "epochs": epochs, "forget_rows": len(forget), "retain_rows": len(retain)},
        indent=2), encoding="utf-8")
    print(f"saved -> {out}")
    print("Next: point the sweep at this adapter, or evaluate it directly:\n"
          f"  python3 -m training.unlearn inspect --adapters {out.parent}")
    return 0


def _read_jsonl(p: Path) -> list:
    out = []
    if p.exists():
        with p.open(encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        out.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
    return out


# ── self-test ────────────────────────────────────────────────────────────────
def self_test() -> int:
    import torch

    fails = []
    logp_ref = torch.tensor([-5.0])

    # 1) The gradient w.r.t. logp_theta must be POSITIVE, so descent lowers the
    #    probability of the forget response. Get this sign wrong and the run
    #    trains the model to know the answer BETTER.
    lp = torch.tensor([-5.0], requires_grad=True)
    npo_loss(lp, logp_ref, beta=0.5).backward()
    grad_sign = float(lp.grad[0])
    if not grad_sign > 0:
        fails.append(f"gradient sign: d L / d logp_theta = {grad_sign:.4f}, expected > 0")

    # 2) Behavioural: SGD on a single logp must push θ BELOW the reference and
    #    settle there (saturation) rather than run away.
    lp = torch.tensor([-5.0], requires_grad=True)
    opt = torch.optim.SGD([lp], lr=1.0)
    for _ in range(200):
        opt.zero_grad()
        npo_loss(lp, logp_ref, beta=0.5).backward()
        opt.step()
    if not float(lp.detach()) < float(logp_ref):
        fails.append(f"descent did not lower logp_theta (ended at "
                     f"{float(lp.detach()):.3f} vs ref {float(logp_ref):.3f})")
    if not float(lp.detach()) > -1e6:
        fails.append("loss diverged instead of saturating")

    # 3) The β limits, which are easy to state backwards (they were, once):
    #    β→0 approaches gradient ascent, β→∞ saturates to nothing, and the
    #    gradient shrinks monotonically in between.
    def grad_at(beta: float, logp_theta: float = -50.0) -> float:
        p = torch.tensor([logp_theta], requires_grad=True)
        npo_loss(p, logp_ref, beta=beta).backward()
        return float(p.grad[0])

    g_small = grad_at(1e-6)
    if abs(g_small - 1.0) > 0.01:
        fails.append(f"beta->0 should approach gradient ascent (gradient 1), "
                     f"got {g_small:.4f}")
    if not grad_at(1e4) < 1e-3:
        fails.append("beta->inf should saturate the gradient to ~0 once theta is "
                     "below the reference")
    gs = [grad_at(b) for b in (0.1, 1.0, 10.0)]
    if not (gs[0] > gs[1] > gs[2]):
        fails.append(f"gradient should shrink monotonically with beta, got {gs}")

    # 4) KL is zero, with zero gradient, when θ == ref.
    logits = torch.randn(1, 6, 11)
    logits_t = logits.clone().requires_grad_(True)
    kl = retain_kl(logits_t, logits.detach())
    if abs(float(kl.detach())) > 1e-6:
        fails.append(f"KL(self,self) should be 0, got {float(kl.detach()):.3e}")
    kl.backward()
    if float(logits_t.grad.abs().max()) > 1e-5:
        fails.append("KL gradient at equality should be 0")

    # 5) KL grows with divergence, and the retain term actually resists moving
    #    θ away from the reference.
    other = torch.randn(1, 6, 11) * 2.0
    if not float(retain_kl(other, logits.detach()).detach()) > 0.1:
        fails.append("KL did not grow for a clearly different distribution")

    if fails:
        print("self-test FAILED:")
        for f in fails:
            print("  -", f)
        return 1
    print("self-test OK — NPO gradient lowers the forget probability and "
          "saturates instead of diverging; β→0 matches gradient ascent, β→∞ "
          "kills the gradient, and it shrinks monotonically in between; the "
          "retain KL is zero with zero gradient at π_θ = π_ref")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="NPO unlearning with a retain KL term")
    ap.add_argument("--data", type=Path, default=DEFAULT_DATA)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--base", default="")
    ap.add_argument("--seq", type=int, default=1024)
    ap.add_argument("--epochs", type=float, default=1)
    ap.add_argument("--lr", type=float, default=5e-5)
    ap.add_argument("--beta", type=float, default=0.5)
    ap.add_argument("--kl-weight", type=float, default=1.0)
    ap.add_argument("--retain-ratio", type=int, default=1)
    ap.add_argument("--grad-accum", type=int, default=4)
    ap.add_argument("--card-gb", type=float, default=10.5)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args()
    if a.self_test:
        return self_test()
    return train(a.data, a.out, a.base, a.seq, a.epochs, a.lr, a.beta,
                 a.kl_weight, a.retain_ratio, a.grad_accum, a.dry_run,
                 card_gb=a.card_gb)


if __name__ == "__main__":
    raise SystemExit(main())
