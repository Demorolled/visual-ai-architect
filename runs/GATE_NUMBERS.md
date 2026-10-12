# Acceptance-gate numbers — authoritative record

**Corrected 2026-10-02.** The acceptance checker had a bug that produced ~20 points
of FALSE FAILURES on every arm. Every gate figure recorded before this file is
wrong (the ranking mostly survived, the absolute values did not). This file is the
source of truth; the JSON artifacts listed at the bottom are historical.

## The bug

`scripts/acceptance_check.mjs` injected `declare module "*";` as an ambient
wildcard "so imports are `any`". An ambient wildcard has no exports, so
TypeScript instead types every **named** import from it as a *namespace*, and a
namespace cannot be used as a type:

```
import { Cheese } from './entities/cheese';
foo: Cheese            // TS2709: Cannot use namespace 'Cheese' as a type
```

That is correct code, and it FAILED. Per-file effect, measured directly:

| shim | counted errors | verdict |
|---|---|---|
| `declare module "*"` (as shipped) | 2 (TS2709) | FAIL |
| deleted (TS2307 is already in IGNORE_CODES) | 0 | PASS |

TS2709 was the single largest error class in the gate (127 hits across 50 of the
197 baseline files), so this dominated the score. **Fixed**: the wildcard is gone
and there is a comment saying not to reintroduce it.

**A second, unrelated bug** was fixed in the same pass: injected scaffolds end with
an unterminated fenced code example, which the completion model *continues* instead
of writing the file (23/197 outputs were class-body fragments). `trimScaffold()`
(`backend/src/ai/scaffolder.ts`, mirrored in `scripts/eval_acceptance.py` as
`trim_scaffold` / `--trim-scaffolds`) strips code + prose and keeps only the
exports/types contract. It removed 23/23 fragments.

## Corrected vs recorded — isolated code mode, 197 tasks

Same run, same outputs, re-scored with the fixed checker (no re-generation):

| arm | tag | corrected | as recorded (shim) |
|---|---|---|---|
| distill (incumbent) | `vaca-r40-off-distill-adapter:latest` | **149/197 = 0.7563** | 110/197 = 0.5584 |
| nogrpo | `vaca-r40-off-nogrpo-adapter:latest` | **114/197 = 0.5787** | 69/197 = 0.3503 |
| distill + FULL (untrimmed) scaffold | same distill tag | **131/197 = 0.6650** | 102/197 = 0.5178 |

- The **decision is unchanged**: distill beats nogrpo by **Δ +0.178** (was recorded
  as +0.208). Both figures are far outside the noise band below.
- The earlier, pre-decontamination run (recorded 0.325 / 0.523) cannot be
  re-scored — its saved batches were overwritten by the decontaminated run. It is
  superseded and should not be cited.
- The **scaffold role gate** (`--role scaffold`) is prose-only and never loads
  TypeScript, so it is *unaffected* by this bug. Its calibration numbers stand.

## Same-session A/B — the trim, both modes

Both arms generated in one session, both scored with the fixed checker:

| arm | isolated (code mode) | in context (app mode) |
|---|---|---|
| baseline, no scaffold | **147/197 = 0.7462** | **131/197 = 0.6650** |
| trimmed scaffold | **140/197 = 0.7107** | **113/197 = 0.5736** |
| GOLD reference (real shipped files) | — | 137/197 = 0.6954 |

**The scaffold step is a net negative in both modes**, and *worse* in context
(−9.1pp) than in isolation (−3.6pp) — its intended benefit (cross-file
consistency) does not appear.

**The scaffold LLM step was therefore REMOVED (2026-10-02).** The role, runtime
step, injection points, config flag, training wiring, row builder and data are
gone from the tree; the removed files are preserved verbatim in
`runs/scaffold-ab/removed/` (see `REMOVAL.md`). `--recheck` and the `app` mode are
kept — both are general, not scaffold-specific.

Note the healthy result: the baseline in app mode (0.6650) is close to the real
gold reference (0.6954), i.e. in context the model nearly matches the shipped app.

## Noise band — read every small effect against this

Identical invocation (temp 0, seed 42), two full runs: **147 vs 149 files passed
(±2 = ±1pp)**, while **38/197 generated files differed in text**. Two instances on
the same box are reproducible (20/20), but `--workers 1` vs `--workers 2` differ on
**25%** of files — output depends on server batching/timing. So:

- effects under ~4pp are not readable from a single run;
- always compare arms generated in the same session with the same `--workers`.

## App mode (new) — the only mode that can see cross-file behaviour

`--role app` stages the generated file over a copy of its real export dir and
typechecks the whole app, counting only diagnostics in the subject file. Data
available: 197/197 export dirs present, 188 with every planned file.

**Caveat: the GOLD ceiling is only 137/197 (0.6954)** — the shipped reference does
not compile in context ~30% of the time (corpus/context artifacts), so app mode has
a 30% dead band. Useful for relative comparison, not as an absolute grade.

## Re-scoring after a checker change

Never re-generate to re-score. `eval_acceptance.py` grows `--recheck`, which scores
the saved `batch-<name>.json` in `--workdir` with the current checker:

```bash
python3 scripts/eval_acceptance.py --recheck --role completion \
  --model baseline_noscaffold=vaca-r40-off-distill-adapter:latest \
  --model distilled=vaca-r40-off-distill-adapter:latest --out runs/x.json
```

## Historical artifacts (contaminated — do not cite)

`runs/acceptance-completion.json`, `runs/acceptance-completion-decon.json`,
`runs/acceptance-completion-scaffold.json`, `runs/acceptance-scaffold.json`,
`runs/acceptance-scaffold-calib.json`, `runs/adapters-decon.json`,
`runs/promotion-completion-20261002-134517.json` (also only 3 tasks).

Corrected copies and the raw evidence live in **`runs/scaffold-ab/`**
(`summary.json` holds every corrected figure, plus the gold ceiling).

## Not a decision

`scripts/promote-adapter.py` was smoke-tested on the fixed checker (KEEP incumbent
in every run) to prove the tool still works. Those smoke runs produced no retained
artifact; the promotion decision record is the full 197-task comparison above.
