# VACA Claims Audit — Round 7 (Aug 8, 2026)

**Score: 213/250 (85%) — all 25 probes PASS** (17 core claims + 8 new
8-step development-workflow entries, on the **newly deployed round-7 tuned
model**). Legacy claim set holds at 147/170 (86%); the workflow entries
added 66/80.

Live against :3001 (backend via tsx), dspark serving the **recovered round-7
GGUF** (`models/Qwen2.5-7B-Instruct-Uncensored.Q4_K_M.gguf`, 4.68 GB — the
Kaggle-trained adapter merged + exported locally after the kernel's disk-full
export crash), frontend built in `frontend/dist`.

## Claim vs Reality — per claim

| Claim (soul.json) | Score | Reality check |
|---|---|---|
| Text-to-speech voice output | **10/10** | 12 voices; real MP3 synthesis (17 KB, audio/mpeg, frame magic verified) |
| Project mgmt — save/load/export/import | **10/10** | Full round-trip create→get→update→export→import→delete, disk persistence |
| Read named files | 9/10 | Real express imports from backend/src/index.ts |
| Search codebase | 9/10 | Found sessionMemory references with file:line |
| Create file in chat-files | 9/10 | audit-test-fc.txt created, real path confirmed |
| Write memory | 9/10 | "my favorite color is teal" persisted to session-memory.json |
| Blueprint generation | 9/10 | Valid todo_list_app blueprint: 6 nodes / 4 edges, **0 dangling edges** |
| write-code files array | 9/10 | files[] == written subset, 0 contract violations |
| Live codegen progress stream | 9/10 | 9 events → validating → done:100% |
| Recall memory | 8/10 | "Your favorite color is teal." recalled correctly |
| Code generation | 8/10 | Real memoized fibonacci (cache + recursion + test call) |
| Self-analysis | 8/10 | Read own soulService.ts, explained getSoulPromptModifier's purpose |
| LLM integration | 8/10 | Health up, tuned model connected |
| WebSocket | 8/10 | socket.io handshake 200 |
| Emotional response | 8/10 | Warm empathic reply to a stressed message |
| **Emotional continuity** | **8/10 (was 4/10 FAIL)** | Turn-2 worse news → warm AND references turn 1: *"Oh no — that's a lot on top of the deadline you mentioned."* |
| Emotion (soul freshness) | 8/10 | dominant=neutral, 25 history entries, fresh timestamp |

## Quality probe (deeper than the audit)

`scripts/quality-probe-round6.py` — **all 5 checks pass**:
- **Memory recall: 3/3** — wrote 3 distinct facts, all three listed back
  (color, dog, dark mode).
- **Codegen (chat): PASS** — complete memoized fibonacci (cache + recursion).
- **Blueprint: PASS** — parseable JSON, todo_list_app, nodes+edges valid.
- **Emotion depth: PASS** — warm first reply AND warm follow-up after "it got
  worse".
- **Self-analysis: PASS** — explains what getSoulPromptModifier does and why.

## Development workflow — 8-step methodology (new entries, added to the audit)

The audit now carries the 8-step build workflow as first-class entries
(steps 1–3 measured on the real blueprint built by section 4; steps 4–8 on
a dedicated full-pipeline write cycle: *"a full-stack note-taking app in
TypeScript: Express API core logic, a React frontend wired to the API,
unit tests, and a Dockerfile for deployment"*). All 8 PASS:

| Step (methodology) | Score | Evidence |
|---|---|---|
| 1. Define the Idea | 8/10 | Blueprint description states core functionality |
| 2. Sketch the Architecture | **9/10** | wiring_graph 4 edges / 6 nodes, 0 dangling refs |
| 3. Choose a Language | **9/10** | target_stack: React / Node.js Express / SQLite |
| 4. Start with the Core | 8/10 | core.ts, routes.ts, db.ts, handlers.ts separate from ui.tsx/app.tsx |
| 5. UI Design | 8/10 | src/ui.tsx + src/app.tsx emitted (and ui_screens in checklist) |
| 6. Wire Up the UI | 8/10 | UI + API files in the same project (ui→api wiring in blueprint) |
| 7. Testing | 8/10 | tests/core.spec.ts emitted |
| 8. Deployment | 8/10 | Dockerfile emitted |

The write cycle generated all 11 files: `src/types.ts, src/core.ts,
src/routes.ts, src/db.ts, src/handlers.ts, src/index.ts, src/ui.tsx,
src/app.tsx, tests/core.spec.ts, Dockerfile, index.html`.

## What changed since Round 6

1. **Round-7 tuned model deployed.** The Kaggle round-7 QLoRA run (LR 5e-5, 2
   epochs, 288 steps, Acc 87.15%) finished training but its GGUF export
   crashed on Kaggle (disk full). Recovered locally: adapter downloaded →
   merged into the base → exported to Q4_K_M (4.68 GB, chat template
   verified) → served by dspark and adopted by the backend. Codegen /
   blueprint / file / memory / TTS all hold at Round-6 levels — **zero
   regression in the legacy claim set (139/160 = 87%, identical to Round 6)**.

2. **Emotional-continuity regression found and fixed (4/10 → 8/10).** The
   round-7 training mildly regressed multi-turn tie-back: the continuity
   probe passed only 1/3. Root cause + fix:
   - The P3b recap was **appended** to the END of the current user message —
     the exact mistake already documented twice in reasoning.ts ("a lone
     appended line was ignored by the 7B", the NATIVE_PLATFORM_SHORT lesson).
   - Fix: **prepend** the recap with an explicit opener STRUCTURE the model
     can fill in — `BEGIN your reply with a sentence that ties back to the
     EARLIER topic, using a structure like "Oh no — that's a lot on top of
     the [earlier topic] you mentioned."` (bracketed placeholder forces
     substitution from the recap; verified it never leaks a wrong topic into
     other conversations).
   - Also clarified the system-prompt continuity block: naming the earlier
     topic directly is expected — only copying the user's exact sentences is
     forbidden (the old "never quote or echo" was being over-generalized into
     "never mention the topic").
   - Live-verified: continuity probe passes **3/3** through the real backend,
     then the full audit's probe passes (warm=True referencesTurn1=True).

## Notes
- The audit was run against the newly deployed round-7 model (not the R6
  one), so 84% → 86% is the round-7 model's own score after the continuity
  fix.
- Backend full test suite green: 34 files / 668 tests.
- Round-8 dataset distillation stays paused (on hold per user), checkpointed
  at ~340 rows / 424 done-hashes — resumable with one command.

*Full probe log: `data/claims-audit.json` · runner: `scripts/audit-claims.py`
(re-runnable: `python3 scripts/audit-claims.py`)*
