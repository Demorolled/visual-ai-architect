# VACA Claims Audit — Round 9 (Aug 16, 2026)

**Score: 169/250 (68%) — 15/25 probes PASS, 10 FAIL.**

Live against :3001, dspark serving the **round-18 tuned model**
(`models/Qwen2.5-Coder-14B-Instruct-Uncensored.R18.Q4_K_M.gguf`, 8.99 GB,
`draft_mode=none`, ~16-20 tok/s measured), Ollama up on :11434 as fallback.
First audit run on the 14B (Round 8 was the 7B R16, Round 7 the pre-R16 7B).

## Trend

| Round | Model | Score | PASS/FAIL |
|---|---|---|---|
| 7 (Aug 8) | 7B (pre-R16) | 85% (213/250) | 25/25 |
| 8 (Aug 14) | 7B R16 | 76% (190/250) | 20/25 |
| 9 (Aug 16) | 14B R18 | 68% (169/250) | 15/25 |

## Claim vs Reality — core claims

| Claim | Score | Reality |
|---|---|---|
| TTS | **10/10** | 12 voices; real MP3 (16,992 bytes, audio/mpeg, frame magic verified) |
| Project mgmt | **10/10** | Full create→get→update→export→import→delete round-trip, disk persistence |
| Read named files | **9/10** ✅ fixed | Real express imports returned (Round 8 regression: empty response) |
| Search codebase | 9/10 | sessionMemory references with file list |
| Create file | 9/10 | audit-test-fc.txt created, verified on disk |
| Write memory | 9/10 | "teal" note persisted to session-memory.json |
| write-code files array | 9/10 | files[] == written subset, 3/3 todo CLI files |
| Live codegen stream | 9/10 | 14 generation_progress events → done:100% |
| Recall memory | 8/10 | "Your favorite color is teal." |
| Code generation | 8/10 | Real memoized fibonacci |
| Self-analysis | 8/10 | Explained getSoulPromptModifier |
| LLM integration | 8/10 | Health up, R18 model connected |
| WebSocket | 8/10 | socket.io polling handshake 200 |
| Emotional response | 8/10 | Warm empathic reply |
| Emotion (soul freshness) | 8/10 | 25 history entries, fresh timestamp |
| **Blueprint generation** | **6/10 FAIL (was 9/10)** | **Build timed out (180s) — repair loop never converged** |
| **Emotional continuity** | **4/10 FAIL (was 8/10)** | Turn-2 reply not warm by keyword list |

## Failures — three root causes

### Root cause A — blueprint build repair loop never converges (NEW on 14B)

Section-4 probe `POST /api/blueprint/build` (todo app) **timed out at 180s** with
empty result. Reproduced manually with a 900s timeout — also timed out. Backend
log shows the build IS working, but the per-file compile-check repair loop
**spirals without converging**:

```
[fileGenerator] Compile-check round 1: 5 file(s) failing — regenerating
[fileGenerator] Compile-check round 2: 5 file(s) failing — regenerating
[fileGenerator] Compile-check round 3: 5 file(s) failing — regenerating
```

Every round the same 5 files (core_engine, ui_screens, data_store, task_store,
input_handler) re-fail with the same classes the lints now catch but the model
won't fix: scope-leak lint (TS2304 'data'/'task'/'dueDate' never declared,
TS2451 sibling-scope refs) and invented-member scan (TS2339 `Task.filter` /
`Task.push` — ONLY id/description exist). The 14B regenerates the same broken
style instead of performing the repair; at ~16-20 tok/s each round is ~3×
slower than the 7B, so the whole cycle blows past any reasonable timeout.

The workflow steps 1-3 (define idea / sketch architecture / choose language)
FAIL purely as a cascade — they read the empty blueprint from this section.

### Root cause B — full-stack methodology write fails (PERSISTED through 14B upgrade)

Section-11 write (*full-stack note-taking app: Express + React + tests +
Dockerfile*) produced **no accepted files after 2 attempts**. Backend log:

```
[codePlanner] chunked: 12 file(s) in 3 chunk(s), 9 repair round(s), 33 remaining tsc error(s) [gate: errors]
[codePlanner] chunked render smoke: failed (interactions=2, bodyText=79) after 1 repair round(s)
```

The 12 files ARE written to `backend/exports/a-full-stack-note-taking-app-*`
(Dockerfile, src/, client/, tests/ all present) but the gate rejects them.
Independent tsc on the export found **25 errors**, dominated by:

- **Test files can't compile, ever** (TS2304 expect, TS2593 test/beforeEach/afterEach):
  the sandbox bans third-party packages (prompt rule 11), so the model's
  `test()`/`expect()` test files have no types and can never pass the gate.
  This is a prompt/gate contradiction — either the sandbox must declare test
  globals (like it does for node globals in `globals.d.ts`) or the tests must
  use a framework-free assert pattern.
- Real model bugs: TS2339 `Note.title` doesn't exist (invented member),
  TS2345/TS2554 arg mismatches, TS2322 void→Server.

Workflow steps 4-8 (core-first / UI / wiring / tests / deploy) FAIL as a
cascade — the write never reached `success`.

### Root cause C — emotional continuity keyword miss (possible false negative)

Turn-2 reply: *"That's tough, considering everything else you're dealing with.
Losing work can be really stressful. Have you tried to recover any files?"* —
objectively warm and references turn 1, but the audit's warm-keyword list
(sorry/understand/awful/rough/hard/help/breathe/together/let's) doesn't contain
"tough"/"stressful", so `warm2=False`. Likely a keyword-list gap rather than a
genuine regression (Round 8 passed with a similar reply).

## Fixes applied during this run

1. **Memory probe pollution cleaned** — the restore call failed with 400
   ("refusing to restore an empty snapshot over a non-empty store"): the store
   had 0 notes before the audit, so the snapshot was `[]`, and the restore
   wipe-guard refused it without `force:true`. The "teal" fact was left in
   session-memory.json. Deleted via `DELETE /api/memory/notes/:id` (verified
   0 notes in API + file).
2. **Audit script bug fixed** (`scripts/audit-claims.py`) — the memory restore
   now passes `force:true` when the snapshot is genuinely empty, so a
   legitimately-empty store restores cleanly instead of 400ing and leaving the
   probe fact behind. Non-empty snapshots still restore without force (wipe
   guard preserved).

## Notes

- The audit took ~35 min (vs ~20 on the 7B) — the 14B is the long pole.
- A leftover manual blueprint-build probe continued running past the audit
  (backend kept looping repair rounds after the client timed out); it consumes
  dspark until the build finishes or errors.
- Re-runnable: `python3 scripts/audit-claims.py`

*Full probe log: `data/claims-audit.json` · runner: `scripts/audit-claims.py`*
