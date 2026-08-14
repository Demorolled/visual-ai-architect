"""The curriculum pipeline stages.

flow: corpus → dictionary → tiered tests → validation → student eval → dataset.

Every stage is resumable: work is appended to an output jsonl and keyed in a
*-done.json marker, so a crashed/interrupted run continues where it stopped.

Hardware notes (verified on this rig):
  - teacher calls use Ollama `format: \"json\"` — without it, the 12B teacher
    reliably stops mid-JSON (done_reason=length); with it, output is always
    parseable.
  - The 27B teacher decodes at ~1 tok/s on the dual-RTX3060 split (wedges the
    runner); the 12B runs single-GPU at ~34 tok/s. Default config uses the 12B.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from . import io
from .llm import as_list, extract_json, student_reply, teacher_json, teacher_reply

TIERS = {
    1: "SUPER EASY — recall a single concrete fact from the dictionary; one-line answer.",
    2: "EASY — combine two facts or explain one mechanism briefly; short answer (2-4 sentences or a tiny snippet).",
    3: "MEDIUM — explain how a mechanism works end-to-end or write a small correct code task; needs reasoning.",
    4: "HARD — multi-step, cross-cutting: trace data through several components, find the flaw, or write correct code that satisfies constraints.",
    5: "EXTREMELY COMPLEX — full design/architecture task: end-to-end flow, adversarial edge cases, tradeoffs, or a multi-file correct implementation.",
}

TYPE_GUIDE = {
    "knowledge": "answer is a factual explanation grounded in the dictionary",
    "code": "answer is code that must be syntactically correct and semantically right",
    "mcq": "question includes 4 options (A-D); answer names the correct letter + one-line why",
}


def chunk_plan(cfg: dict, limit_chunks: int | None = None):
    """Yield (chunk_id, path, text) for every corpus chunk (deterministic)."""
    plan = list(_all_chunks(cfg))
    if limit_chunks:
        plan = plan[:limit_chunks]
    return plan


def _all_chunks(cfg: dict):
    for p in io.corpus_files(cfg):
        try:
            txt = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for i, chunk in enumerate(io.chunk_text(txt, cfg.get("chunk_size", 6000))):
            yield f"{p}:{i}", str(p), chunk


# ─── Stage 1: dictionary ────────────────────────────────────────────────────

def build_dictionary(cfg: dict, out_dir: Path, teacher: dict,
                     limit_chunks: int | None = None) -> list[dict]:
    stage = "dictionary"
    out = out_dir / "dictionary.jsonl"
    plan = chunk_plan(cfg, limit_chunks)
    print(f"[dictionary] {len(plan)} chunks to analyze")
    sys_prompt = (
        "You are building a precise technical knowledge dictionary of an application "
        "from its documentation and source code. From the excerpt below, extract the "
        "facts a senior engineer must know about this app: components, routes/endpoints, "
        "data models, contracts, algorithms, config, known constraints, gotchas, and "
        "how pieces fit together.\n"
        "Reply with ONLY JSON: "
        '{"entries": [{"topic": "<short topic name>", "summary": "<1-2 sentence summary>", '
        '"facts": ["<specific fact>", ...]}]}\n'
        "3-6 entries per excerpt. Facts must be verbatim-true to the excerpt, specific, "
        "and self-contained (no dangling references)."
    )
    done = 0
    for cid, path, chunk in plan:
        if io.is_done(out_dir, stage, cid):
            continue
        data = teacher_json(
            [{"role": "system", "content": sys_prompt},
             {"role": "user", "content": f"EXCERPT ({path}):\n{chunk}"}],
            teacher["model"], teacher["base_url"],
            temperature=teacher.get("temperature", 0.4),
            max_tokens=teacher.get("max_tokens", 1600))
        entries = (data or {}).get("entries") or []
        if not entries:
            print(f"  ! chunk {cid}: no parseable entries")
            continue
        for ent in entries:
            if not isinstance(ent, dict) or not ent.get("topic"):
                continue
            ent.setdefault("summary", "")
            ent.setdefault("facts", [])
            ent["source"] = str(path)
            io.append_jsonl(out, ent)
        io.mark_done(out_dir, stage, cid)
        done += 1
        print(f"  ✓ {cid} ({done}/{len(plan)}): {len(entries)} entries")
    return io.load_jsonl(out)


def merge_dictionary(raw_entries: list[dict], max_facts: int = 12) -> list[dict]:
    merged: dict[str, dict] = {}
    order: list[str] = []
    for e in raw_entries:
        topic = e["topic"].strip()
        key = io.norm(topic)
        if not key:
            continue
        if key not in merged:
            merged[key] = {"topic": topic, "summary": e.get("summary", ""),
                           "facts": [], "sources": []}
            order.append(key)
        m = merged[key]
        seen = {io.norm(x) for x in m["facts"]}
        for f in e.get("facts", []):
            if isinstance(f, str) and f.strip() and io.norm(f) not in seen:
                m["facts"].append(f.strip())
                seen.add(io.norm(f))
        src = e.get("source", "")
        if src and src not in m["sources"]:
            m["sources"].append(src)
        if not m["summary"] and e.get("summary"):
            m["summary"] = e["summary"]
    out = []
    for key in order:
        m = merged[key]
        m["facts"] = m["facts"][:max_facts]
        out.append(m)
    return out


# ─── Stage 2: tiered tests (ONE laddered call per topic) ────────────────────

def generate_tests(cfg: dict, out_dir: Path, teacher: dict, dictionary: list[dict],
                   max_topics: int | None = None, tests_per_tier: int = 1) -> list[dict]:
    stage = "tests"
    out = out_dir / "tests-raw.jsonl"
    tiers = cfg.get("tiers", 5)
    if max_topics:
        dictionary = dictionary[:max_topics]
    print(f"[tests] {len(dictionary)} topics; {tiers} tiers x {tests_per_tier} test(s) per tier (1 call/topic)")
    sys_prompt = (
        "You write tests that verify an LLM assistant truly understands an application. "
        "Given the dictionary topic and facts below, write a difficulty ladder of tests, "
        "exactly one test per tier, at the tiers defined. The question must be answerable "
        "ONLY from the facts given (plus general engineering knowledge for code/design "
        "tiers). The answer must be unambiguous enough to grade.\n"
        "Reply with ONLY JSON: an array of test objects, one per tier, in tier order:\n"
        '[{"tier": <int 1-5>, "type": "knowledge"|"code"|"mcq", '
        '"question": "<question>", "answer": "<expected answer>", '
        '"check": "<grading rubric: what makes an answer correct>"}, ...]'
    )
    produced = 0
    for topic in dictionary:
        key = io.norm(topic["topic"])
        if io.is_done(out_dir, stage, key):
            continue
        facts = "\n".join(f"- {f}" for f in topic["facts"])
        tier_block = "\n".join(f"TIER {t}: {TIERS[t]}" for t in range(1, tiers + 1))
        type_block = "\n".join(f"{t}- {g}" for t, g in TYPE_GUIDE.items())
        user_prompt = (
            f"{tier_block}\nALLOWED TYPE GUIDE:\n{type_block}\n"
            f"TOPIC: {topic['topic']}\nSUMMARY: {topic['summary']}\nFACTS:\n{facts}"
        )
        data = teacher_json(
            [{"role": "system", "content": sys_prompt},
             {"role": "user", "content": user_prompt}],
            teacher["model"], teacher["base_url"],
            temperature=0.2,  # lower temp = far fewer truncated ladder JSONs (4/4 vs 1/3)
            max_tokens=teacher.get("max_tokens", 2200),
            retries=4)
        arr = as_list(data)
        if not arr:
            print(f"  ! {topic['topic'][:40]}: no array")
            continue
        n = 0
        for data in arr[: tiers * tests_per_tier]:
            if not isinstance(data, dict) or not data.get("question") or not data.get("answer"):
                continue
            tier = int(data.get("tier", 1))
            row = {
                "id": io.obj_id(topic["topic"], str(tier), data["question"]),
                "topic": topic["topic"], "tier": tier,
                "type": data.get("type", "knowledge"),
                "question": data["question"], "answer": data["answer"],
                "check": data.get("check", ""), "facts": topic["facts"],
            }
            io.append_jsonl(out, row)
            n += 1
        io.mark_done(out_dir, stage, key)
        produced += n
        print(f"  ✓ {topic['topic'][:44]}: {n} tests")
    return io.load_jsonl(out)


# ─── Stage 3: validation (batched judge) ────────────────────────────────────

def validate_tests(cfg: dict, out_dir: Path, teacher: dict, raw: list[dict],
                   limit: int | None = None) -> list[dict]:
    stage = "validate"
    out = out_dir / "tests-validated.jsonl"
    valid_types = {"knowledge", "code", "mcq"}
    batch = raw if limit is None else raw[:limit]
    todo = [t for t in batch if not io.is_done(out_dir, stage, t["id"])]
    print(f"[validate] {len(todo)} tests to judge (batched)")
    seen_q: set[str] = set()
    for t in io.load_jsonl(out):  # seed dedupe from already-validated rows
        seen_q.add(io.norm(t.get("question", "")))
    bs = cfg.get("judge_batch", 4)
    for i in range(0, len(todo), bs):
        group = todo[i:i + bs]
        group = [t for t in group if not io.is_done(out_dir, stage, t["id"])]
        if not group:
            continue
        verdicts = _judge_batch(teacher, group, validate=True)
        if verdicts is None:  # fallback: judge individually
            for t in group:
                _judge_one_validate(teacher, t, out_dir, stage, seen_q)
            continue
        for t, v in zip(group, verdicts):
            _apply_verdict_validate(t, v, out_dir, stage, seen_q)
    return io.load_jsonl(out)


def _judge_batch(teacher: dict, group: list[dict], validate: bool):
    """One batched judge call → list of verdict dicts (or None on parse fail)."""
    if validate:
        parts = []
        for i, t in enumerate(group, 1):
            facts = "\n".join(f"- {f}" for f in t.get("facts", []))
            parts.append(
                f"TEST {i}\nFACTS:\n{facts}\nQUESTION: {t['question']}\nANSWER: {t['answer']}")
        sys_p = (
            "You are a rigorous test validator. For each test decide: (1) is the question "
            "answerable, (2) is the expected answer CORRECT and COMPLETE given the facts, "
            "(3) is the question not trivially unanswerable/self-contradictory.\n"
            "Reply with ONLY JSON, an array of verdicts, one per test in order: "
            '[{"valid": true|false, "reason": "<short>", "answer": "<corrected answer or same>"}, ...]')
        user = "\n\n".join(parts)
    else:
        parts = []
        for i, t in enumerate(group, 1):
            parts.append(
                f"TEST {i}\nQUESTION: {t['question']}\nEXPECTED: {t['answer']}\n"
                f"STUDENT: {t.get('student')}\nRUBRIC: {t.get('check') or 'correctness + completeness'}")
        sys_p = (
            "You are a strict, fair grader of an LLM's answers. Grade each test.\n"
            "Reply with ONLY JSON, an array of verdicts, one per test in order: "
            '[{"passed": true|false, "score": <0-100 int>, "reason": "<one line>"}, ...]')
        user = "\n\n".join(parts)
    data = teacher_json([{"role": "system", "content": sys_p},
                         {"role": "user", "content": user}],
                        teacher["model"], teacher["base_url"],
                        temperature=0.1, max_tokens=2000)
    arr = as_list(data)
    if not arr:
        return None
    return arr[: len(group)]


def _judge_one_validate(teacher: dict, t: dict, out_dir: Path, stage: str, seen_q: set):
    q = (t.get("question") or "").strip()
    a = (t.get("answer") or "").strip()
    if len(q) < 10 or len(a) < 10 or t.get("type") not in {"knowledge", "code", "mcq"}:
        io.mark_done(out_dir, stage, t["id"])
        return
    facts = "\n".join(f"- {f}" for f in t.get("facts", []))
    v = teacher_json(
        [{"role": "system", "content":
            "You are a rigorous test validator. Reply ONLY JSON: "
            '{"valid": true|false, "reason": "<short>", "answer": "<corrected or same>"}'},
         {"role": "user", "content": f"FACTS:\n{facts}\n\nQUESTION: {q}\nANSWER: {a}"}],
        teacher["model"], teacher["base_url"], temperature=0.1, max_tokens=1200)
    _apply_verdict_validate(t, v or {}, out_dir, stage, seen_q)


def _apply_verdict_validate(t: dict, v: dict, out_dir: Path, stage: str, seen_q: set):
    q = (t.get("question") or "").strip()
    nq = io.norm(q)
    if not v.get("valid") or nq in seen_q:
        print(f"  ✗ {t['id']} t{t['tier']} invalid/dup")
        io.mark_done(out_dir, stage, t["id"])
        return
    seen_q.add(nq)
    fixed = (v.get("answer") or t.get("answer") or "").strip()
    row = dict(t)
    row["answer"] = fixed if len(fixed) >= 10 else t["answer"]
    row["validated"] = True
    io.append_jsonl(out_dir / "tests-validated.jsonl", row)
    io.mark_done(out_dir, stage, t["id"])
    print(f"  ✓ {t['id']} t{t['tier']} {t['topic'][:32]}")


# ─── Stage 4: student eval (batched judge) ──────────────────────────────────

def eval_student(cfg: dict, out_dir: Path, teacher: dict, student: dict,
                 tests: list[dict], limit: int | None = None) -> list[dict]:
    stage = "eval"
    out = out_dir / "eval.jsonl"
    sys_p = ("You are Veronica, the assistant of the Visual AI Code Architect (VACA) app. "
             "Answer the user's question directly, precisely and concisely.")
    batch = tests if limit is None else tests[:limit]
    todo = [t for t in batch if not io.is_done(out_dir, stage, t["id"])]
    print(f"[eval] {len(todo)} questions for the student (batched judging)")
    bs = cfg.get("judge_batch", 3)
    for i in range(0, len(todo), bs):
        group = todo[i:i + bs]
        for t in group:
            try:
                t["student"] = student_reply(
                    [{"role": "system", "content": sys_p},
                     {"role": "user", "content": t["question"]}],
                    student["model"], student["base_url"])
            except Exception as e:  # noqa: BLE001
                print(f"  ! {t['id']} student call failed: {e}")
                continue
        verdicts = _judge_batch(teacher, group, validate=False)
        for t in group:
            if "student" not in t:
                continue
            if verdicts is None:
                _judge_one_eval(teacher, t, out_dir, stage)
            else:
                v = verdicts[group.index(t)] if group.index(t) < len(verdicts) else None
                _apply_verdict_eval(t, v or {}, out_dir, stage)
    return io.load_jsonl(out)


def _judge_one_eval(teacher: dict, t: dict, out_dir: Path, stage: str):
    v = teacher_json(
        [{"role": "system", "content": "You are a strict, fair grader. Reply with ONLY JSON: "
            '{"passed": true|false, "score": <0-100 int>, "reason": "<one line>"}'},
         {"role": "user", "content":
            f"RUBRIC: {t.get('check') or 'correctness + completeness'}\n"
            f"QUESTION: {t['question']}\nEXPECTED: {t['answer']}\nSTUDENT: {t['student']}"}],
        teacher["model"], teacher["base_url"], temperature=0.1, max_tokens=600)
    _apply_verdict_eval(t, v or {}, out_dir, stage)


def _apply_verdict_eval(t: dict, v: dict, out_dir: Path, stage: str):
    row = {
        "id": t["id"], "topic": t["topic"], "tier": t["tier"], "type": t["type"],
        "question": t["question"], "expected": t["answer"], "student": t["student"],
        "passed": bool(v.get("passed")), "score": int(v.get("score", 0)),
        "reason": str(v.get("reason", ""))[:300],
    }
    io.append_jsonl(out_dir / "eval.jsonl", row)
    io.mark_done(out_dir, stage, t["id"])
    print(f"  {'✓' if row['passed'] else '✗'} t{t['tier']} score {row['score']} {t['topic'][:30]}")


def eval_summary(rows: list[dict]) -> dict:
    by_tier: dict[int, list[dict]] = {}
    for r in rows:
        by_tier.setdefault(r["tier"], []).append(r)
    out = {"total": len(rows), "passed": sum(1 for r in rows if r["passed"]), "by_tier": {}}
    for tier in sorted(by_tier):
        g = by_tier[tier]
        out["by_tier"][tier] = {
            "n": len(g), "passed": sum(1 for r in g if r["passed"]),
            "avg_score": round(sum(r["score"] for r in g) / max(1, len(g)), 1),
        }
    return out


# ─── Stage 5: dataset ───────────────────────────────────────────────────────

def build_dataset(cfg: dict, out_dir: Path, validated: list[dict], app_name: str) -> Path:
    ds_dir = out_dir / "dataset"
    ds_dir.mkdir(parents=True, exist_ok=True)
    out = ds_dir / f"curriculum-{app_name.lower().replace(' ', '-')}.jsonl"
    existing = {io.obj_id(r.get("instruction", "")) for r in io.load_jsonl(out)}
    written = 0
    for t in validated:
        q = (t.get("question") or "").strip()
        a = (t.get("answer") or "").strip()
        if not q or not a:
            continue
        key = io.obj_id(q)
        if key in existing:
            continue
        row = {"instruction": q, "input": "", "output": a,
               "source": f"curriculum:{app_name}:tier{t.get('tier')}:{t.get('type')}:{t.get('topic', '')[:40]}"}
        io.append_jsonl(out, row)
        existing.add(key)
        written += 1
    print(f"[dataset] wrote {written} new rows → {out}")
    return out
