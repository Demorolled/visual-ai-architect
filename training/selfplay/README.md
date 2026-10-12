# VACA self-play trainer (rebuilt)

Round-based recreation of the original "Ornith system": the student is given
questions, makes judgment calls, is judged pass/fail, an anti-cheat auditor
makes sure it didn't game the questions, and the verified traces feed the next
QLoRA round — continuously.

```
       ┌──────────── AGENT (2× RTX 3060, 24 GB) ────────────┐
       │  puzzle_trainer.py  ← student plays for rewards     │
       │  train_student.py   ← 14B QLoRA round               │
       │  orchestrator.py    ← the loop                      │
       └───────────────┬────────────────────────────────────┘
                       │ HTTP (OpenAI-compatible)
       ┌───────────────▼──── SECOND BOX (1× RTX 3060, 12 GB) ┐
       │  Gemma 4 12B   ← judge / anti-cheat auditor         │
       │  nomic-embed-text ← RAG embeddings (CPU / 1660 Ti)  │
       └─────────────────────────────────────────────────────┘
```

## What survived vs. what this rebuilds

| Piece | Status |
|---|---|
| Play-to-train game, rewards, verdict/evidence grading, adaptive difficulty | ✅ survived — `scripts/puzzle_trainer.py` |
| Teacher-judged validation, tiered ladder, anti-collapse guardrails | ✅ survived — `curriculum/` |
| Judge → reward loop on the library | ✅ survived — `backend/scripts/reward-loop.ts` |
| 14B QLoRA recipe (sharded across cards) | ✅ survived — `scripts/train_r30_agent.py` |
| **The orchestrator tying it all into a continuous loop** | ❌ rebuilt here |
| **`training/` engine + datasets** | ❌ rebuilt here (`train_student.py` + pipeline) |

## The loop (one iteration = one "round")

1. **PLAY** — `puzzle_trainer.py` plays N rounds against the served student,
   banking reward-scored rows (`train-puzzle-*.jsonl`, `dpo-puzzle-*.jsonl`,
   `opt-puzzle-*.jsonl`). The game's grader is deterministic (no LLM needed).
2. **AUDIT** — `judge.py` runs mechanical anti-cheat on **every** row (echo,
   refusal, placeholder, repetition) and sends a **sample** to the Gemma-4-12B
   judge for the subjective slice. Cheating rows are killed; if configured,
   a high cheat rate halts the round instead of training on poison.
3. **CORPUS** — merge clean rows + a retention slice + the **VACA domain
   corpus** (below), dedup, split train/val into `corpus/r<NN>/`.
4. **TRAIN** — one 14B QLoRA round on 2× RTX 3060 (`train_student.py`).
5. **EXPORT / REDEPLOY** — optional merge→GGUF and model-swap hooks, then bump
   `NN`. Progress is in `work/state.json`, so a crash resumes.

## Teaching VACA itself (`vaca_domain.py`)

Self-play teaches *judgment*; it does not teach what VACA **is**. `vaca_domain.py`
mines the repo's own knowledge into a grounding corpus so the student knows the
machine it runs inside — and its own role in it:

```bash
python3 -m training.selfplay.vaca_domain          # build + coverage report
python3 -m training.selfplay.vaca_domain --report-only
```

Sources (all real artifacts, nothing invented):

| Facet | Mined from |
|---|---|
| `identity_role` | `LLM_ORIENTATION.md` (the "band"), `ai/prompts.ts`, `llm-config.json` |
| `canvas_nodes` | `data/component-manifest.json`, `library/01-node-architecture-reference.md` |
| `blueprint` | `backend/blueprints/*.json`, `data/designs.json` (goal → real node graph) |
| `app_templates` | manifest app types, hybrids, selection guide |
| `codegen_rules` | `library/03,05,06,07` + `knowledge/patterns.json` |
| `build_pipeline` | `layers/fileGenerator.ts`, `ai/deterministicFixers.ts` (real stage/error names) |
| `knowledge_learning` | `backend/knowledge`, `src/knowledge` |
| `export_deploy` | `src/export`, `library/09-deployment-templates.md` |
| `operations` | route modules, `package.json`, `Makefile` |
| `troubleshooting` | triage / evaluation / `NEXT_SESSION` reports |

Outputs, written in lockstep:
- `corpus/vaca-domain.jsonl` — strict Alpaca `{instruction, input, output}`
- `corpus/vaca-domain.meta.jsonl` — `{facet, source}` for the same lines
- `corpus/vaca-domain.coverage.{md,json}` — rows per facet vs. a target share
  that sums to 100, i.e. **how much of VACA is actually covered**

The coverage report is the honest part: it flags facets that are *starved*
(thin source material) instead of padding them with invented text. Raising the
score means writing/capturing more VACA behavior, not generating filler.

The corpus is re-included **every round** (`round.domain_mix`, default 1.0), so
self-play adds skill on top of VACA literacy rather than overwriting it.

## Judge model — why Gemma 4 12B

- Ornith-35B Q3 is **16.8 GB → does not fit** a 12 GB card; CPU offload is
  ~1 tok/s (why the old 27B teacher was abandoned).
- Gemma 4 12B 4-bit ≈ **8 GB → fits** with real context, ~34 tok/s, and is a
  **different family** from the Qwen student (independent judging).
- The hardest anti-cheat work is already **deterministic**, so the LLM judge
  only sees the subjective slice.
- Ornith-35B stays as an **offline auditor** (batch, when the agent is idle).

## Memory budget (4-bit QLoRA, seq 1024, batch 1, grad-checkpointing)

