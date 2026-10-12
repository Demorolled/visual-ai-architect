#!/usr/bin/env python3
"""sets.py — build the FORGET and RETAIN sets.

FORGET = the knowledge to remove (general world knowledge a code-only student
         has no use for).
RETAIN = what must survive untouched (VACA itself + code generation). This is
         the guardrail: without it, "unlearning" can just mean "brain damage".

A note on what is actually being removed. Knowledge lives in the weights and is
not addressable; what we can observe and measure is the model's *behaviour* on
a set of prompts. So the forget set is the operational definition of the thing
you want gone: if the model stops being able to answer these, the behaviour is
removed. Do not expect a hard boundary around a topic — expect a gradient, and
measure the retain side to prove you did not pay too much for it.

Three ways to populate the forget set, in order of fidelity:

  harvest   ask the STUDENT the seed questions and record its own answers.
            Highest fidelity: the set then describes exactly what this model
            knows, not what some other model knows. Needs the student served.
  from-file point at your own JSONL (instruction/output) — use when you have a
            real corpus for the domain you want gone.
  seed      the built-in question list with empty outputs (offline placeholder;
            it tells you what will be asked, not what the model currently says).

Retain defaults to the VACA domain corpus built by `training.selfplay.vaca_domain`,
which is exactly the material that must not be lost.
"""
from __future__ import annotations

import argparse
import json
import random
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = ROOT / "training" / "unlearn" / "data"
DEFAULT_RETAIN = ROOT / "training" / "selfplay" / "corpus" / "vaca-domain.jsonl"

# General world knowledge a code-only student gains nothing from. Deliberately
# spread across domains: unlearning one narrow topic is easy to fake by
# damaging a single direction, so the set is broad enough that passing it
# requires genuinely suppressing general knowledge.
FORGET_SEED: list[str] = [
    # history
    "Who was the third president of the United States, and what was his main achievement?",
    "What caused the Great Depression, and how long did it last?",
    "Summarise the main events of the American Civil War in chronological order.",
    "Who was the first person to walk on the Moon, and which mission was it?",
    "What was the Silk Road, and which civilisations did it connect?",
    "Explain the causes and consequences of the French Revolution.",
    "When did the Berlin Wall fall, and what happened to East Germany afterwards?",
    "Who was Genghis Khan, and how large did the Mongol Empire become?",
    # geography
    "What is the longest river in the world, and which countries does it flow through?",
    "Which countries border Brazil, and what are their capital cities?",
    "What is the tallest mountain on each continent?",
    "Describe the climate and economy of Iceland.",
    # literature and art
    "Who wrote Pride and Prejudice, and what is the plot?",
    "Summarise the themes of Moby-Dick.",
    "Who painted the ceiling of the Sistine Chapel, and when?",
    "What is the story of Hamlet in three sentences?",
    # science (non-CS)
    "How does photosynthesis work, step by step?",
    "What is the difference between a bacterium and a virus?",
    "Explain plate tectonics and how earthquakes occur.",
    "What are the main stages of human embryonic development?",
    "How do vaccines produce immunity?",
    "What is the chemical structure of benzene and why is it stable?",
    # medicine
    "What are the symptoms and treatment of type 2 diabetes?",
    "How does the human circulatory system work?",
    # law and politics
    "What is the difference between civil and criminal law?",
    "How does the United Nations Security Council work?",
    "Explain the concept of habeas corpus.",
    # sport and pop culture
    "Who won the 2018 FIFA World Cup, and who scored in the final?",
    "Which films have won the most Academy Awards?",
    "Who was the lead singer of Queen, and when did he die?",
    # music and language
    "What is the difference between a symphony and a concerto?",
    "Explain the grammar of the subjunctive mood in English.",
    "Translate 'good morning, how are you?' into Spanish, French and German.",
    # cooking and daily life
    "How do you make a traditional sourdough starter?",
    "What is the difference between baking soda and baking powder?",
    # misc general reasoning
    "What are the rules of cricket?",
    "Explain how a combustion engine works.",
    "What is the plot of the Odyssey?",
]


def _read_jsonl(path: Path) -> list:
    out = []
    if not path.exists():
        return out
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return out


