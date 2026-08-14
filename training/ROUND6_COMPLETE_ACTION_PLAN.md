# Round-6 Post-Training Action Plan — Validation, Deploy & Data Loop

> **Status:** PLANNED — everything below is gated on the Kaggle round-6 kernel
> completing (`stevenawoods/vaca-qlora-round6`, ~89% at last check, ETA ~1h).
> The pieces that can be built NOW are marked ✅; the rest run automatically
> when training finishes.
>
> **Why this plan exists:** round-4 regressed blueprint fidelity 59.0 → 45.9%
> by overfitting 25 failures. Round-6 was built to reverse that (33 fidelity-fix
> rows + 20 alias-normalization rows + 1,808 bible→code rows). This plan makes
> the *verification* as rigorous as the training, so a regression like round-4's
> is caught before the tuned GGUF gets deployed to DSpark (the live model).

---

## 1. Round-6 completion — already automated (no action needed)

| Step | Trigger | Action | Status |
|---|---|---|---|
| Kernel completes | Kaggle worker exit | `kaggle-watch-round6.sh` (polling every 10 min) downloads the output | ✅ armed (PID + log in `data/watch-round6.log`) |
| Adapter lands | download finishes | `training/cloud/out/round6-adapter/` (adapter_config.json + weights) | auto |
| Loss curve archived | watcher polls | `data/round6-loss-curve.json` + 95%/final snapshots | ✅ `kaggle-round6-loss-watch.py` armed |

**If the watcher died** (crash/laptop restart): `bash scripts/kaggle-watch-round6.sh`
is idempotent — it detects the existing adapter and exits 0, or resumes polling.

---

## 2. Round-6 validation gate (BLOCKED on adapter) — the critical step

The adapter is **not** trusted until it passes these. Round-4's lesson: the
checkpoint that looks good on paper can still regress the live model.

### Step 2.1 — Adapter → GGUF export  (adapt scripts/launch-qlora-round4-failures.py)
```bash
# To-be-created: scripts/launch-qlora-round6.py (clone the round-4 runner, point
# it at the round-6 adapter dir). From the round-6 notebook environment
# (Colab/Kaggle) OR locally if VRAM allows:
python scripts/launch-qlora-round6.py --resume training/cloud/out/round6-adapter --export q4_k_m
```
Expected: `models/Qwen2.5-7B-Instruct-Uncensored.R6.Q4_K_M.gguf` (~4.4 GB),
or the adapter is exported in the Kaggle notebook itself before download (then
skip this step).

### Step 2.2 — Blueprint fidelity on the NEW GGUF  (BLOCKED on export)
```bash
# 1. Deploy to a STAGING port first (never the live :8000 before measurement)
DSPARK_PORT=8001 bash scripts/start-dspark.sh   # point dspark-target.env at the R6 GGUF

# 2. Full 61-prompt fidelity run (same harness that measured 45.9%)
python3 scripts/validate-blueprint-fidelity.py --all
```
**Pass criteria (all three):**
| Metric | Round-6 target | Round-4 measured | Gate |
|---|---|---|---|
| Parse rate | ≥ 97% | 96.7% | ≥ baseline |
| Known app_type | **≥ 85%** | 75.4% | +10 pts |
| Full fidelity | **≥ 60%** | 45.9% | +15 pts |
| Alias inventions (`_lab`/`_generator`) | **0** | present | hard 0 |

