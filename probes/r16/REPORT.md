# R16 Anti-Fence Probe (deployed model via dspark)

**Gate pass 10/10 · fences 0/10 · separators 0/10 · prose 0/10 · artifacts 0/10**

The gate is a Python port of VACA's `isQualityCode` — the same bar the round-16 corpus was filtered through. R16 was trained ONLY on rows that pass it, so a high gate-pass rate here is the direct measure of whether the remediation worked.

| Prompt | Gate | Fence | Sep | Prose | Artifact |
|---|---|---|---|---|---|
| ts-chess-ai | ✅ |  |  |  |  |
| ts-todo-types | ✅ |  |  |  |  |
| ts-config | ✅ |  |  |  |  |
| ts-game-logic | ✅ |  |  |  |  |
| ts-utils | ✅ |  |  |  |  |
| css-layout | ✅ |  |  |  |  |
| css-theme | ✅ |  |  |  |  |
| html-app | ✅ |  |  |  |  |
| html-dashboard | ✅ |  |  |  |  |
| ts-store | ✅ |  |  |  |  |

## Verdict

- **Clean sweep: zero markdown/prose leaks.** The anti-fence training held on every prompt.
- Gate pass 10/10 — the deployed model is producing quality-gate-clean code at a high rate.

Run: `python3 scripts/probe-r16.py` — outputs in `probes/r16/`.