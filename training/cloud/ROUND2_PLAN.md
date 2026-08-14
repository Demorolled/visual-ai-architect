# Round-2 Re-tune Plan — Break the Delegation Habit

**Status:** Ready to run · **Dataset:** Updated (2026-08-01) · **Last round-1 export:** GGUF round-1 tuned

---

## 1. The problem (measured)

The A/B harness (`scripts/ab-test-tuned-vs-stock.py`) showed the **round-1 tuned model
reliably emits a sibling-module import + `export default`** — a thin delegating facade —
even when the instruction explicitly forbids imports and demands named exports only:

| Run | TUNED (round-1 GGUF) output |
|---|---|
| 1 | `import { TimerService } from '../timer-service/...'` + `export default` |
| 2 | `import ... from '../display/display.ts'` (delegation) |
| 3 | thin `TimerService`-forwarding facade, 534 chars, `export default` |

Tuned output was always **valid TS** (tsc PASS) — the issue is contract compliance, not
syntax. STOCK output was invalid TS (markdown fence + syntax garbage), so the delegation
habit is a *round-1 tuning artifact*, not a base-model trait.

## 2. Root cause (found 2026-08-01)

Scan of `training/dataset/campaign50-corrected.jsonl` (the round-1 teaching signal):

- **129 of 215 rows (60%) contain a substantive sibling import and/or `export default`**
  — 100 rows with substantive imports, 53 with default exports.
- Examples: `timer-ui` → `import { AlarmState, CountdownTimer } from '../alarm-handler/...'`;
  `countdown-engine` → `export default CountdownEngine;`.

**The model was trained on examples of the exact behavior we want to kill.** Prompt-only
tightening (A/B INSTRUCTION) did not stop it — the habit is baked into the weights.

## 3. What changed (this round of fixes)

1. **New: `scripts/build-self-contained-corrected.py`** → writes
   `training/dataset/self-contained-corrected.jsonl` — 5 hand-written, tsc-clean,
   **fully self-contained** Countdown Timer node examples (`countdown-engine`,
   `timer-input`, `state-store`, `alarm-handler`, `timer-ui`):
   - zero imports (guard: `^\s*import\b`)
   - named exports only (no `export default`)
   - no JSX (DOM via `document.createElement`)
   - browser-native types (`number` timer ids, not `NodeJS.Timeout`)
   - real error handling + edge cases (negative/zero durations, double start/stop,
     completing at zero)
   - instruction text mirrors the tightened A/B harness INSTRUCTION (node name inlined)
2. **Patched: `scripts/merge-campaign50-into-dataset.py`** — `self-contained-corrected.jsonl`
   joins the pool as a priority source (dedupe order: campaign → **self-contained** →
   captured → vaca → existing); all 5 rows guaranteed into train.
3. **Merged** (after the sweep) → train 3297 / val 412 / test 413 / **total 4122**;
   backups under `training/dataset/backup-*/`; `dataset_meta.json` updated with the new
   source.
4. **Validated:** all 5 corrected outputs pass the tightened A/B gate
   (`analyze()` + `tsc_check()` → PASS on every row).

## 4. Round-2 re-tune (how to run)

**Honest caveat (reviewer-flagged):** 5 good examples vs 129 still-bad campaign rows
(which remain priority training rows) is a *weak signal ratio*. Round 2 is expected to
improve, not guarantee, the behavior. The acceptance bar below decides.

### Config — Colab notebook (`training/cloud/colab/train_vaca_colab.ipynb`)

Use the **`round2` mode** — resumes from the **round-1 adapter** at the next LR in the
ladder. No change to the LR scheme is needed; the ladder already does
`2e-4 → 1e-4 → 5e-5 → 2.5e-5`.

| Setting | Value |
|---|---|
| `MODE` | `"round2"` (start-round 2, LR 1e-4, `--load-adapter` = round-1 adapter) |
| `ROUNDS` | `1` on free tier (2 on Pro) |
| `USE_DRIVE` | `True` (or upload when prompted) |
| Data zip | **rebuild** with the new `train.jsonl` (dataset now 4,122 rows — `scripts/build-colab-dataset-zip.py`) |
| Adapter zip | `results.zip` / `adapter_round1/` from the completed round-1 run |
| Epochs | 2 · seq len 2048 · LoRA r8/α16/d0.05 · batch 1 / accum 8 (unchanged) |

