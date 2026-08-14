# VACA Build-Ladder Operator

Builds **55 real apps** (20 simple / 10 hard / 25 extreme) through the live VACA
pipeline, full-tests each one, repairs failures, and records everything into a
training dataset + a datasheet of fixes for the next LLM round.

## Flow per build

```
plan-code → write-code → test (tester.py) →
  PASS  → record training row, archive _training.json, delete export
  FAIL  → deterministic fixes (auto __main__, attr-rename) → retest
        → repair loop: re-write with the failure + ACTUAL OUTPUT fed back
          (up to 2 rounds) → retest → record corrections in the datasheet
```

## Files

| File | Role |
|---|---|
| `manifest.py` | 55 build specs, each with deterministic acceptance criteria |
| `tester.py` | acceptance tester: run python / node server / web (Playwright) |
| `run_operator.py` | main loop (resumable via `state.json`) |
| `restart_backend.sh` | backend restart helper (infra-outage resilience) |
| `state.json` | resume state (created on first run) |
| `summary.json` | progress snapshot |
| `dataset/round9-buildladder.jsonl` | **next-round training dataset** (VACA request → corrected code) |
| `datasheet-fixes.jsonl` | **permanent fix store** (error → diagnosis → corrected output) |
| `dataset/training/` | archived VACA `_training.json` per build |
| `dataset/failed/<id>/` | kept exports for builds that never passed |

## Usage

```bash
# run the whole ladder (resumes automatically from state.json)
python3 training/operator/run_operator.py

# single build, re-test even if done
python3 training/operator/run_operator.py --id s01 --force
python3 training/operator/run_operator.py --id h07 --reset --force   # reset then re-run

# level filter / cap / debug
python3 training/operator/run_operator.py --only simple --max 5 --no-repair --keep-exports
```

Requires the VACA backend on `:3001` with the LLM up.

⚠️ **Single-invocation rule:** run ONE operator process at a time — `state.json`
is whole-file rewritten, so concurrent invocations can lose each other's
updates. Kill the ladder before doing a `--force` single-build re-run.

## VACA fixes the ladder surfaced (already applied)

1. **Single-file planner constraint** (`codePlanner.ts`): requests naming one file
   ("a python script named main.py") now plan exactly that file, and the entry
   must actually run (`__main__` guard / top-level call). Fixed the s10/s18
   "defines but never calls" class.
2. **Infra resilience** (`run_operator.py`): connection-level failures now
   restart the backend and retry (up to 3×) instead of nuking the ladder.
3. **Deterministic zero-LLM fixes** (`run_operator.py`): auto-append a missing
   `__main__` call; apply CPython's AttributeError "Did you mean" rename.
4. **Repair notes include the ACTUAL output** — a bare "missing expected
   output" made the model re-roll blind (h04 fixed itself once given its own
   output).
5. **Tester tolerance**: multi-variant stdin (A-D vs 1-4 answers), multi-variant
   CLI args, PYTHONPATH for nested-`src/` imports, regex acceptance, page-error
   capture for web apps.

## Known model weakness (recorded for the next round)

- **Password managers (h07)**: the 7B regenerates a NEW random salt on every
  `hash_password` call, so store-then-verify never matches. The anti-pattern
  and corrected pattern are documented in `datasheet-fixes.jsonl`.
