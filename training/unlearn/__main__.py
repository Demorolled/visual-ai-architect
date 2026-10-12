#!/usr/bin/env python3
"""CLI for the unlearning harness.

    python3 -m training.unlearn dequant --stdin --out <dir>
                                                     # GGUF -> trainable HF model
    python3 -m training.unlearn sets                 # build forget + retain sets
    python3 -m training.unlearn sets --forget-source harvest
    python3 -m training.unlearn train  [--dry-run]   # forget adapter (the task vector)
    python3 -m training.unlearn negate --lams 0.5,1.0
    python3 -m training.unlearn eval   [--dry-run]   # perplexity sweep + verdict
    python3 -m training.unlearn all    [--dry-run]   # the whole chain, minus training
    python3 -m training.unlearn self-test            # prove the negation math

`all` deliberately stops before training: that step costs a real QLoRA round on
the agent's GPUs, so it stays an explicit choice rather than a side effect of
asking for a report.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import evaluate as eval_mod
from . import gguf_to_hf as gguf_mod
from . import inspect_gen as inspect_mod
from . import negate as neg_mod
from . import npo as npo_mod
from . import preflight as preflight_mod
from . import sets as sets_mod


def _dequant(a) -> int:
    if a.self_test:
        return gguf_mod.self_test()
    if not a.stdin and not a.gguf:
        print("need --gguf <file> or --stdin", file=sys.stderr)
        return 2
    return gguf_mod.run(a.gguf, a.out, a.shard_gb, a.tokenizer_from, a.dry_run, a.check)


def _sets(a) -> int:
    # `sets` writes to --out; `all` carries --data (the shared data dir) and
    # must not drop the sets into the adapters directory.
    out = getattr(a, "data", None) or a.out
    m = sets_mod.build(a.forget_source, a.endpoint, a.model, a.forget_file,
                       a.retain_file, a.retain_limit, out,
                       getattr(a, "forget_limit", 0))
    print(f"forget: {m['forget_rows']} rows ({m['forget_answered']} answered)")
    print(f"retain: {m['retain_rows']} rows")
    print(f"scorable: {m['scorable']}")
    for n in m["notes"]:
        print(f"  ! {n}")
    return 0


def _forget_path(a) -> Path:
    return a.data / "forget.jsonl"


def _train(a) -> int:
    cmd = neg_mod.train_cmd(a.base, _forget_path(a), a.out / "forget-lora",
                            a.seq, a.epochs, a.lr, a.grad_accum, card_gb=a.card_gb)
    print("$ " + " ".join(str(c) for c in cmd))
    if a.dry_run:
        return 0
    import subprocess
    return subprocess.call([str(c) for c in cmd])


def _negate(a) -> int:
    import json
    src = a.out / "forget-lora"
    if a.dry_run:
        print(f"[dry-run] would negate {src} -> {a.out}/lambda-* for {a.lams}")
        return 0
    lams = [float(x) for x in a.lams.split(",") if x.strip()]
    rep = neg_mod.negate(src, a.out, lams)
    print(json.dumps(rep, indent=2))
    for w in rep["warnings"]:
        print(f"  ! {w}")
    return 0


def _eval(a) -> int:
    return eval_mod.run(base=a.base, data=a.data, adapters=a.out, out=a.out,
                        lams=a.lams, max_len=a.seq,
                        max_retain_delta=a.max_retain_delta, dry_run=a.dry_run)


def _inspect(a) -> int:
    if a.self_test:
        return inspect_mod.self_test()
    return inspect_mod.run(adapters=a.out, data=a.data, base=a.base, lams=a.lams,
                           n=a.n, dry_run=a.dry_run)


def _npo(a) -> int:
    if a.self_test:
        return npo_mod.self_test()
    return npo_mod.train(data=a.data, out=a.out / "npo-lora", base=a.base,
                         seq=a.seq, epochs=a.epochs, lr=a.lr, beta=a.beta,
                         kl_weight=a.kl_weight, retain_ratio=a.retain_ratio,
                         grad_accum=a.grad_accum, card_gb=a.card_gb,
                         dry_run=a.dry_run)


def _preflight(a) -> int:
    return preflight_mod.run(a.endpoint, a.judge)


def _self_test(a) -> int:
    """Run every stage's self-test; non-zero if any of them fails."""
    checks = (("dequant (GGUF -> HF reader/dequant)", gguf_mod.self_test),
              ("negate (W − λ·τ identity)", neg_mod.self_test),
              ("inspect (forgetting vs incoherence)", inspect_mod.self_test),
              ("npo (loss + retain KL)", npo_mod.self_test))
    failed = 0
    for name, fn in checks:
        print(f"--- {name}")
        if fn() != 0:
            failed += 1
    print(f"\n{len(checks) - failed}/{len(checks)} self-tests passed")
    return 1 if failed else 0


