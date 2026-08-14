# A/B: tuned (dspark) vs stock (Ollama) — REAL pipeline conditions

Date: 2026-08-05 · Script: `scripts/ab-pipeline-chess.py`
Conditions: real fileGenerator prompt template (verbatim requirements 1-11, scale section,
dep context, GUI widget context, language hints), real VACA system prompt (soul modifier +
identity), temperature **0.7**, repeat_penalty 1.15, frequency_penalty 0.3, presence_penalty 0.2,
num_ctx 8192, max_tokens 4096. Faithful assembly: strip fences → strip AI imports
(postProcessTsJsCode) → prepend pipeline auto-imports (buildImportStatement ../<dep>/<dep>.ts layout).

## Raw runs
| model | task | chars | time | dir |
|---|---|---|---|---|
| tuned | engine | 2813 | 12.3s | run-20260805-185241-tuned/ |
| tuned | ui | 1217 | 6.0s | run-20260805-185255-tuned/ |
| stock | engine | 17737 | 74.7s | run-20260805-185242-stock/ |
| stock | ui | 20941 | 74.0s | run-20260805-185357-stock/ |

## Gate comparison (faithful pipeline assembly + tsc --noEmit --strict)

| gate | tuned/engine | stock/engine | tuned/ui | stock/ui |
|---|---|---|---|---|
| fences (```) | 0 | **41** (20 identical repeated blocks) | 0 | **9** |
| over-escaped \` / \${ | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| prose leak | 0 | 21 | 0 | 5 |
| TODO / stubs | 0 | 0 | 0 | 0 |
| export default | 0 | 0 | 0 | 0 |
| real minimax w/ alpha-beta | ✅ | (in repetition loop) | — | — |
| named exports | getBestMove | setDifficulty×20 | **NONE** | **NONE** |
| tsc errors | **7** | **7** (syntax garbage) | **8** | **99** (syntax garbage) |
| tsc error class | 5 invented members + 2 type-narrowing | TS1434/TS1003/TS1443/TS1160 | 6 invented members + TS2440 + TS2693 | TS1434/TS1003/TS1443 |

## Failure-mode breakdown
- Tuned engine TS2339: `board.isCheckmate()`, `board.evaluate()` ×2, `board.makeMove()` ×2 — all invented,
  not in declared exports. TS2345: `number|undefined`→`number`, `AIConfig|undefined`→`AIConfig`.
- Tuned ui: NO export statement at all (preview wrapper would fail at runtime); TS2440 import/local
  conflict on setDifficulty; invented `board.render()/getStatus()/undoMove()/resetGame()/setDifficulty()`;
  TS2693 Difficulty used as value.
- Stock: full degeneration loops (20× identical code block on engine; 4× on ui), redefined `Color`
  itself, unterminated template literals.

## Verdict
- **Formatting discipline: HOLD STRONG at temp 0.7.** Tuned = 0 fences / 0 over-escapes / 0 prose on
  both tasks while stock collapses into repetition loops. The 340-step fine-tune trained in the
  "code-only, no fences" rule.
- **Contract fidelity: STILL FAILS, new failure mode.** The tuned model now writes REAL, coherent code
  (actual minimax + alpha-beta), but invents board members that don't exist in the declared contract
  graph (board.makeMove/evaluate/isCheckmate/render/undoMove…) and forgets export contracts (no render
  export). This is the exact cross-file contract drift that broke builds 1-3 — the fine-tune did not fix it.
- Conclusion: the wall is multi-file contract consistency (invented members + missing exports), a 7B
  capability limit the fine-tune didn't address. Pipeline-side enforcement (member whitelist in prompts +
  tsc-feedback loop) remains the recommended fix over more training.
