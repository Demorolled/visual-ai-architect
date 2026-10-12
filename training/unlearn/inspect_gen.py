#!/usr/bin/env python3
"""inspect_gen.py — read actual generations, so forgetting is not confused with damage.

Perplexity alone cannot tell these apart:

    A) the model no longer knows the answer        <- what we want
    B) the model can no longer write a sentence    <- brain damage

Both raise forget-set perplexity. The sweep's retain budget catches the
catastrophic cases, but not the subtle ones, so this step reads real
generations and labels each one:

    forgotten   fluent, but no longer reproduces the known answer
    refused     declines to answer ("I don't know", "I can't help with that")
    unchanged   still reproduces the reference answer
    incoherent  degenerate output — repetition, no words, symbol soup, truncation

On the FORGET set you want `forgotten`/`refused` to rise and `incoherent` to
stay at zero. On the RETAIN set you want `unchanged` to stay high and BOTH
`incoherent` and `refused` at zero — a rise in retain refusals means the model
stopped being helpful, which unlearning causes far more often than it gets
credit for.

Classification is deliberately mechanical (no second model judging), so it is
cheap, deterministic and testable — `--self-test` exercises it on crafted
generations.

    python3 -m training.unlearn inspect --n 8
    python3 -m training.unlearn inspect --lams 0.5,1.0 --n 12
"""
from __future__ import annotations

import argparse
import json
import math
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA = ROOT / "training" / "unlearn" / "data"
DEFAULT_ADAPTERS = ROOT / "training" / "unlearn" / "adapters"

# ── thresholds (all deliberately loose: this is a smoke test, not a metric) ──
MAX_REPEAT = 0.35        # share of 5-grams that occur more than once
MIN_UNIQUE = 0.25        # distinct-token share
MIN_WORDS = 3
MIN_ALPHA = 0.35         # share of characters that are letters
UNCHANGED_OVERLAP = 0.5  # share of reference content words still present

_STOP = {
    "the", "a", "an", "of", "and", "to", "in", "is", "was", "were", "it", "that",
    "this", "for", "on", "with", "as", "by", "at", "from", "are", "be", "or",
    "which", "his", "her", "their", "its", "he", "she", "they", "has", "had",
}

_REFUSALS = (
    "i don't know", "i do not know", "i'm not able", "i am not able",
    "i can't help", "i cannot help", "i can't provide", "i cannot provide",
    "as an ai", "i'm unable", "i am unable", "no information", "i have no",
    "i'm sorry, but", "i am sorry, but", "i couldn't find", "i could not find",
)


def words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", (text or "").lower())


def content_words(text: str) -> list[str]:
    return [w for w in words(text) if w not in _STOP and len(w) > 1]


def repetition_ratio(text: str, n: int = 5) -> float:
    """Share of n-grams that appear more than once (catches degenerate loops)."""
    toks = words(text)
    if len(toks) < n * 2:
        return 0.0
    grams = [tuple(toks[i:i + n]) for i in range(len(toks) - n + 1)]
    c = Counter(grams)
    return sum(k for g, k in c.items() if k > 1) / len(grams)


def unique_ratio(text: str) -> float:
    toks = words(text)
    return len(set(toks)) / len(toks) if toks else 0.0


def is_refusal(text: str) -> bool:
    t = (text or "").lower()
    return any(p in t for p in _REFUSALS)


def incoherence(text: str) -> tuple[bool, str]:
    """(is_incoherent, reason). Empty output counts as incoherent: a model that
    produces nothing has been damaged, not 'unlearned'."""
    if not (text or "").strip():
        return True, "empty output"
    toks = words(text)
    if len(toks) < MIN_WORDS and len(text) < 40:
        return True, f"too short ({len(toks)} words)"
    if len(text) >= 40:
        letters = sum(c.isalpha() for c in text)
        if letters < MIN_ALPHA * len(text):
            return True, "mostly non-letters"
    if repetition_ratio(text) > MAX_REPEAT:
        return True, "repetition loop"
    if toks and unique_ratio(text) < MIN_UNIQUE:
        return True, "low token diversity"
    # A wall of the same character, or a truncated sentence mid-token.
    if re.search(r"(.)\1{24,}", text):
        return True, "character run"
    return False, ""


def still_knows(gen: str, reference: str) -> float:
    """Share of the reference's content words that survive in the generation."""
    ref = content_words(reference)
    if not ref:
        return 0.0
    gen = set(words(gen))
    return sum(1 for w in ref if w in gen) / len(ref)


