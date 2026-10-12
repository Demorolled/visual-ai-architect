# VACA Claims Audit — Round 8 Failures (Aug 14, 2026)

Five probes FAILED (of 25). They collapse to **two root causes**.

## Root cause A — chat-path "read named files" returns empty

| Probe | Score | Evidence |
|---|---|---|
| read named files | 5/10 | Prompt: *"read backend/src/index.ts and tell me the first few lines"* → **empty response** (Round 7 returned real express imports) |

- Everything else on the same chat path works (search, memory, codegen,
  self-analysis), so this is not a blanket LLM outage — it is specific to the
  read-a-named-file request.
- Hypotheses: (a) the read-file tool invocation fails or returns nothing for
  that path; (b) the model emits an empty reply instead of triggering the
  read; (c) a timeout/truncation in the read path.

## Root cause B — full-stack write cycle fails (chunked + tsc-repair loop)

Four probes share ONE root cause: the section-[11] "8-step methodology" write
— *"a full-stack note-taking app in TypeScript: Express API core logic, a
React frontend wired to the API, unit tests, and a Dockerfile for deployment"*
— produced **no accepted files** after 2 attempts (`run_meth_write` returned
`None`).

| Probe | Score | Evidence |
|---|---|---|
| workflow: core-first (core separate from UI) | 3/10 | no files — write cycle failed |
| workflow: wire up the UI | 4/10 | no UI↔API wiring — write cycle failed |
| workflow: testing | 3/10 | no test files — write cycle failed |
| workflow: deployment | 3/10 | no Dockerfile/deploy artifacts — write cycle failed |

Backend log during the failure:

```
[codePlanner] Plan has 12 files (~2465 est. output tokens) — auto-chunking (4/chunk)
[codePlanner] chunk 3/3: 1 tsc error(s) — repair round 1
[codePlanner] chunk 3/3: 35 tsc error(s) — repair round 3
[codePlanner] chunk 3/3: 64 tsc error(s) — repair round 4
```

The chunked generator spirals in a tsc-repair loop (error count *grows*
across repair rounds) and bails. Simple single-file generation is fine (the
countdown-engine A/B gate passes tuned 2/3 vs stock 0/1), so this is specific
to the large multi-file plan under chunked + tsc-repair pressure.
Hypotheses: (a) repair rounds regress worse files (repair prompt loses the
contract context); (b) chunk boundary splits a file mid-import so tsc sees
phantom cross-chunk refs; (c) the 7B model can't hold a 12-file contract.

## Fix plan

1. **A — read named files**: reproduce the exact chat call, trace the
   read-file tool path (`/api/reason/chat` → tool dispatch), fix the empty
   return, re-run the probe.
2. **B — full-stack write**: reproduce with a smaller plan first, inspect the
   chunked generator + repair loop in `codePlanner.ts`, find why error count
   grows across repair rounds, fix, re-run the methodology probe.
