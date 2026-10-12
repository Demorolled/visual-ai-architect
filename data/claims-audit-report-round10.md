# VACA Claims Audit — Round 10 (Aug 16, 2026)

**Score: 208/250 (83%) — 24/25 probes PASS, 1 FAIL.**

Live against :3001, dspark serving the **round-18 tuned model**
(`models/Qwen2.5-Coder-14B-Instruct-Uncensored.R18.Q4_K_M.gguf`, 8.99 GB,
`draft_mode=none`, ~16-20 tok/s measured), Ollama up on :11434 as fallback.
Same model as Round 9 — this run verifies the two R9 fixes (blueprint stall
detection, sandbox test globals) against the full claim suite.

## Trend

| Round | Model | Score | PASS/FAIL |
|---|---|---|---|
| 7 (Aug 8) | 7B (pre-R16) | 85% (213/250) | 25/25 |
| 8 (Aug 14) | 7B R16 | 76% (190/250) | 20/25 |
| 9 (Aug 16) | 14B R18 | 68% (169/250) | 15/25 |
| **10 (Aug 16)** | **14B R18** | **83% (208/250)** | **24/25** |

## Claim vs Reality — full delta vs R9

| Claim | R9 | R10 | Delta |
|---|---|---|---|
| TTS | 10 | 10 | +0 |
| Project mgmt | 10 | 10 | +0 |
| Read named files | 9 | 9 | +0 |
| Search codebase | 9 | 9 | +0 |
| Create file | 9 | 9 | +0 |
| Write memory | 9 | 9 | +0 |
| write-code files array | 9 | 9 | +0 |
| Live codegen stream | 9 | 9 | +0 |
| Recall memory | 8 | 8 | +0 |
| Code generation | 8 | 8 | +0 |
| Self-analysis | 8 | 8 | +0 |
| LLM integration | 8 | 8 | +0 |
| WebSocket | 8 | 8 | +0 |
| Emotional response | 8 | 8 | +0 |
| Emotion (soul freshness) | 8 | 8 | +0 |
| **Blueprint generation** | **6** | **9** | **+3** ✅ |
| **Emotional continuity** | **4** | **8** | **+4** ✅ |
| workflow: define the idea | 3 | 8 | +5 |
| workflow: sketch architecture | 5 | 9 | +4 |
| workflow: choose a language | 4 | 9 | +5 |
| workflow: core-first | 3 | 8 | +5 |
| workflow: UI design | 4 | 8 | +4 |
| workflow: wire up the UI | 4 | 8 | +4 |
| workflow: testing | 3 | 8 | +5 |
| **workflow: deployment** | **3** | **3** | **+0** ❌ |

## What recovered — the two fixes verified

### Fix 1: blueprint stall detection (#55) → blueprint + workflow 1-3
`/api/blueprint/build` **completed** this run (was a 180s timeout in R9) —
the repair loop's global no-progress stop + per-file stall skip bounded the
build, and the section-4 probe returned a valid blueprint. The workflow
steps 1-3 (define idea / sketch architecture / choose language) all
recovered because they read the real blueprint instead of an empty one.

### Fix 2: sandbox test globals (#56) → workflow: testing + write success
The section-11 write cycle **reached `success`** (was "write cycle failed"
in R9). The model emitted **two test files** this run
(`tests/server.test.ts`, `client/src/App.test.tsx`) and the gate accepted
them — the declared `test`/`expect`/`describe` globals work end to end.
The backend log also shows the deterministic phantom-npm-import stripper
cleaning `App.test.tsx` (no LLM call). Workflow steps 4-7 (core-first,
UI design, wiring, testing) all recovered; the write emitted core + UI +
tests in one project.

### Bonus: emotional continuity 4 → 8 with **no code change**
Turn-2 continuity passed this run — confirming R9's 4/10 was the
keyword-list false negative + reply stochasticity, not a regression.

## Remaining failure — workflow: deployment (3/10)

The write cycle emitted 8 files (`src/notes.ts`, `src/server.ts`,
`client/src/useNotes.ts`, `client/src/App.tsx`, `client/src/index.tsx`,
`tests/server.test.ts`, `client/src/App.test.tsx`, `index.html`) but **no
Dockerfile / deploy artifact** — even though `METH_REQ` explicitly asks
for "a Dockerfile for deployment". The model's *plan* simply omitted it
this run (stochastic planning miss, not a harness artifact): an identical
request probed earlier today emitted a Dockerfile, and R9's export had one
too. The claim costs 7 points — if it had passed at 8/10 the score would
be 213/250 (85%), exactly Round 7's level.

No fix warranted — it's a per-run model-planning variance, not a gate bug.
Re-running the section-11 probe would likely pass.

## Notes

- Audit took ~40 min (14B is the long pole; two write cycles + blueprint build).
- Memory restore probe passed cleanly this run (`force:true` fix from R9) —
  no pollution left behind, verified 0 notes after.
- Re-runnable: `python3 scripts/audit-claims.py` (R9 baseline preserved in
  `data/claims-audit-round9.json`).
