# ROUND 2 — Contract Fidelity LoRA Plan

**Date:** 2026-08-05 · **Goal:** stop the tuned model from inventing members beyond
declared sibling exports (the failure that broke chess builds 1–3 and showed up
again in `data/ab-test-chess-pipeline/`).

## Why this round

The round-1 model (340 steps, 3,262 examples) fixed *formatting* (0 fences / 0 prose
at temp 0.7) but still drifts on *contracts* under real pipeline prompts:

```
board.isCheckmate()   ← not in the whitelist
board.evaluate()      ← not in the whitelist
board.makeMove()      ← not in the whitelist
(board.render/undoMove/getStatus/resetGame — UI variant)
+ forgot to export `render` at all (preview wrapper would fail)
```

Root cause hypothesis: the round-1 data taught "produce clean code", but the model
never learned "only touch the members the sibling file declares". This round is a
small, focused, high-signal dataset that teaches exactly that rule.

## Dataset

| artifact | file | notes |
|---|---|---|
| builder | `scripts/build-contract-fidelity-dataset.py` | deterministic, seeded 42 |
| train | `training/dataset/contract-fidelity.jsonl` | 17 examples |
| val / test | `contract-fidelity-val.jsonl` / `-test.jsonl` | 3 + 3 |
| meta | `contract-fidelity-meta.json` | stats |

**Content** (16 domains, TS + Go + Python):
- Every `input` lists the sibling contract with an explicit **member whitelist**
  (`class ChessBoard { getPiece, setPiece, clone, toState }` — not just the class name).
- Every `output` uses **only** whitelisted members. The star lessons:
  - **makeMove implemented locally** via `clone()` + `setPiece()` — never `board.makeMove()`.
  - **checkmate implemented locally** from `isKingInCheck` + move iteration.
  - **UI files export a named `render`/`init`** and build DOM with `document.createElement` only.
  - **Repair example** mirroring the real `fixSection` (TSC errors fed back, fixed output).
  - **Go/Python variants** teach the same rule cross-language (Go: local `errOrder` type
    instead of `import "errors"` — no imports allowed at all).
- **Validation:** `python3 scripts/build-contract-fidelity-dataset.py --validate`
  → lint clean (no fences/imports/export-default/TODO/JSX) **and** all 5 chess outputs
  compile `tsc --noEmit --strict` against the real chess scaffolds from the A/B.
- Fits well inside `max_seq_length=2048` (max ~850 tokens).

## Training config (QLoRA, same recipe as round 1)

```
base:             Orion-zhen/Qwen2.5-7B-Instruct-Uncensored  (matches served GGUF)
quantization:     4bit (NF4) + LoRA r=8 α=16 dropout 0.05 + adamw_8bit
rounds/epochs:    1 round · 2 epochs   (small set — single pass, lr 2e-4)
max_seq_length:   2048 · batch 1 · grad_accum 8 · warmup 0.03 · wd 0.01 · max_grad_norm 0.3
gguf export:      q4_k_m (automatic at end of train())
mixing:           default VACA_MIX=300 → blends 17 contract + 300 seeded existing
                  examples to PREVENT catastrophic forgetting of round-1 formatting.
                  VACA_MIX=0 → pure contract round if you want max signal.
```

### Run it

```bash
# 1. Stop dspark (uses both GPUs; pick the right one for your GPU layout)
bash scripts/start-dspark.sh --stop

# 2. Dual GPU (recommended):
torchrun --standalone --nproc_per_node=2 scripts/launch-qlora-contract-round2.py
# Single GPU (dspark can stay on GPU 0):
VACA_TRAIN_GPU=1 python3 scripts/launch-qlora-contract-round2.py

# 3. Expected outputs in training/gui_trainer/models/ :
#    merged_model/, adapter/, and a new *.gguf (q4_k_m)
```

## Deploy