| Setup | Student VRAM | Verdict |
|---|---|---|
| 14B on 2× 12 GB | ~3 GB/card weights + activations ≈ 5–7 GB/card | ✅ the target |
| 14B seq 2048 | +activations | ⚠️ tighten card budget; test first |
| 14B seq 4096 | +activations | needs 3 cards (36 GB) |

`train_student.py` computes its layer split from `torch.cuda.device_count()`,
so it **re-flows automatically** to 1, 2, or 3 cards — a GPU swap only needs a
config change (`round.n_gpu_layers_cap_gb`, `round.max_seq_length`), not code.

## GPU-swap options (you offered to rearrange)

VRAM **cannot be pooled across machines or across vendors** for one model — a
swap only helps *within one CUDA machine*.

| Option | Effect |
|---|---|
| **Keep as-is** (2× 3060 agent + 1× 3060 judge) | Already sufficient. Student seq 1024–2048; judge Gemma-4-12B (8 GB) fits. **Recommended starting point.** |
| Move the judge box's 3060 → agent (**3× 3060 = 36 GB**) | Student gains headroom: seq 4096, or faster/less-sharded. Judge box then runs a 7B judge on the 1660 Ti (6 GB) or Gemma on CPU. |
| Put **all NVIDIA** in the agent | Fastest student, weakest judge. Only if you accept slower/ smaller judging. |
| AMD 5800XT (8 GB, ROCm) + 1660 Ti (6 GB) | **Cannot join the CUDA training process.** Use them as *separate* endpoints: embeddings, or a small second judge. |

Bottom line: the 2×3060 student + 1×3060 (Gemma-4-12B) judge split is enough to
run the loop today. Swap only if you want **longer context or faster rounds** —
then 3× 3060 in the agent is the one worthwhile change.

## Current wiring (2026-09-30)

The loop runs on the 1-GPU judge box for now, with the student served by
**Ollama instead of dspark**. One `ollama serve` already holds both models and
will evict one to load the other, which is exactly what lets a 14B student and
a 12B judge share a single 12 GB card across the PLAY → AUDIT boundary.

| Role | Endpoint | Model |
|---|---|---|
| Student | `http://127.0.0.1:11434/v1` | `vaca-r20-q4` (built via `models/Modelfile-r20`) |
| Judge / auditor | `http://127.0.0.1:11434/v1` | `gemma4:12b` |
| Embeddings | `http://192.168.1.234:11434` | `nomic-embed-text` — the agent box has it, this box does not |

**TRAIN is the one stage this box cannot run.** `prepare_model_for_kbit_training`
upcasts every fp16 parameter to fp32; the 14B's embedding + lm_head are 1.56B
params, so that is +3.1 GB, and it OOMs *inside* prepare beside a 9.25 GB 4-bit
model (~1 GB free) before a single step runs. `--card-gb` only changes where the
offload lands. Everything else can be exercised here with `--stages`, which also
keeps a partial round honest: a run that omits TRAIN is deliberately **not**
recorded in `work/state.json`, so it can never advance the round counter past a
round that was never trained.

```bash
# a complete round minus the one stage that needs the 2x3060 box
python3 -m training.selfplay.orchestrator --stages PLAY,AUDIT,CORPUS --rounds 1
```

### `puzzle_trainer.py` is interactive by design

At its round limit it does **not** exit — it idles in a 1-second loop waiting for
a human to click "Extend rounds" on the live scoreboard. That is correct when
`--status-port` is serving the page, and a deadlock when it is not, because
`stage_play()` calls it with plain `subprocess.call` and waits for exit. It now
returns instead of waiting when no scoreboard is being served.

Symptom to recognise: the round stops writing files, `ollama ps` is empty, the
process burns no CPU, and it sits in `hrtimer_nanosleep` with no open sockets.

## Usage

```bash
# 1. write the default config (edit endpoints for the second box)
python3 -m training.selfplay.orchestrator --init-config

# 2. preview the whole plan without touching GPU/network
python3 -m training.selfplay.orchestrator --dry-run --rounds 1

# 3. run the loop (one iteration)
python3 -m training.selfplay.orchestrator --rounds 1

# 3b. everything except TRAIN — for a box that cannot fit the 14B
python3 -m training.selfplay.orchestrator --stages PLAY,AUDIT,CORPUS --rounds 1

# manual stages
python3 scripts/puzzle_trainer.py --self-test          # verify puzzles
<train_python> training/selfplay/train_student.py --data corpus/r1/train.jsonl \
    --val corpus/r1/val.jsonl --out models/r1 --seq 1024 --dry-run
```

Config lives in `training/selfplay/selfplay.json`. Point `endpoints.judge_url`
at the second box (e.g. `http://192.168.1.234:11434/v1`) and
`endpoints.student_url` at the agent's served student.

## Scoreboard and start button

```bash
./scripts/vaca-trainer.sh menu        # what the Desktop icon runs
./scripts/vaca-trainer.sh start       # scoreboard + training loop
./scripts/vaca-trainer.sh scoreboard  # dashboard only, opens the browser
./scripts/vaca-trainer.sh doctor      # gpus / python env / endpoints
python3 -m training.selfplay.scoreboard --port 8300
```

The dashboard (`scoreboard.py`) is a read-only aggregator over the on-disk
artifacts, so it shows pass / fail / cheating caught / rows learned / DPO
corrections / tune-up improvements / the live loop log, **and exactly what the
next round is training on** (row counts, source mix, sample rows). It survives
restarts and works while a round is mid-flight. Logs: `training/selfplay/logs/`.

Set `TRAIN_HOST=user@host` to drive a different machine (the agent box) from
this one over ssh; leave it empty to run locally.