def _all(a) -> int:
    rc = _sets(a)
    if rc:
        return rc
    if a.dry_run:
        print("\n[dry-run] remaining stages: train -> negate -> eval")
        neg_mod.train_cmd(a.base, _forget_path(a), a.out / "forget-lora",
                          a.seq, a.epochs, a.lr, a.grad_accum, card_gb=a.card_gb)
        return _eval(a)
    print("\nNext: python3 -m training.unlearn train   (needs the agent's GPUs)")
    return rc


def main() -> int:
    ap = argparse.ArgumentParser(prog="training.unlearn", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def common(p):
        p.add_argument("--out", type=Path, default=sets_mod.DEFAULT_OUT.parent / "adapters")
        p.add_argument("--data", type=Path, default=sets_mod.DEFAULT_OUT)
        p.add_argument("--lams", default="0.25,0.5,0.75,1.0,1.25")
        p.add_argument("--base", default=eval_mod.DEFAULT_BASE)
        p.add_argument("--seq", type=int, default=1024)
        p.add_argument("--epochs", type=float, default=1)
        p.add_argument("--lr", type=float, default=1e-4)
        p.add_argument("--grad-accum", type=int, default=4)
        p.add_argument("--card-gb", type=float, default=10.5,
                       help="per-card VRAM budget for the trainer (2 cards assumed)")
        p.add_argument("--dry-run", action="store_true")

    p = sub.add_parser("dequant",
                       help="dequantize a GGUF into a trainable HF checkpoint")
    p.add_argument("--gguf", type=Path, default=None)
    p.add_argument("--stdin", action="store_true",
                   help="read the GGUF from a pipe, e.g. ssh host 'sudo cat blob' |")
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--shard-gb", type=float, default=4.0)
    p.add_argument("--tokenizer-from", default=None)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--check", action="store_true",
                   help="audit an already-written --out against the GGUF header")
    p.add_argument("--self-test", action="store_true")
    p.set_defaults(fn=_dequant)

    p = sub.add_parser("sets", help="build the forget and retain sets")
    p.add_argument("--forget-source", choices=["seed", "harvest", "from-file"], default="seed")
    p.add_argument("--forget-file", type=Path, default=None)
    p.add_argument("--endpoint", default="http://127.0.0.1:8000/v1")
    p.add_argument("--model", default="qwen2.5-coder-14b-uncensored-dspark")
    p.add_argument("--retain-file", type=Path, default=sets_mod.DEFAULT_RETAIN)
    p.add_argument("--retain-limit", type=int, default=0)
    p.add_argument("--forget-limit", type=int, default=0,
                   help="cap the number of forget prompts (smoke tests)")
    p.add_argument("--out", type=Path, default=sets_mod.DEFAULT_OUT)
    p.set_defaults(fn=_sets)

    p = sub.add_parser("train", help="train the forget task-vector adapter")
    common(p)
    p.set_defaults(fn=_train)

    p = sub.add_parser("negate", help="write λ-negated adapter variants")
    common(p)
    p.set_defaults(fn=_negate)

    p = sub.add_parser("eval", help="perplexity sweep and verdict")
    common(p)
    p.add_argument("--max-retain-delta", type=float, default=eval_mod.DEFAULT_MAX_RETAIN_DELTA)
    p.set_defaults(fn=_eval)

    p = sub.add_parser("inspect", help="read generations: forgetting vs incoherence")
    common(p)
    p.add_argument("--n", type=int, default=8, help="readings per set per arm")
    p.add_argument("--self-test", action="store_true")
    p.set_defaults(fn=_inspect)

    p = sub.add_parser("npo", help="NPO unlearning with a retain KL term")
    common(p)
    p.add_argument("--beta", type=float, default=0.5)
    p.add_argument("--kl-weight", type=float, default=1.0)
    p.add_argument("--retain-ratio", type=int, default=1)
    p.add_argument("--self-test", action="store_true")
    p.set_defaults(fn=_npo)

    p = sub.add_parser("preflight", help="what can run right now, and what is blocked")
    p.add_argument("--endpoint", default=preflight_mod.DEFAULT_STUDENT)
    p.add_argument("--judge", default=preflight_mod.DEFAULT_JUDGE)
    p.set_defaults(fn=_preflight)

    p = sub.add_parser("all", help="sets -> train -> negate -> eval")
    p.add_argument("--forget-source", choices=["seed", "harvest", "from-file"], default="seed")
    p.add_argument("--forget-file", type=Path, default=None)
    p.add_argument("--endpoint", default="http://127.0.0.1:8000/v1")
    p.add_argument("--model", default="qwen2.5-coder-14b-uncensored-dspark")
    p.add_argument("--retain-file", type=Path, default=sets_mod.DEFAULT_RETAIN)
    p.add_argument("--retain-limit", type=int, default=0)
    common(p)
    p.add_argument("--max-retain-delta", type=float, default=eval_mod.DEFAULT_MAX_RETAIN_DELTA)
    p.set_defaults(fn=_all)

    p = sub.add_parser("self-test", help="run every stage's self-test")
    p.set_defaults(fn=_self_test)

    a = ap.parse_args()
    return a.fn(a)


if __name__ == "__main__":
    raise SystemExit(main())