```bash
# 4. Deploy the new GGUF to dspark (script picks newest GGUF; or pin it):
bash scripts/deploy-tuned-dspark.sh --now training/gui_trainer/models/<new-model>.gguf

# 5. Restart the backend so the translator picks up dspark again:
tmux kill-session -t vaca-backend 2>/dev/null
tmux new-session -d -s vaca-backend \
  'cd /home/final-flash1/Desktop/visual-ai-architect/backend && exec npx tsx src/index.ts > /tmp/vaca-backend.log 2>&1'
curl -s http://localhost:3001/api/config/llm   # expect dspark / qwen2.5-7b-instruct-uncensored-dspark
```

## Evaluation gate (the important part)

Re-run the pipeline-conditions A/B against the round-2 model. The metric that
must improve is **invented-member count**, while formatting stays clean:

```bash
# engine node + ui node under the REAL fileGenerator prompt, temp 0.7
python3 scripts/ab-pipeline-chess.py tuned engine
python3 scripts/ab-pipeline-chess.py tuned ui
```

**Pass criteria (per task):**
- Formatting gates hold: `fences=0`, `overesc=0`, `prose_leak=0` (regression guard).
- Contract drift drops vs round 1: engine 7 → **≤ 2** tsc errors, ui 8 → **≤ 2**.
- The engine exports `getBestMove` and the UI exports `render` (no missing exports).
- (Nice-to-have) functional test passes: engine finds the hanging-queen capture.

Compare against the round-1 baselines recorded in
`data/ab-test-chess-pipeline/SUMMARY.md` (tuned engine 7 errors / ui 8 errors).

## Rollback

If the round-2 model regresses (formatting worsens or drift persists), the old
round-1 GGUF is still on disk — redeploy it and restart dspark:

```bash
bash scripts/deploy-tuned-dspark.sh --now models/Qwen2.5-7B-Instruct-Uncensored.Q4_K_M.gguf
```

## ⚡ Round-2 RUN RESULTS (2026-08-05, executed)

Trained: 17 contract + 300 mixed examples, 1 round × 2 epochs, loss 1.1455→0.9812.
Same known crash as round 1 at the FINAL checkpoint save (PicklingError on trl
SFTConfig) — the trained adapter survived in `checkpoint-36/` and was recovered
via `scripts/recover-checkpoint-gguf.py` → q4_k_m GGUF (4.68 GB) → deployed to
dspark (hash f3cc9061…, verified serving) → backend restarted → smoke test passed.

### A/B vs round 1 (real pipeline prompt, temp 0.7, 2 samples)

| metric | round 1 | round 2 s1 | round 2 s2 |
|---|---|---|---|
| engine fences/overesc/todos | 0/0/0 | 0/0/0 | 0/0/0 |
| engine tsc errors | 7 (5 invented members) | 11 (ALL TS2304 undefined local helpers) | 18 (mixed: invented member + type errors) |
| ui tsc errors | 8 | 5 | 5 |
| ui exports `render` | ❌ NONE | ✅ | ✅ |

**What improved:** UI now reliably exports a named `render` (round 1 exported
nothing → preview would fail). Formatting discipline held at temp 0.7. Engine
sample 1 eliminated invented board members entirely (0× TS2339) — the failure
became *undefined local helpers* (referenced `evaluateBoard`/`makeMove`/`createCopy`
as local functions the file never defined — a completeness bug, not a contract bug).

**What remains:** invented members still reappear under temp 0.7 (engine s2: 1×
`board.makeMove` TS2339) and files are sometimes incomplete (sample variance is
high at temp 0.7). The numeric pass bar (engine ≤2 / ui ≤2 errors) was NOT met.

**Verdict:** the 23-example dataset moved behavior in the right direction
(export contracts + local-helper planning learned) but did not fully erase the
7B contract wall at temp 0.7. The complementary **member-whitelist prompt fix**
in `fileGenerator.ts` is still recommended as the enforcement layer.

## Risks & mitigations

| risk | mitigation |
|---|---|
| catastrophic forgetting of formatting | VACA_MIX=300 seeded existing examples (default) |
| overfit to 17 examples | 2 epochs max, 1 round, lr 2e-4 decay pattern; A/B gate before deploy |
| invented members persist (7B capability wall) | then ship the **member-whitelist prompt fix** in `fileGenerator.ts` (inject declared members into the prompt) — the dataset still helps, the prompt fix enforces |
