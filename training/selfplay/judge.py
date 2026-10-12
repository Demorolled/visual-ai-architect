"""Judge client + anti-cheat rubric.

Two layers, deliberately:

1. DETERMINISTIC anti-cheat (no LLM) — catches the mechanical ways a student
   games a question: echoing the prompt, refusing, emitting placeholders,
   restating the question as the answer. This mirrors the original loop's
   rule-based evidence grading (``puzzle_trainer.grade_verdict``) — the judge
   LLM never gets to overrule a mechanical cheat.

2. LLM judge (Gemma 4 12B on the second box) — scores the SUBJECTIVE slice:
   does the answer actually solve the stated problem, is the reasoning sound,
   did it use the provided scaffolding correctly. Only consulted when the
   deterministic layer passes.

Stdlib only (urllib) so it runs in any environment.
"""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Optional

from .config import Endpoints

# ── Mechanical cheat patterns ────────────────────────────────────────────────
_REFUSALS = (
    "i cannot", "i can't", "i'm unable", "i am unable", "as an ai",
    "i don't have access", "cannot comply", "against my guidelines",
)
# NOTE: a bare "..." and the bare word "todo" are deliberately NOT substring
# markers — "a todo app" is a legitimate answer, and ellipses are common.
# A TODO is only a placeholder when it is a code MARKER ("TODO:", "// TODO").
_PLACEHOLDERS = (
    "your code here", "<insert", "lorem ipsum", "placeholder",
    "implement this", "// see above", "# see above",
)
_TODO_MARKER = re.compile(
    r"(?:^|[\s/*#<!-])todo\s*[:\-)]|(?://|#|/\*|<!--)\s*todo\b", re.I)


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").lower()).strip()


def deterministic_cheat(question: str, answer: str, min_len: int = 20) -> Optional[str]:
    """Return a reason string when the answer is mechanically cheating, else None.

    A pure rule check — no model call — so it is cheap enough to run on every row.
    """
    a = (answer or "").strip()
    q = _norm(question)
    an = _norm(a)

    if not a:
        return "empty-answer"
    # Echo is checked BEFORE length so a question restated verbatim is labelled
    # as a cheat (echoes-question), not merely short.
    if q and (an == q or (len(q) > 24 and (an.startswith(q[:60]) or q.startswith(an[:60])))):
        return "echoes-question"
    if any(r in an for r in _REFUSALS):
        return "refusal"
    if _TODO_MARKER.search(an) or any(p in an for p in _PLACEHOLDERS):
        return "placeholder"
    # Repetition spam (a token repeated to pad length).
    words = an.split()
    if len(words) >= 20:
        top = max(words.count(w) for w in set(words))
        if top / len(words) > 0.5:
            return "repetition-spam"
    if len(a) < min_len:
        return f"too-short ({len(a)} chars)"
    return None


# ── LLM judge ────────────────────────────────────────────────────────────────
@dataclass
class JudgeVerdict:
    passed: bool
    score: int
    reasons: list
    raw: str = ""
    error: str = ""
    cheated: bool = False
    cheat_reason: str = ""


def _chat(url: str, model: str, messages: list, max_tokens: int = 512,
          temperature: float = 0.0, timeout: int = 300) -> str:
    """One OpenAI-compatible chat completion. ``url`` is a base like .../v1."""
    base = url.rstrip("/")
    if not base.endswith("/v1"):
        base = base + "/v1"
    body = json.dumps({
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False,
    }).encode()
    req = urllib.request.Request(
        base + "/chat/completions", data=body,
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = json.loads(r.read())
    return (data.get("choices") or [{}])[0].get("message", {}).get("content", "")


def _parse_score(text: str) -> tuple[int, list]:
    m = re.search(r"SCORE\s*[:\s]*(\d{1,3})", text, re.I)
    score = int(m.group(1)) if m else -1
    reasons = re.findall(r"^\s*[-*]\s*(.+)$", text, re.M)[:6]
    return max(-1, min(100, score)), reasons


def judge_answer(question: str, answer: str, endpoints: Endpoints,
                 reference: str = "", pass_score: int = 60) -> JudgeVerdict:
    """Grade one answer. Deterministic cheat check first, then the LLM judge."""
    cheat = deterministic_cheat(question, answer)
    if cheat:
        return JudgeVerdict(passed=False, score=0, reasons=[cheat],
                            cheated=True, cheat_reason=cheat)

    sys_prompt = (
        "You are a strict examiner. Decide whether the CANDIDATE ANSWER "
        "actually solves the QUESTION. A fluent but wrong answer fails. "
        "Reply with `SCORE: <0-100>` on the first line, then up to 4 bullet "
        "reasons. Reward only correct, complete, non-gamed answers."
    )
    user = f"QUESTION:\n{question}\n\nCANDIDATE ANSWER:\n{answer}"
    if reference:
        user += f"\n\nREFERENCE (may be empty):\n{reference[:1500]}"
    try:
        raw = _chat(endpoints.judge_url, endpoints.judge_model, [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user},
        ], max_tokens=400)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        # Judge unreachable must not silently pass rows.
        return JudgeVerdict(passed=False, score=-1, reasons=["judge-unreachable"],
                            error=str(e)[:200])

    score, reasons = _parse_score(raw)
    return JudgeVerdict(passed=score >= pass_score, score=score, reasons=reasons, raw=raw)


def audit_cheating(question: str, answer: str, endpoints: Endpoints,
                   expected_markers: Optional[list] = None) -> JudgeVerdict:
    """Targeted anti-gaming audit: did the student answer the QUESTION, or
    launder it (echo, generic praise, marker-free hand-waving)?  Used on a
    sample each round so the loop can't drift into reward hacking."""
    cheat = deterministic_cheat(question, answer)
    if cheat:
        return JudgeVerdict(passed=False, score=0, reasons=[cheat],
                            cheated=True, cheat_reason=cheat)
    sys_prompt = (
        "You are an ANTI-CHEAT auditor. The student was asked a QUESTION and "
        "was supposed to solve it. Return CHEAT: YES only if the answer dodges "
        "the question, restates it, pads with generic reassurance, or claims "
        "work it did not show. Otherwise CHEAT: NO. Then `SCORE: <0-100>` for "
        "genuine correctness. First line `CHEAT: YES|NO`."
    )
    user = f"QUESTION:\n{question}\n\nSTUDENT ANSWER:\n{answer}"
    if expected_markers:
        user += ("\n\nA genuine answer should mention at least one of these "
                 "concrete markers: " + ", ".join(map(str, expected_markers[:12])))
    try:
        raw = _chat(endpoints.judge_url, endpoints.judge_model, [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user},
        ], max_tokens=300)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return JudgeVerdict(passed=False, score=-1, reasons=["judge-unreachable"],
                            error=str(e)[:200])

    cheated = bool(re.search(r"CHEAT\s*[:\s]*YES", raw, re.I))
    score, reasons = _parse_score(raw)
    return JudgeVerdict(passed=(not cheated and score >= 60), score=score,
                        reasons=reasons, raw=raw, cheated=cheated,
                        cheat_reason="auditor-flagged" if cheated else "")