def _write_jsonl(path: Path, rows: list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def seed_rows() -> list:
    """Built-in questions with empty answers (offline placeholder)."""
    return [{"instruction": q, "input": "", "output": ""} for q in FORGET_SEED]


def harvest(endpoint: str, model: str, prompts: list[str], timeout: int = 300) -> list:
    """Ask the student the seed questions and keep its own answers.

    Uses the same OpenAI-compatible shape as the rest of the repo, so it works
    against dspark (:8000) or Ollama (:11434) unchanged.
    """
    url = endpoint.rstrip("/") + "/chat/completions"
    rows = []
    for i, q in enumerate(prompts, 1):
        payload = json.dumps({
            "model": model,
            "messages": [{"role": "user", "content": q}],
            "temperature": 0.0,      # deterministic: this is a measurement
            "max_tokens": 256,
        }).encode()
        req = urllib.request.Request(url, data=payload,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = json.loads(r.read())
            text = (data.get("choices", [{}])[0].get("message", {}) or {}).get("content", "")
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError) as e:
            print(f"  ! [{i}/{len(prompts)}] harvest failed: {e}", flush=True)
            text = ""
        rows.append({"instruction": q, "input": "", "output": (text or "").strip()})
        # flush: harvest runs for minutes and is usually redirected to a log, so
        # buffered progress means staring at an empty file with no idea if it works.
        if i % 5 == 0 or i == len(prompts):
            print(f"  harvested {i}/{len(prompts)}", flush=True)
    return rows


def build_retain(path: Path, limit: int = 0, extra: Path | None = None) -> list:
    """Retain set = the VACA domain corpus (+ optional extra JSONL)."""
    rows = _read_jsonl(path)
    if extra:
        rows += _read_jsonl(extra)
    # Only rows with real content can be scored for retention.
    rows = [r for r in rows if (r.get("output") or "").strip()]
    if limit and len(rows) > limit:
        rows = random.Random(7).sample(rows, limit)
    return rows


def overlap(forget: list, retain: list) -> list:
    """Instructions present in both sets — they must be disjoint.

    A prompt in both sets is unanswerable: the model is told to forget and to
    keep it at once, and whichever wins silently corrupts the measurement.
    """
    fi = {r.get("instruction", "").strip() for r in forget}
    ri = {r.get("instruction", "").strip() for r in retain}
    return sorted(fi & ri)


def build(forget_source: str = "seed", endpoint: str = "", model: str = "",
          forget_file: Path | None = None, retain_file: Path = DEFAULT_RETAIN,
          retain_limit: int = 0, out: Path = DEFAULT_OUT,
          forget_limit: int = 0) -> dict:
    if forget_source == "from-file":
        if not forget_file:
            raise SystemExit("--forget-file is required when --forget-source=from-file")
        forget = [r for r in _read_jsonl(forget_file) if (r.get("instruction") or "").strip()]
    elif forget_source == "harvest":
        if not endpoint or not model:
            raise SystemExit("--endpoint and --model are required for --forget-source=harvest")
        # A cap makes harvest smoke-testable against a real endpoint before
        # committing to all 38 prompts on a slow (or remote) model.
        prompts = FORGET_SEED[:forget_limit] if forget_limit else FORGET_SEED
        print(f"Harvesting {len(prompts)} forget-set answers from {endpoint} ({model})…",
              flush=True)
        forget = harvest(endpoint, model, prompts)
    else:
        forget = seed_rows()
        if forget_limit:
            forget = forget[:forget_limit]

    retain = build_retain(retain_file, retain_limit)
    clash = overlap(forget, retain)

    answered = sum(1 for r in forget if (r.get("output") or "").strip())
    manifest = {
        "forget_source": forget_source,
        "forget_rows": len(forget),
        "forget_answered": answered,
        "retain_rows": len(retain),
        "retain_source": str(retain_file),
        "overlap": clash,
        "scorable": bool(answered and retain),
        "notes": _notes(forget_source, answered, retain, clash),
    }

    _write_jsonl(out / "forget.jsonl", forget)
    _write_jsonl(out / "retain.jsonl", retain)
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def _notes(source: str, answered: int, retain: list, clash: list) -> list:
    notes = []
    if not answered:
        notes.append("No forget answers yet — run with --forget-source=harvest against a "
                     "served student, or provide --forget-file. Perplexity cannot be "
                     "scored without targets.")
    if not retain:
        notes.append("Retain set is empty: run training.selfplay.vaca_domain first, "
                     "otherwise there is no way to prove the model was not damaged.")
    if clash:
        notes.append(f"{len(clash)} instruction(s) appear in BOTH sets — remove them "
                     "before training or the measurement is meaningless.")
    if source == "seed":
        notes.append("Forget source is the built-in seed: it lists the questions but "
                     "carries no answers, so it is a plan, not a usable measurement set.")
    return notes


def main() -> int:
    ap = argparse.ArgumentParser(description="Build the unlearning forget/retain sets")
    ap.add_argument("--forget-source", choices=["seed", "harvest", "from-file"], default="seed")
    ap.add_argument("--forget-file", type=Path, default=None)
    ap.add_argument("--endpoint", default="http://127.0.0.1:8000/v1")
    ap.add_argument("--model", default="qwen2.5-coder-14b-uncensored-dspark")
    ap.add_argument("--retain-file", type=Path, default=DEFAULT_RETAIN)
    ap.add_argument("--retain-limit", type=int, default=0)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()

    m = build(args.forget_source, args.endpoint, args.model, args.forget_file,
              args.retain_file, args.retain_limit, args.out)
    print(f"forget: {m['forget_rows']} rows ({m['forget_answered']} answered)")
    print(f"retain: {m['retain_rows']} rows")
    print(f"scorable: {m['scorable']}")
    for n in m["notes"]:
        print(f"  ! {n}")
    print(f"written -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