⚠️ **Regression check first:** run the same 61 prompts against the *current*
live model on :8000 (it's the round-4 GGUF) and diff case-by-case. If the R6
model is *worse* on held-out prompts, do NOT deploy — that's round-4 repeat.

### Step 2.3 — Deploy to live DSpark  (only after 2.2 passes)
```bash
bash scripts/deploy-tuned-dspark.sh --now models/Qwen2.5-7B-Instruct-Uncensored.R6.Q4_K_M.gguf
curl -s http://127.0.0.1:8000/v1/health   # verify model identity + tokens/sec
```

### Step 2.4 — Post-deploy smoke (same session, ~30 min)
```bash
# Re-run the fidelity check against the LIVE endpoint to confirm the staged
# result held after restart (quantization/context drift check):
python3 scripts/validate-blueprint-fidelity.py --limit 20
```
Plus one real `plan-code → write-code` flow (chess request) to confirm the
interactive path works end-to-end with the new model — the tsc gate now in
`codePlanner.ts` will report `tscErrors`/`contractViolations` in the response,
which is exactly the signal to watch.

---

## 3. Training-data loop (roadmap Phase 2) — partially BLOCKED

The **capture half is already live** and does NOT wait for training:
- ✅ Every `write-code` / `interactive` generation drops a `_training.json`
  sidecar (request + intent + questions/answers + plan + libraryContext).
- ✅ `captureVerifiedSidecar()` folds tsc-clean exports into
  `training/dataset/verified-generations.jsonl` in real time.
- ✅ `scripts/capture-verified-pairs.py` is the Python gate (tsc + stub/JSX/
  prose filters) → `captured-verified.jsonl`.

### The BLOCKED half — merge & re-split (needs a stable checkpoint)
```bash
# 1. After round-6 deploys, freeze the dataset snapshot
cp training/dataset/train.jsonl data/backup-train-round6.jsonl

# 2. Merge the newly verified rows (existing script, campaign-50 pattern)
python3 scripts/merge-campaign50-into-dataset.py --with verified-generations.jsonl

# 3. Re-split + regenerate stats (keeps eval hygiene: round-6 val/test excluded
#    from train; document any intentional in-train rows like the fidelity fixes)
python3 scripts/restore-dataset-meta.py && python3 scripts/build-vaca-knowledge-dataset.py
```
**Round-7 dataset composition (target):**
| Source | Rows | Why |
|---|---|---|
| Existing train pool | ~3,459 | retain general knowledge |
| New verified generations | grows with usage | every corrected app becomes a pair |
| Round-6 failures (if any) | new scan | the error-fix round pattern |
| Fidelity-fix retention | keep | don't unlearn the 33 fixes |

**Gate before round-7 launch:** `validate-blueprint-fidelity.py --all` on the
round-6 model must still pass §2.2 after the merge — the merge must never
change the eval set's *holdout* status.

---

## 4. What can be done RIGHT NOW (not blocked)

| Item | Effort | Status |
|---|---|---|
| **Post-write contract verifier** (Phase 1 closure) — scans GENERATED code vs declared exports/imports, repairs drift | 1–2 days | ✅ **DONE** (`verifyGeneratedContracts` in `codePlanner.ts`) |
| **Partial one-shot acceptance gate** (roadmap 1b) — a 1-of-4 write now fills the missing files per-file instead of silently "succeeding" | 0.5–1 day | ✅ **DONE** (`findMissingPlannedFiles` + `finalizeGeneratedFiles`) |
| **In-route tsc gate** (Phase 5) — one-shot/per-file paths now write→tsc→repair→re-check, same as chunked | 1–2 days | ✅ **DONE** (`finalizeGeneratedFiles` tsc loop) |
| **Edge-density enforcement** — architect/rework auto-add standard dependency chain when < 0.3 edges/node | 15 min | ✅ **DONE** (`enforceEdgeDensity` in `architect.ts`) |
| Run the A/B harness on the new gates | ~30 min | do after round-6 deploy (needs the new model to be meaningful) |

**Validation status of the shipped code:** backend `tsc --noEmit` clean ·
**830/830 tests pass** (48 files) · new tests: `enforceEdgeDensity` (5),
`verifyGeneratedContracts` (5), `findMissingPlannedFiles` (3).

---

## 5. Decision matrix if round-6 regresses (the round-4 trap)

| Symptom | Decision |
|---|---|
| Fidelity < 60% but ≥ 45.9% | Deploy — still a net improvement, log the delta |
| Fidelity < 45.9% on held-out | **Do NOT deploy** — keep round-4 GGUF live; investigate dataset leakage (check `round6-stats.json` eval_leakage) |
| Alias app_types reappear | Hard fail — the 20 normalization rows didn't take; add more + train again |
| Live :8000 slower than ~50 tps | Compare vs `data/benchmark-dspark.json`; speculative decoding is within noise anyway |

---

*Created 2026-08-07 · Companion to `ROUND6_TRAINING_RUNBOOK.md` (training config) and `INTENT_UPGRADE_PLAN.md` (roadmap Phases 1–6).*