Steps: 1) rebuild the campaign dataset zip from `training/dataset/train.jsonl`;
2) upload zip + round-1 `results.zip`; 3) set `MODE="round2"`; 4) run. Expected on T4:
one round ≈ 8–12 h (free-tier session cap applies — same caveat as round 1).

### ⚠️ Manual settings (API-push only)

Kaggle API pushes ignore GPU/Internet settings — in the **web UI** after push: **Settings →
Accelerator = GPU T4 x2 + Internet = On**. Not applicable to Colab (internet always on).

## 5. Acceptance test (decides whether round 2 worked)

Re-run the A/B harness after export & re-deploy:

```bash
python3 scripts/ab-test-tuned-vs-stock.py
```

**PASS = tuned output must show:**
- `tsc: PASS` (only benign env errors allowed)
- **no** `SUBSTANTIVE-IMPORTS ✗` flag (zero substantive imports)
- **no** `DEFAULT-EXPORT ✗` flag
- no `PROSE ✗`, no `JSX-in-ts ✗`, no `STUB ✗`

Run 3× (the harness is 1 generation/run) — **2 of 3 runs fully PASS** = habit broken.
Report the verdict table back here.

**Scope note:** the A/B harness's fixed prompt only exercises the `countdown-engine`
node — so "habit broken" is proven for that node specifically. The other 4 corrected
nodes (`timer-input`, `state-store`, `alarm-handler`, `timer-ui`) are validated at
train time (all 5 outputs PASS the gate) but aren't re-checked at inference until the
harness or a sweep covers them.

## 6. Follow-up sweep — EXECUTED (2026-08-01)

✅ The sweep is built into `scripts/build-self-contained-corrected.py` and has run:

**Result: 20 of 129 flagged rows mechanically rescued → 25 self-contained rows total**
(5 hand-written seeds + 20 swept). Transform pipeline per flagged row: strip
unused/side-effect imports → depth-1 inline used sibling imports from
`backend/exports/campaign50` → convert `export default` (inline/trailing/anonymous
named from node) → `NodeJS.*` → `number` → **re-validate with the tightened A/B gate**
(0 imports, no default export, no JSX/stub/prose, ≥1 named export, tsc PASS). Only
gate-passing rows are written; the rest land in `training/dataset/sweep-report.json`
as `needs-hand-write` with per-row reasons.

**Honest ceiling — the remaining ~150 rows cannot be mechanically fixed:** the
inlined reference siblings are themselves broken TS (145/150 fail tsc with
TS2304/TS7053/TS1005/TS2552…; 27 have no usable export, 13 still default-export,
8 prose, 2 stubs, 1 JSX). Round-1's "corrected" file was never tsc-gated, so most
of the delegation rows are simply bad TypeScript. Fixing them is **hand-write work**
using `sweep-report.json` as the backlog (or regenerating those nodes with the
*base* model + gate, since the base model at least emits valid TS).

**Dataset now:** train 3,297 / total 4,122 — self-contained rows are a priority
source (25 guaranteed in train), improving the good:bad teaching ratio but NOT
inverting it. Round 2's acceptance bar (2/3 A/B runs clean) is still the decision
point; the sweep alone is not expected to fully break the habit.

## 7. Quick reference

- Build corrected rows (seeds + sweep): `python3 scripts/build-self-contained-corrected.py`
- Hand-write backlog: `training/dataset/sweep-report.json` (per-row flags + tsc)
- Re-merge dataset: `python3 scripts/merge-campaign50-into-dataset.py`
- Validate gate: import `ab-test-tuned-vs-stock.py` → `analyze()` + `tsc_check()` per row
- Deploy tuned GGUF locally: `scripts/deploy-tuned-dspark.sh` flow (dspark :8000)
