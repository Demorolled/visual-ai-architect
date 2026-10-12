# Scaffold LLM step — REMOVED 2026-10-02

The per-file **scaffold LLM step** was added earlier on 2026-10-02 and removed the
same day, on the evidence in `../summary.json` and `../../GATE_NUMBERS.md`.

**Why removed.** It was validated negatively in both modes available to us:

| arm | isolated (code) | in context (app) |
|---|---|---|
| baseline, no scaffold | 0.7462 (147/197) | 0.6650 (131/197) |
| scaffold, trimmed | 0.7107 (140/197) | 0.5736 (113/197) |

It also caused a distinct new failure class (TS2304 "cannot find name" 7 → 42: the
model named contract symbols it never imported or declared). Two contributing bugs
were found and fixed along the way (an unterminated code fence in the scaffold made
the writer continue the example instead of writing the file; and the acceptance
checker's `declare module "*"` shim was falsely failing ~20 points of *every* arm).

Decisive constraint: in app mode the GOLD ceiling is 137/197 (0.6954) against a
0.6650 baseline — **3pp of headroom against ±1pp noise**, so a single-file corpus
cannot demonstrate the cross-file value a scaffold step exists for. Removing it was
preferred over spending a QLoRA round to prove a negative; the supporting argument
is in the session record (`runs/GATE_NUMBERS.md`).

## What was removed

**Runtime (the product surface)**

| Removed | Where |
|---|---|
| `ai/scaffolder.ts` + `scaffolder.test.ts` (18 tests) | `removed/backend/` |
| `scaffold` member of `LlmRole` + `BAND_ROLE_INTRO['scaffold']` | `backend/src/ai/translator.ts` |
| `'scaffold'` in `LLM_ROLES` + its `ROLE_META` row | `backend/src/routes/llm.ts` |
| `'scaffold'` in `LlmRole` + its `ROLE_META` row | `frontend/src/store/llmStore.ts` |
| 📐 Arranger row | `LLM_ORIENTATION.md` |
| scaffold import, the `getFileWritePromptWithContext` section, the `buildChunkPrompt` chunk block, and the `generatePlanFiles` stage | `backend/src/routes/codePlanner.ts` |
| scaffold import + the `generateNodeFile` injection | `backend/src/layers/fileGenerator.ts` |
| `"features": {"scaffold": false}` | `backend/llm-config.json` |

**Training path**

| Removed | Where |
|---|---|
| `Paths.scaffold_jsonl`, `RoundConfig.scaffold_mix` | `training/selfplay/config.py` |
| the scaffold source in `stage_corpus` + its mix in the log line + the docstring | `training/selfplay/orchestrator.py` |
| the "Teaching the scaffold step" README section + the CORPUS bullet mention | `training/selfplay/README.md` |
| `scripts/build-scaffold-rows.py` | `removed/scripts/` |
| `SYS_SCAFFOLD` const + `"system_prompt"` in meta.json + the `"scaffold"` gold field | `scripts/distill-vaca.py` |

**Measurement harness** (kept: `--recheck` and the new `app` mode, which are general)

| Removed | Where |
|---|---|
| `SYS_SCAFFOLD`, `trim_scaffold()`, `--scaffolds`, `--trim-scaffolds`, `--role scaffold` | `scripts/eval_acceptance.py` |
| `--mode scaffold`, `checkScaffold()`, `hasWord`/`escRe` | `scripts/acceptance_check.mjs` |
| `--role scaffold` | `scripts/promote-adapter.py` |

**Data** — `corpora/vaca/{scaffolds,scaffolds-trimmed,scaffold-rows}.jsonl` and
`scaffold-rows.meta.json`, preserved in `removed/corpora/`.

## Restoring it

Every removed file is preserved verbatim here. The edits above are ordinary
deletions, so restoring means copying the files back and re-adding the role/flag
plumbing listed above. `backend/exports/*` and `runs/` were touched only by the
preservation copies.

## Note on the corpus

`corpora/vaca/gold.jsonl` on disk still carries a now-dead `"scaffold": null` field
from the last build; the producer no longer emits it. The corpus was deliberately
**not** rebuilt, so the artifact behind the recorded numbers is unchanged.
