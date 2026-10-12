#!/usr/bin/env python3
"""orchestrator.py — the rebuilt round-based self-play loop.

One loop iteration ("round"):

    1. PLAY     the student plays N puzzle rounds against itself-as-served
                (scripts/puzzle_trainer.py) → reward-scored SFT/DPO/opt rows.
    2. AUDIT    sample rows, judge them (deterministic anti-cheat first, then
                the Gemma-4-12B judge on the second box) — catches reward
                hacking the game's rules can't see.
    3. CORPUS   merge the new rows with a retention slice and the VACA domain
                corpus, dedup, split train/val into corpus/r<NN>/.
    4. TRAIN    one 14B QLoRA round on the agent's 2× RTX 3060
                (training/selfplay/train_student.py).
    5. EXPORT   optional merge→GGUF hook (config round.export_cmd).
    6. REDEPLOY optional swap hook (config round.redeploy_cmd).
    7. PROMOTE  acceptance-gate selection (config round.promote_cmd), then bump NN.

Resumable: progress lives in work/state.json, so a crash resumes at the next
stage. ``--dry-run`` prints the whole plan without touching the GPU or network.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
import shlex
import subprocess
import sys
import threading
import time
from pathlib import Path

from .config import SelfPlayConfig, load_config, save_config
from .judge import deterministic_cheat, judge_answer

STATE_TEMPLATE = {"completed_rounds": [], "history": []}


class _Tee:
    """Mirror stdout into work/selfplay.log so the scoreboard can tail the loop."""

    def __init__(self, *streams):
        self.streams = streams

    def write(self, s):
        for st in self.streams:
            try:
                st.write(s)
                st.flush()
            except Exception:
                pass

    def flush(self):
        for st in self.streams:
            try:
                st.flush()
            except Exception:
                pass


# ── helpers ──────────────────────────────────────────────────────────────────
def _read_jsonl(path: Path) -> list:
    rows = []
    if not path.exists():
        return rows
    for line in path.open(encoding="utf-8"):
        line = line.strip()
        if line:
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return rows


def _write_jsonl(path: Path, rows: list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def _row_hash(r: dict) -> str:
    key = (str(r.get("instruction", "")) + "\x00" + str(r.get("output", ""))[:200])
    return hashlib.sha256(key.encode()).hexdigest()


def _glob_newest(out_dir: Path, pattern: str) -> Path | None:
    files = sorted(out_dir.glob(pattern), key=lambda p: p.stat().st_mtime)
    return files[-1] if files else None


def _run(cmd: list, dry: bool = False) -> int:
    printable = " ".join(shlex.quote(c) for c in cmd)
    if dry:
        print(f"    [dry-run] $ {printable}")
        return 0
    print(f"    $ {printable}", flush=True)
    return subprocess.call(cmd)


# ── stages ───────────────────────────────────────────────────────────────────
def stage_play(cfg: SelfPlayConfig, rnd: int, dry: bool) -> Path:
    """Run puzzle_trainer for this round; returns its output dir."""
    play_dir = Path(cfg.paths.work_dir) / f"r{rnd}" / "play"
    # Don't create the round dir on a dry run: an empty r<NN> makes the
    # scoreboard show a phantom round that never actually ran.
    if not dry:
        play_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        sys.executable, cfg.paths.puzzle_trainer,
        "--rounds", str(cfg.round.play_rounds),
        "--nodes-per-puzzle", str(cfg.round.nodes_per_puzzle),
        "--llm-url", cfg.endpoints.student_url.rstrip("/") + "/chat/completions",
        "--model", cfg.endpoints.student_model,
        "--out-dir", str(play_dir),
        "--flow", cfg.round.flow,
        "--tuneup-pct", str(cfg.round.tuneup_pct),
    ]
    if cfg.round.no_rag:
        cmd.append("--no-rag")
    if cfg.endpoints.embed_url:
        cmd += ["--embed-url", cfg.endpoints.embed_url]
    if _run(cmd, dry) != 0:
        raise RuntimeError("puzzle_trainer exited non-zero")
    return play_dir


def stage_audit(cfg: SelfPlayConfig, rnd: int, play_dir: Path, dry: bool) -> dict:
    """Judge a sample of the new rows; kill mechanically-cheating rows."""
    train_f = _glob_newest(play_dir, "train-puzzle-*.jsonl") or (play_dir / "train-puzzle.jsonl")
    rows = _read_jsonl(train_f)
    report = {"round": rnd, "sampled": 0, "passed": 0, "cheated": 0,
              "judge_unreachable": 0, "killed": 0, "examples": []}
    if not rows:
        print("    ⚠️  no SFT rows produced this round")
        return report

    rng = random.Random(cfg.start_round + rnd)
    sample = rng.sample(rows, min(cfg.round.judge_sample, len(rows)))
    keep = []
    sample_ids = set()
    for r in sample:
        question = str(r.get("instruction", ""))[:2000]
        answer = str(r.get("output", ""))
        sample_ids.add(_row_hash(r))
        if dry:
            cheat = deterministic_cheat(question, answer)
            if cheat:
                report["cheated"] += 1
                report["examples"].append({"cheat": cheat})
            else:
                report["passed"] += 1
            continue
        v = judge_answer(question, answer, cfg.endpoints)
        if v.error:
            report["judge_unreachable"] += 1
        elif v.cheated:
            report["cheated"] += 1
            report["examples"].append({"cheat": v.cheat_reason})
        else:
            report["passed"] += 1
        report["sampled"] += 1

    # Deterministic anti-cheat runs on EVERY row (cheap) — kill those outright.
    for r in rows:
        reason = deterministic_cheat(str(r.get("instruction", "")), str(r.get("output", "")))
        if reason:
            report["killed"] += 1
            report["examples"].append({"killed": reason})
        else:
            keep.append(r)

    audit_path = Path(cfg.paths.work_dir) / f"r{rnd}" / "audit.json"
    if not dry:
        audit_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"    audit: {report['passed']} passed / {report['cheated']} cheated / "
          f"{report['killed']} killed / {report['judge_unreachable']} judge-unreachable"
          f" → {audit_path.name}")

    if cfg.round.judge_required and report["cheated"] > max(1, report["sampled"] // 4):
        raise RuntimeError(f"audit failed: {report['cheated']} cheats of "
                           f"{report['sampled']} sampled — halting before training")

    # Persist the cleaned rows for the corpus stage (not during a dry run).
    if not dry:
        _write_jsonl(Path(cfg.paths.work_dir) / f"r{rnd}" / "clean.jsonl", keep)
    return report


def stage_corpus(cfg: SelfPlayConfig, rnd: int, dry: bool) -> tuple[Path, Path]:
    """Merge clean rows with a retention slice, dedup, split train/val."""
    work = Path(cfg.paths.work_dir) / f"r{rnd}"
    primary = _read_jsonl(work / "clean.jsonl")
    if not primary:
        primary = _read_jsonl(_glob_newest(work / "play", "train-puzzle-*.jsonl") or Path("/nonexistent"))

    # Optional DPO rows are kept as-is for a later DPO round (not used by SFT).
    dpo = _read_jsonl(_glob_newest(work / "play", "dpo-puzzle-*.jsonl") or Path("/nonexistent"))

    retention = _read_jsonl(Path(cfg.paths.retention_jsonl))
    rng = random.Random(4242)
    if retention and cfg.round.retention_mix > 0:
        n_keep = max(1, int(round(len(retention) * cfg.round.retention_mix)))
        retention = rng.sample(retention, min(n_keep, len(retention)))

    # The VACA domain corpus is the anchor: it teaches what VACA is and how the
    # model fits into it. Kept whole every round so self-play skill is added on
    # top of VACA literacy instead of overwriting it.
    domain = _read_jsonl(Path(cfg.paths.domain_jsonl))
    if domain and 0 < cfg.round.domain_mix < 1:
        n_keep = max(1, int(round(len(domain) * cfg.round.domain_mix)))
        domain = rng.sample(domain, min(n_keep, len(domain)))

    seen, merged = set(), []
    for src, tag in ((primary, "selfplay"), (retention, "retention"), (domain, "domain")):
        for r in src:
            h = _row_hash(r)
            if h in seen:
                continue
            seen.add(h)
            row = {k: r.get(k, "") for k in ("instruction", "input", "output")}
            row["source"] = r.get("source", tag)
            merged.append(row)
    rng.shuffle(merged)

    n_val = max(1, int(len(merged) * cfg.round.val_frac)) if merged else 0
    val, train = merged[:n_val], merged[n_val:]
    corpus = Path(cfg.paths.corpus_dir) / f"r{rnd}"
    train_f, val_f = corpus / "train.jsonl", corpus / "val.jsonl"
    if not dry:
        _write_jsonl(train_f, train)
        _write_jsonl(val_f, val)
        _write_jsonl(corpus / "dpo.jsonl", dpo)
    print(f"    corpus: {len(train)} train / {len(val)} val "
          f"({len(primary)} self-play + {len(retention)} retention + {len(domain)} domain) → {corpus}")
    return train_f, val_f


def stage_train(cfg: SelfPlayConfig, rnd: int, train_f: Path, val_f: Path, dry: bool) -> Path:
    out = Path(cfg.paths.models_dir) / f"r{rnd}"
    cmd = [
        cfg.paths.train_python, str(Path(__file__).parent / "train_student.py"),
        "--data", str(train_f), "--val", str(val_f), "--out", str(out),
        "--base", cfg.round.base_model,
        "--seq", str(cfg.round.max_seq_length),
        "--epochs", str(cfg.round.epochs),
        "--lr", str(cfg.round.learning_rate),
        "--grad-accum", str(cfg.round.grad_accum),
        "--card-gb", str(cfg.round.n_gpu_layers_cap_gb),
    ]
    if _run(cmd, dry) != 0:
        raise RuntimeError("train_student exited non-zero")
    return out


def stage_hook(label: str, cmd_str: str, dry: bool) -> None:
    if not cmd_str:
        print(f"    {label}: (no command configured — skipped)")
        return
    if _run(shlex.split(cmd_str), dry) != 0:
        raise RuntimeError(f"{label} hook failed: {cmd_str}")


# ── loop ─────────────────────────────────────────────────────────────────────
STAGES = ("PLAY", "AUDIT", "CORPUS", "TRAIN", "EXPORT")


def parse_stages(spec: str | None) -> tuple[str, ...]:
    """Resolve a `--stages` list. Empty means every stage.

    Exists so a round can be exercised on a machine that cannot train — one
    GPU, and `train_student.py` OOMs inside its fp32 upcast — without having to
    comment stages out of the loop or hand-run the pieces in order.
    """
    if not spec or not spec.strip():
        return STAGES
    want = tuple(s.strip().upper() for s in spec.split(",") if s.strip())
    bad = [s for s in want if s not in STAGES]
    if bad:
        raise SystemExit(f"unknown stage(s) {bad}; known stages: {list(STAGES)}")
    return want


def run(cfg: SelfPlayConfig, dry: bool = False,
        stages: tuple[str, ...] = STAGES) -> int:
    if not dry:
        work = Path(cfg.paths.work_dir)
        work.mkdir(parents=True, exist_ok=True)
        try:
            logf = open(work / "selfplay.log", "a", encoding="utf-8")
            sys.stdout = _Tee(sys.__stdout__, logf)
        except OSError:
            pass
    state_path = Path(cfg.paths.work_dir) / "state.json"
    state = STATE_TEMPLATE
    if state_path.exists():
        state = json.loads(state_path.read_text(encoding="utf-8"))
    state.setdefault("completed_rounds", [])
    state.setdefault("history", [])

    rnd = cfg.start_round
    if state["completed_rounds"]:
        rnd = max(state["completed_rounds"]) + 1
    budget = cfg.round.max_rounds
    print(f"═══ self-play loop · start round {rnd} · "
          f"{'unlimited' if budget == 0 else budget} iteration(s) · "
          f"student={cfg.endpoints.student_url} judge={cfg.endpoints.judge_url} "
          f"({cfg.endpoints.judge_model}) ═══")

    done = 0
    while budget == 0 or done < budget:
        print(f"\n┌─ round {rnd}  ({time.strftime('%Y-%m-%d %H:%M:%S')})")
        t0 = time.time()
        try:
            if "PLAY" in stages:
                print("│ 1/5 PLAY")
                play_dir = stage_play(cfg, rnd, dry)
            else:
                print("│ 1/5 PLAY (skipped)")
                # AUDIT reads what a previous PLAY wrote, so the path must still
                # be the one stage_play would have returned.
                play_dir = Path(cfg.paths.work_dir) / f"r{rnd}" / "play"
            if "AUDIT" in stages:
                print("│ 2/5 AUDIT")
                report = stage_audit(cfg, rnd, play_dir, dry)
            else:
                print("│ 2/5 AUDIT (skipped)")
                report = {k: 0 for k in ("sampled", "passed", "cheated", "killed",
                                         "judge_unreachable")}
            if "CORPUS" in stages:
                print("│ 3/5 CORPUS")
                train_f, val_f = stage_corpus(cfg, rnd, dry)
            else:
                print("│ 3/5 CORPUS (skipped)")
                train_f = val_f = None
            if "TRAIN" in stages:
                print("│ 4/5 TRAIN")
                model_dir = stage_train(cfg, rnd, train_f, val_f, dry)
            else:
                print("│ 4/5 TRAIN (skipped)")
                model_dir = None
            if "EXPORT" in stages:
                print("│ 5/5 EXPORT + REDEPLOY + PROMOTE")
                stage_hook("export", cfg.round.export_cmd, dry)
                stage_hook("redeploy", cfg.round.redeploy_cmd, dry)
                # Promotion runs LAST so it scores the adapter the two hooks above
                # just built and registered. Empty cmd = skip (no silent swap).
                stage_hook("promote", cfg.round.promote_cmd, dry)
            else:
                print("│ 5/5 EXPORT + REDEPLOY + PROMOTE (skipped)")
        except RuntimeError as e:
            print(f"└─ ❌ round {rnd} aborted: {e}")
            return 1
        except KeyboardInterrupt:
            print("\n└─ ⏹ interrupted — state saved, rerun to resume")
            return 130

        if dry:
            print(f"└─ (dry-run) round {rnd} planned — nothing written")
        elif "TRAIN" not in stages:
            # A round with no TRAIN produced no model, so it must NOT be marked
            # complete: recording it would advance the next run past a round
            # that never happened and silently skip a training pass.
            print(f"└─ ⚠️  round {rnd} ran without TRAIN — left out of state.json, "
                  f"so a full run still starts at round {rnd}")
        else:
            state["completed_rounds"].append(rnd)
            state["history"].append({
                "round": rnd, "model_dir": str(model_dir),
                "audit": {k: report[k] for k in
                          ("sampled", "passed", "cheated", "killed", "judge_unreachable")},
                "elapsed_s": round(time.time() - t0, 1),
            })
            state_path.parent.mkdir(parents=True, exist_ok=True)
            state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")
            print(f"└─ ✅ round {rnd} done in {time.time()-t0:.0f}s (state: {state_path})")
        rnd += 1
        done += 1

    print("\n═══ self-play loop complete ═══")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="VACA self-play orchestrator (round-based)")
    ap.add_argument("--config", default=None, help="path to selfplay.json")
    ap.add_argument("--rounds", type=int, default=None, help="override max_rounds")
    ap.add_argument("--start-round", type=int, default=None)
    ap.add_argument("--dry-run", action="store_true", help="print the plan, do nothing")
    ap.add_argument("--stages", default=None,
                    help="comma-separated subset of PLAY,AUDIT,CORPUS,TRAIN,EXPORT "
                         "(default: all). A run that omits TRAIN is not recorded in "
                         "state.json, so it never advances the round counter.")
    ap.add_argument("--init-config", action="store_true", help="write a default selfplay.json and exit")
    ap.add_argument("--scoreboard-port", type=int, default=0,
                    help="serve the live scoreboard on this port while the loop runs (0 = off)")
    args = ap.parse_args()

    if args.init_config:
        from .config import CONFIG_PATH
        p = save_config(SelfPlayConfig(), args.config or CONFIG_PATH)
        print(f"wrote default config → {p}")
        return 0

    cfg = load_config(args.config)
    if args.rounds is not None:
        cfg.round.max_rounds = args.rounds
    if args.start_round is not None:
        cfg.start_round = args.start_round

    if args.scoreboard_port:
        from .scoreboard import serve
        srv = serve(cfg, args.scoreboard_port)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        print(f"📺 scoreboard: http://127.0.0.1:{args.scoreboard_port}")

    return run(cfg, dry=args.dry_run, stages=parse_stages(args.stages))


if __name__ == "__main__":
    raise SystemExit(main())
