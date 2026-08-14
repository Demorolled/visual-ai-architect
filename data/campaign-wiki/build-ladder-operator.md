# Build-Ladder Operator (55 real builds)

> **Campaign:** build-ladder · **Date:** 2026-08-09 · **Result:** 55/55 built, 50 fresh PASS, 5 FAIL (all corrected + recorded)

## What it is

A fully automated operator (`training/operator/`) that drives VACA through 55 real app builds —
20 simple (python scripts), 10 hard (multi-step logic + a web app), 25 extreme (Playwright-tested
browser apps, node http servers, heavy python) — full-testing each one and recording everything.

## Loop per build

1. `plan-code` → `write-code` (the same API the app uses)
2. `tester.py` runs the app for real: python subprocess, node HTTP checks, or headless-Chromium page
3. PASS → training row recorded, export deleted
4. FAIL → deterministic zero-LLM fixes (auto `__main__`, AttributeError rename) → retest
   → up to 2 LLM repair rounds fed the ACTUAL OUTPUT back → retest
5. Every error → corrected output is stored in `datasheet-fixes.jsonl` and the corrected code goes
   into `round9-buildladder.jsonl` for the next LLM training round

## Results

| Tier | Built | Fresh PASS | Notes |
|---|---|---|---|
| simple | 20 | 20 | s07/s08/s11/s12/s15 needed repair rounds |
| hard | 10 | 9 | h07 password manager: salt-regeneration anti-pattern |
| extreme | 25 | 21 | e09 passed on retest after the planner fix; e12/e17/e18/e19 corrected + recorded |

All 5 recorded failures have verified corrected implementations + full diagnoses.

## Where things live

- Operator: `training/operator/{manifest,tester,run_operator}.py`
- Dataset: `training/operator/dataset/round9-buildladder.jsonl` (56 rows)
- Fixes: `training/operator/datasheet-fixes.jsonl` (72 entries)
- Wiki knowledge: `modelVeronice.txt` sections 46-48

---
*VACA build-ladder campaign — 2026-08-09*
