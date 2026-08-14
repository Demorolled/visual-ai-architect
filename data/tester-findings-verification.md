# Tester Findings — Verification Report (live, 2026-08-07)

Verified every finding the standalone tester app (`projects/claims-audit.html`)
reported, with deeper live probes than the tester itself runs.

## Verdict summary

| Finding | Tester said | Verified reality | Status |
|---|---|---|---|
| P2 Codegen quality | one-shot writer ships tsc errors | **CONFIRMED** — 9 tsc errors + 2 contract violations survived on a 3-file habit-tracker CLI | 🔴 Real gap |
| P2 Memory robustness | probe notes accumulate in session-memory.json | **CONFIRMED** — 11/13 notes were probe junk (`auditcolor#### is turquoise`) | 🔴 Real gap (recall itself works: 3/3) |
| P3 Emotion continuity | may be canned template | **NOT a gap** — turn-1 warm + turn-2 warm after worse news, soul history has 25 entries, last reading fresh | 🟢 Works (probe variance caused the tester's 4/10) |
| P3 Blueprint integrity | may have dangling edges | **NOT a gap** — fitness_tracker blueprint: 4 nodes, 3 edges, 0 dangling | 🟢 Works (add guard anyway) |

## Details

### P2 Codegen — CONFIRMED (the one real quality gap)
Live one-shot write (`scripts/test-one-shot.py`, habit-tracker CLI):
- plan 200 in 8.6s → write 200 in 31.5s, mode=one-shot, 3 files
- **repairRounds=1, tscErrors=9, contractViolations=2**
- Independent tsc on the written output: 9 errors — TS2307 (`./types` module
  that was never planned), TS5097, TS2554 (wrong arity), TS2448 (used before
  declared), TS2339×3 (`readlineSync` doesn't exist on the module), TS2459
  (Todo interface mismatch)
- Root causes in `backend/src/routes/codePlanner.ts`:
  1. Repair loop is bounded at **2 rounds / 4 tsc-repair calls** and stops when
     nothing changes — mechanical error classes are never chased to 0.
  2. The model invents modules (`./types`) and members (`readlineSync`) that the
     plan never declared; the repair prompt only patches, it doesn't regenerate
     the file with errors in-context.
  3. The gate *reports* surviving errors but still **ships** the files.

### P2 Memory — CONFIRMED (pollution; recall itself passes)
- 3 distinct facts written → **3/3 recalled** on a single "list everything" turn.
- BUT `data/session-memory.json` had **13 notes, 11 of them probe junk** —
  every tester/audit run writes `my auditcolor#### is turquoise` and never
  cleans up. Probe facts pollute the injected memory context and crowd out real
  user notes (only 2 legit NebulaChat notes remained).
- Cleanup performed after this verification: back to the 2 legit notes.

### P3 Emotion — works (tester's 4/10 was probe variance)
- Turn 1 stressed: warm reply. Turn 2 "laptop died, lost work": **also warm**,
  and it referenced the previous turn's topic ("rough day… make a plan").
- `data/soul.json` emotional_state.history: 25 entries, last reading fresh
  (<10 min). The engine records every chat turn — not a canned template.

### P3 Blueprint — works (0 dangling edges)
- fitness_tracker blueprint: app_type ✓, 4 nodes, 3 edges, **0 dangling**.
- No referential-integrity bug today — but there is no generator-side
  validation, so a future drift could ship dangling edges undetected.

## How to fix each (concrete)

### 1. Codegen (P2) — `backend/src/routes/codePlanner.ts`
- **Chase mechanical error classes to 0**: TS2304/2305/2307/2322/2345/2582 are
  deterministic — raise `MAX_TSC_REPAIR_CALLS` (4→8) and stop the tsc gate
  only at 0 errors or a no-change round, not at round 2.
- **Regenerate whole files with errors in-context** for mixed-class failures:
  if a file still fails after the import-only patch, rebuild its content with a
  prompt that includes the exact error lines + the file's contract, instead of
  line-patching.
- **Plan-time import validation**: TS2307 (`./types`) means the plan listed an
  import that no planned file exports. Add a check in `verifyGeneratedContracts`
  that flags cross-file imports of non-planned modules and either adds the
  module to the plan or tells the writer to implement it locally.
- **Independent tsc as gate authority**: gate on `runTscCheck` output, and when
  errors survive the budget, return them in the response (already done) and
  mark `success:false`-style warning so the frontend can surface it.

### 2. Memory (P2) — audits + app + backend
- **Snapshot/restore in the tester app** (`projects/claims-audit.html`
  `probeMemory`) and `scripts/audit-claims.py`: save `data/session-memory.json`
  before writing the probe fact, restore after — never leaves junk.
- **Backend delete endpoint** (`backend/src/routes/memory.ts` +
  `backend/src/database/sessionMemory.ts`): add `DELETE /api/memory/notes/:id`
  so probes can remove exactly the note they created.
- **Dedupe/evict** in `sessionMemory.addNote`: drop an existing note with the
  same topic before inserting; cap by age not just count.

### 3. Emotion (P3) — keep engine, harden the probe
- Engine already does multi-turn recording (`analyzeEmotionHistory`).
- Tester's `probeEmotion` scored 4/10 due to regex variance; deepen it: check
  BOTH turns warm AND that the second reply references turn-1 content (continuity).

### 4. Blueprint (P3) — add a validation guard
- In `backend/src/blueprint/bible.ts` (or the blueprint build route): validate
  every edge's source/target against the node ids and **drop or repair dangling
  edges** before saving. Add the same check to `scripts/audit-claims.py` and
  the tester's `probeBlueprint`.