def classify(gen: str, reference: str = "") -> dict:
    bad, why = incoherence(gen)
    ov = still_knows(gen, reference)
    if bad:
        label, reason = "incoherent", why
    elif is_refusal(gen):
        label, reason = "refused", "declines to answer"
    elif ov >= UNCHANGED_OVERLAP:
        label, reason = "unchanged", f"still matches reference ({ov:.0%})"
    else:
        label, reason = "forgotten", f"fluent but reference overlap only {ov:.0%}"
    return {"label": label, "reason": reason, "overlap": round(ov, 3),
            "repetition": round(repetition_ratio(gen), 3),
            "unique": round(unique_ratio(gen), 3), "words": len(words(gen))}


def summarise(rows: list[dict]) -> dict:
    c = Counter(r["label"] for r in rows)
    n = len(rows) or 1
    return {k: {"n": v, "pct": round(100 * v / n, 1)} for k, v in
            sorted(c.items(), key=lambda kv: -kv[1])}


# ── model-driven part ────────────────────────────────────────────────────────
def generate(model, tok, prompt: str, max_new_tokens: int = 120,
             temperature: float = 0.0) -> str:
    import torch
    from .evaluate import prompt_ids   # handles version differences in the template
    ids = prompt_ids(tok, prompt)
    t = torch.tensor([ids], device=model.device)
    with torch.no_grad():
        out = model.generate(t, max_new_tokens=max_new_tokens, do_sample=temperature > 0,
                             temperature=max(temperature, 1e-5),
                             pad_token_id=tok.pad_token_id or tok.eos_token_id)
    return tok.decode(out[0][len(ids):], skip_special_tokens=True).strip()


def inspect_arm(model, tok, forget: list, retain: list, n: int, ref_key="output") -> dict:
    """Read n generations from each set and label them."""
    out = {"forget": [], "retain": []}
    for name, rows in (("forget", forget[:n]), ("retain", retain[:n])):
        for r in rows:
            gen = generate(model, tok, r.get("instruction", ""))
            info = classify(gen, r.get(ref_key, "") if name == "forget" else "")
            out[name].append({"instruction": r.get("instruction", "")[:120],
                              "reference": (r.get(ref_key, "") or "")[:120],
                              "generation": gen[:240], **info})
    out["forget_summary"] = summarise(out["forget"])
    out["retain_summary"] = summarise(out["retain"])
    return out


def run(adapters: Path = DEFAULT_ADAPTERS, data: Path = DEFAULT_DATA,
        base: str = "", lams: str = "", n: int = 8, load_4bit: bool = True,
        dry_run: bool = False) -> int:
    from .evaluate import require_stack, load_model

    forget = [r for r in _read_jsonl(data / "forget.jsonl")
              if (r.get("output") or "").strip()]
    retain = _read_jsonl(data / "retain.jsonl")
    if not forget:
        raise SystemExit("forget.jsonl has no answers — build it with "
                         "--forget-source=harvest or --forget-file first")

    arms: list[tuple[str, Path | None]] = [("base", None)]
    for lam in [x for x in (lams or "").split(",") if x.strip()]:
        d = adapters / f"lambda-{float(lam):g}"
        if d.exists():
            arms.append((f"λ={float(lam):g}", d))

    if dry_run:
        print("[dry-run] generation inspection plan")
        print(f"  base     : {base or '(from sweep.json / default)'}")
        print(f"  arms     : {len(arms)} ({', '.join(a[0] for a in arms)})")
        print(f"  readings : {n} forget + {n} retain prompts per arm")
        print(f"  report   : {adapters}/inspect.md")
        return 0

    require_stack()
    if not base:
        from .evaluate import DEFAULT_BASE
        base = DEFAULT_BASE

    report = {"base": base, "n": n, "arms": {}}
    for label, adapter in arms:
        print(f"reading generations from {label}…")
        model, tok = load_model(base, adapter, load_4bit)
        report["arms"][label] = inspect_arm(model, tok, forget, retain, n)
        del model
        try:
            import torch
            torch.cuda.empty_cache()
        except Exception:
            pass

    write_report(report, adapters)
    for label, r in report["arms"].items():
        print(f"  {label}: forget {r['forget_summary']} | retain {r['retain_summary']}")
    print(f"report -> {adapters}/inspect.md")
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


