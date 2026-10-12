# Generation batch — did the RUNTIME CRASH RULES reduce failures?

**Date:** 2026-10-02 · **Harness:** `scripts/gen-batch-gui.mts` (drives the real
pipeline: `planProject` + `generatePlanFiles`, then the runtime smoke engine).

## Design (controlled A/B)

- **8 single-file GUI tasks**, identical in both arms (tic-tac-toe, checkers,
  image gallery, temperature converter, sudoku, memory match, quiz, expense tracker).
- **Model:** the pipeline's configured agent-box Ollama writer (unchanged between arms).
- **Arm A** = current prompt. **Arm B** = identical source with *only* the
  `━━━ RUNTIME CRASH RULES ━━━` block removed from `GUI_WIDGET_SECTION`
  (backed up to `guiShared.ts.bak`, restored afterwards, `diff` = IDENTICAL).
- Every output smoked with the same fixed probe; raw logs `arm-A.log` / `arm-B.log`,
  raw results `A/results.json` / `B/results.json`, generated apps under `A/` and `B/`.

## Result

| arm | apps | PASS | FAIL | UNAVAIL | pass rate |
|---|---|---|---|---|---|
| A — with runtime-crash rules | 8 | **4** | 4 | 0 | 50% |
| B — without | 8 | **4** | 3 | 1 | 50% |

**No measurable difference.** Both arms pass 4/8.

### Failure classes actually seen

- **Arm A:** 1× missing-file refs (`ERR_FILE_NOT_FOUND`), **2× `startGame is not defined`**,
  1× unguarded lookup (`Cannot read properties of undefined (reading 'answer')`).
- **Arm B:** 1× `game.reset is not a function`, 1× undefined functions
  (`gridInputHtml`, `solveBoard`, `clearBoard` — all "not defined"), 1× syntax error
  (`Unexpected token '&'`) + `startGame is not defined`; 1 app had no HTML entry at all
  (planner variance, unrelated to code).

The classes the rules target (undefined references, unguarded lookups, recursion)
**still occur in both arms**.

## Uncomfortable side finding

`startGame is not defined` is the *most common* failure in the batch — and
`startGame` is the handler name this repo's own `GUI_WIDGET_SECTION` BUTTON
template now shows. Models copy the `<button onclick="startGame()">` line and omit
the `<script>function startGame(){}</script>` definition that follows it in the
template. **The template fix from the previous step replaced one dangling name
(`play`) with another (`startGame`).** Prompt-level handler naming is fragile.

## Caveats (this is inconclusive, not "no effect")

- n = 8 per arm; ±1 app ≈ ±12.5pp. Only a very large effect would be detectable.
- `renderSmoke` returned **`unavailable` (python playwright not installed)** for every
  app, so the pipeline's own **repair loop never fired**. This measures first-pass
  generation, not production output where repair may already handle these classes.
- Generation is stochastic and the arms are unpaired — no per-task causal pairing.
- The block is ~1200 chars of 9k+ of injected GUI prompt; a weak signal is expected.

## Recommendation

Do not claim the runtime-crash rules work. Either (a) take the deterministic route —
a verifiable guard the probe can assert on, e.g. dropping/defusing inline handlers
whose function is never defined — or (b) re-run this harness at n≥40 per arm with the
repair loop enabled before drawing any conclusion from prompt text.

## Side effect (restored)

The batch rotated the live knowledge store (`backend/knowledge/sheet-meta.json`
266→267) and evicted the void-raider patterns, breaking 2 tests
(`internalKnowledge.test.ts`, a `codePlanner.test.ts` case). Both tracked files were
restored with `git checkout --`; the full suite is green again (1307 passed / 1 skipped).

---

## Follow-up: deterministic defuse guard (re-sweep)

Rather than tune prompt text further, `defuseUndefinedInlineHandlers()` was added
to `backend/src/ai/guiShared.ts` and wired into the self-containment pass
(`inlineExternalScriptRefs`), so it runs on EVERY write path — not only after a
failed render smoke (which returned `unavailable` here).

It rewrites a bare call in an `on*` attribute to a safe expression ONLY when the
name is declared nowhere in the document:
`onclick="clearInputs()"` → `onclick="(typeof clearInputs === 'function' ? clearInputs : () => {}) ()"`.
Declared names (function/class/let/const/var/assignment/window.x), browser
built-ins and method calls (`event.preventDefault()`) are never touched; documents
with an external `<script src>` are skipped entirely.

**Applied to the 115-app corpus (`runs/runtime-defuse/backup/` holds originals):**

| | PASS | FAIL |
|---|---|---|
| before | 90 | 25 |
| after | **93** | **22** |

**3 flipped FAIL→PASS, 0 regressions** — each previously failing on exactly the
target class: `clearInputs is not defined`, `restartGame is not defined`,
`undoMove`/`redoMove is not defined`.

Trade-off, stated plainly: this removes a CRASH, it does not add the missing
feature. Those buttons were wired to nothing, so they stay inert — the app goes
from broken to merely incomplete. `+3 apps`, `+2.6pp` overall.
