# R17 14B Q4 vs R16 7B — Quality Comparison (Aug 15, 2026)

Same prompts, same dspark pipeline, temperature 0.1–0.2, single run each.

## Easy battery (single-function / logic)

| Test | 14B Q4 | 7B R16 | Verdict |
|---|---|---|---|
| TS fibonacci | ✓ compiles (throws on n<0) | ✓ compiles (returns [] on n<0) | Tie |
| TS url parser | ✓ compiles | ✓ compiles | Tie |
| Python water jug | ✓ solves, concise | ✓ solves, longer | Tie (both correct) |
| Logic puzzle (colors) | A:green B:red C:blue ✓ | A:blue B:red C:green ✓ | Tie (puzzle had 2 valid answers) |
| Instruction adherence | "COMPLIANT 42" exact | "COMPLIANT42" (no space) | **14B** (stricter) |
| VACA module_contract | ✗ tsc errors (const reassign, fresh array per call — state lost) | ✓ compiles, state persists | **7B** |

## Hard battery (debugging / stateful / multi-constraint)

| Test | 14B Q4 | 7B R16 | Verdict |
|---|---|---|---|
| Find+fix empty-array bug | explained it, gave NO corrected code | explained + gave corrected code | **7B** |
| Stateful TaskQueue class | ✓ compiles (generic) | ✓ compiles (generic) | Tie |
| Multi-constraint scheduling | X:morning Y:afternoon Z:night | same answer | Tie (both correct) |

## Honest summary

- **On focused single-function/reasoning tasks the 14B is NOT clearly smarter — the 7B won 2, tied 4, 14B won 1.**
- The 14B's only clear win was stricter instruction formatting. The 7B won the two tasks closest to VACA's real workload (module with a contract, debug+fix).
- Caveats: n=1 per test (LLM variance is high at this sample size); these tasks are short and both models handle them well. The 14B coder's edge should show on LONG multi-file, contract-heavy builds — the actual VACA workload — which needs the backend + ladder harness to measure properly.
- The 14B's real advantages are architectural (2× params, coder-specialized, 16k ctx) — worth re-testing on real builds before concluding.
- Cost: 14B Q4 ≈ 30 tok/s vs 7B ≈ 60 tok/s (~2× slower per token, but ~2× param count).

## Files
- `q4-14b-raw.json` / `r16-7b-raw.json` — full easy-battery responses
- `hard-q4-14b.json` / `hard-r16-7b.json` — full hard-battery responses
- `q4-14b/` `r16-7b/` — extracted code files for tsc/run checks