def verdict_lines(report: dict) -> list[str]:
    """Turn the label counts into the one judgement that matters."""
    lines = []
    base = report["arms"].get("base", {})
    for label, r in report["arms"].items():
        if label == "base":
            continue
        f, t = r["forget_summary"], r["retain_summary"]
        forgotten = f.get("forgotten", {}).get("pct", 0) + f.get("refused", {}).get("pct", 0)
        bad = f.get("incoherent", {}).get("pct", 0)
        t_bad = (t.get("incoherent", {}).get("pct", 0)
                 + t.get("refused", {}).get("pct", 0))
        if bad > 0 or t_bad > 0:
            lines.append(f"- `{label}`: **damage, not forgetting** — "
                         f"{bad}% incoherent on forget, {t_bad}% incoherent/refused on retain")
        elif forgotten >= 50:
            lines.append(f"- `{label}`: **genuine forgetting** — {forgotten}% of forget prompts "
                         f"no longer answered, retain clean")
        else:
            lines.append(f"- `{label}`: weak — only {forgotten}% of forget prompts "
                         f"changed; retain clean")
    if base:
        lines.append(f"\nBaseline (no adapter) forgot "
                     f"{base['forget_summary'].get('forgotten', {}).get('pct', 0)}% of the "
                     f"forget set, so this is the floor any gain is measured against.")
    return lines


def write_report(report: dict, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    lines = ["# Generation inspection", "",
             f"- base model: `{report['base']}`",
             f"- readings per arm per set: {report['n']}", "",
             "Labels — `forgotten` fluent but no longer knows · `refused` declines · "
             "`unchanged` still knows · `incoherent` damaged output.", ""]
    for label, r in report["arms"].items():
        lines += [f"## {label}", "", "| set | label | n | share |", "|---|---|---|---|"]
        for setname in ("forget", "retain"):
            for k, v in r[f"{setname}_summary"].items():
                lines.append(f"| {setname} | {k} | {v['n']} | {v['pct']}% |")
        lines.append("")
    lines += ["## Verdict", ""] + verdict_lines(report) + ["",
              "## Samples", ""]
    for label, r in report["arms"].items():
        for setname in ("forget", "retain"):
            lines.append(f"### {label} — {setname}")
            for s in r[setname][:4]:
                lines += [f"- **Q:** {s['instruction']}",
                          f"  - `{s['label']}` ({s['reason']})",
                          f"  - {s['generation'][:200]!r}".replace("\\n", " ")]
            lines.append("")
    (out / "inspect.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (out / "inspect.json").write_text(json.dumps(report, indent=2), encoding="utf-8")


# ── self-test ────────────────────────────────────────────────────────────────
def self_test() -> int:
    """Exercise the classifier on crafted cases.

    The point of this step is the *distinction*, so the test pins exactly the
    two cases that perplexity conflates: fluent-but-forgotten vs damaged.
    """
    ref = "George Washington was the first president of the United States."
    cases = [
        # (generation, reference, expected label)
        (ref, ref, "unchanged"),
        ("Washington was the first president, elected in 1789.", ref, "unchanged"),
        ("I don't know that. I'm sorry, but I can't help with that.", ref, "refused"),
        ("The first president was a man named John Adams who served two terms.",
         ref, "forgotten"),
        ("the the the the the the the the the the the the the the the the",
         ref, "incoherent"),
        ("", ref, "incoherent"),
        ("x" * 60, ref, "incoherent"),
        ("??!??!???!??!?!???!??!???!??!?!???!??!???!??!?!???!??!???!??!?!??!",
         ref, "incoherent"),
        ("I am unable to provide that information.", ref, "refused"),
    ]
    fails = []
    for gen, reference, want in cases:
        got = classify(gen, reference)["label"]
        if got != want:
            fails.append(f"{want!r} expected, got {got!r} for {gen[:40]!r}")

    # A fluent wrong answer must NOT be flagged incoherent — that is the whole
    # reason this module exists.
    fluent_wrong = ("The first president was Thomas Jefferson, who wrote the "
                    "Declaration of Independence and later founded a university.")
    c = classify(fluent_wrong, ref)
    if c["label"] != "forgotten":
        fails.append(f"fluent-wrong mislabelled {c['label']}")

    s = summarise([{"label": "forgotten"}, {"label": "forgotten"}, {"label": "refused"}])
    if s["forgotten"]["pct"] != 66.7:
        fails.append("summarise percentages wrong")

    if fails:
        print("self-test FAILED:")
        for f in fails:
            print("  -", f)
        return 1
    print(f"self-test OK — classifier separates {len(cases)} crafted cases, and a fluent "
          "wrong answer is 'forgotten' rather than 'incoherent'")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Read generations and label them")
    ap.add_argument("--data", type=Path, default=DEFAULT_DATA)
    ap.add_argument("--adapters", type=Path, default=DEFAULT_ADAPTERS)
    ap.add_argument("--base", default="")
    ap.add_argument("--lams", default="0.5,1.0")
    ap.add_argument("--n", type=int, default=8)
    ap.add_argument("--no-4bit", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        return self_test()
    return run(args.adapters, args.data, args.base, args.lams, args.n,
               not args.no_4bit, args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
