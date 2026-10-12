#!/usr/bin/env python3
"""preflight.py — is the harness actually able to run right now?

The unlearning sweep has hard external dependencies, and discovering them
half-way through a run wastes a lot of time:

  * harvest needs the STUDENT served (OpenAI-compatible /chat/completions)
  * eval / inspect need torch + transformers + peft locally
  * training needs the agent box (2 GPUs) — this box has one

This checks each one, says plainly what is blocked and why, and prints the
exact command sequence with the real URLs substituted in, so the sweep can be
started the moment the agent box comes up rather than being reconstructed from
the README.

    python3 -m training.unlearn preflight
    python3 -m training.unlearn preflight --student http://192.168.1.234:8000/v1
"""
from __future__ import annotations

import argparse
import importlib.util
import socket
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_STUDENT = "http://127.0.0.1:8000/v1"
DEFAULT_JUDGE = "http://192.168.1.234:11434/v1"


def tcp_check(url: str, timeout: float = 3.0) -> tuple[bool, str]:
    p = urlparse(url if "://" in url else f"http://{url}")
    host, port = p.hostname or "", p.port or (443 if p.scheme == "https" else 80)
    if not host:
        return False, "no host"
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True, f"{host}:{port} open"
    except OSError as e:
        return False, f"{host}:{port} unreachable ({e.__class__.__name__})"


def local_stack() -> dict:
    mods = {}
    for m in ("torch", "transformers", "peft"):
        try:
            spec = importlib.util.find_spec(m)
            if spec:
                mod = __import__(m)
                mods[m] = getattr(mod, "__version__", "?")
            else:
                mods[m] = None
        except Exception:
            mods[m] = None
    gpus = 0
    cuda = False
    try:
        import torch
        cuda = bool(torch.cuda.is_available())
        gpus = torch.cuda.device_count() if cuda else 0
    except Exception:
        pass
    return {"modules": mods, "cuda": cuda, "gpus": gpus}


def render(stack: dict, student: str, judge: str) -> tuple[list[str], list[str]]:
    """Return (blockers, plan). Blockers stop a stage; the plan is copy-paste."""
    blockers = []
    missing = [m for m, v in stack["modules"].items() if not v]
    if missing:
        blockers.append(
            f"missing python packages: {', '.join(missing)} — use the training venv:\n"
            f"    {ROOT}/llm-training-app/.venv/bin/python -m training.unlearn ...")
    s_ok, s_why = tcp_check(student)
    if not s_ok:
        blockers.append(f"student endpoint not served ({s_why}) — harvest and the "
                        "self-play loop both need it")

    plan = [
        "# 1. harvest the forget set from the served student",
        f"python3 -m training.unlearn sets --forget-source harvest --endpoint {student} \\",
        "    --model <served-model-name>",
        "",
        "# 2. train the forget task vector, then write the λ variants",
        "python3 -m training.unlearn train          # agent box, 2 GPUs",
        "python3 -m training.unlearn negate --lams 0.25,0.5,0.75,1.0,1.25",
        "",
        "# 3. score every arm, then READ generations to separate forgetting",
        "#    from incoherence",
        "python3 -m training.unlearn eval",
        "python3 -m training.unlearn inspect --lams 0.5,1.0 --n 8",
        "",
        "# 4. stronger alternative if negation is not enough",
        "python3 -m training.unlearn npo --beta 0.5 --kl-weight 1.0",
    ]
    if stack["gpus"] < 2:
        plan.insert(3, f"#    NOTE: only {stack['gpus']} CUDA GPU visible here — training "
                       "belongs on the agent box")
    return blockers, plan


def run(student: str = DEFAULT_STUDENT, judge: str = DEFAULT_JUDGE) -> int:
    stack = local_stack()
    print("local stack")
    for m, v in stack["modules"].items():
        print(f"  {m:14s} {v or 'MISSING'}")
    print(f"  cuda          {stack['cuda']} ({stack['gpus']} GPU)")
    print("\nendpoints")
    for name, url in (("student", student), ("judge", judge)):
        ok, why = tcp_check(url)
        print(f"  {name:8s} {url:38s} {'up' if ok else 'DOWN'}  ({why})")

    blockers, plan = render(stack, student, judge)
    print("\nblockers")
    if blockers:
        for b in blockers:
            print(f"  ! {b}")
    else:
        print("  none — the harness can run end to end from here")

    print("\nrun this:")
    for line in plan:
        print("  " + line)
    return 1 if blockers else 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Check readiness for the unlearning sweep")
    ap.add_argument("--student", default=DEFAULT_STUDENT)
    ap.add_argument("--judge", default=DEFAULT_JUDGE)
    a = ap.parse_args()
    return run(a.student, a.judge)


if __name__ == "__main__":
    raise SystemExit(main())
