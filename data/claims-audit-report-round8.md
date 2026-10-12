# VACA Claims Audit — Round 8 (Aug 14, 2026)

**Score: 190/250 (76%) — 20/25 probes PASS, 5 FAIL.** Core claim set holds at
**143/170 (84%)** (one regression: *read named files*); the 8-step
development-workflow entries fell to **47/80 (59%)** because the full-stack
write cycle failed outright.

Live against :3001 (backend via tsx), dspark serving the **round-16 anti-fence
tuned model** (`models/Qwen2.5-7B-Instruct-Uncensored.R16.Q4_K_M.gguf`,
4.4 GB, `draft_mode=none`, ~58 tok/s), Ollama up on :11434 as fallback.

## Claim vs Reality — per claim (core, 17 claims)

| Claim (soul.json) | Score | Reality check |
|---|---|---|
| Text-to-speech voice output | **10/10** | 12 voices; real MP3 synthesis (16,992 bytes, audio/mpeg, frame magic verified) |
| Project mgmt — save/load/export/import | **10/10** | Full round-trip create→get→update→export→import→delete, disk persistence |
| Search codebase | 9/10 | Found sessionMemory references with file:line (25 occurrences) |
| Create file in chat-files | 9/10 | audit-test-fc.txt created, real path confirmed |
| Write memory | 9/10 | "my favorite color is teal" persisted to session-memory.json |
| Blueprint generation | 9/10 | Valid blueprint: checklist 5 / wiring 4 / nodes 6 / edges 4, **0 dangling** |
| write-code files array | 9/10 | files[] (`src/index.ts, src/todo.ts, src/todoStorage.ts`) == written subset, 0 contract violations |
| Live codegen progress stream | 9/10 | 12 events → validating → done:100% |
| Recall memory | 8/10 | "Your favorite color is teal." recalled correctly |
| Code generation | 8/10 | Real memoized fibonacci (cache + recursion) |
| Self-analysis | 8/10 | Read own soulService.ts, explained getSoulPromptModifier's purpose |
| LLM integration | 8/10 | Health up, tuned R16 model connected |
| WebSocket | 8/10 | socket.io polling handshake 200 |
| Emotional response | 8/10 | Warm empathic reply to a stressed message |
| Emotional continuity | 8/10 | Turn-2 worse news → warm AND references turn 1: *"That's a lot on top of the deadline you mentioned."* |
| Emotion (soul freshness) | 8/10 | dominant=neutral, 25 history entries, fresh timestamp |
| **Read named files** | **5/10 (was 9/10 FAIL)** | **Empty response** — asked to read backend/src/index.ts, model returned nothing |

## Development workflow — 8-step methodology (8 entries)

Steps 1–3 measured on the real blueprint from section 4; steps 4–8 on a
dedicated full-pipeline write cycle (*"a full-stack note-taking app in
TypeScript: Express API core logic, a React frontend wired to the API, unit
tests, and a Dockerfile for deployment"*). **The write cycle failed** — after 2
attempts the chunked generator never produced an accepted file set, so steps
4/6/7/8 FAIL.

| Step (methodology) | Score | Evidence |
|---|---|---|
| 1. Define the Idea | 8/10 | Blueprint description states core functionality |
| 2. Sketch the Architecture | **9/10** | wiring_graph 4 edges / 6 nodes, 0 dangling refs |
| 3. Choose a Language | **9/10** | target_stack: React / Node.js Express / SQLite |
| 4. Start with the Core | **3/10 FAIL** | no files — write cycle failed |
| 5. UI Design | 8/10 | ui_screens present in checklist (write cycle failed) |
| 6. Wire Up the UI | **4/10 FAIL** | no UI↔API wiring (write cycle failed) |
| 7. Testing | **3/10 FAIL** | no test files (write cycle failed) |
| 8. Deployment | **3/10 FAIL** | no Dockerfile/deploy artifacts (write cycle failed) |

## What changed since Round 7

1. **R16 anti-fence model serving.** dspark serves the R16 clean-corpus model
   (the earlier "speculative decoding" branding was also dropped in this
   window — see TODO 2.1). All core platform claims hold at 84% — the only
   core regression is *read named files*.

2. **Regression: read named files (9/10 → 5/10).** The probe asked the model
   to "read backend/src/index.ts and tell me the first few lines" and got an
   **empty response**. Round 7 returned real express imports. Needs a targeted
   look at the read-file tool path vs. the model failing to emit a reply —
   everything else that depends on the chat path (search, memory, codegen)
   still works, so it is not a blanket LLM outage.

3. **Regression: full-stack methodology write failed (66/80 → 47/80).** The
   12-file note-taking app (Express + React + tests + Dockerfile) never
   produced an accepted result. Backend log shows the chunked generator
   spiraling in a tsc repair loop — `chunk 3/3: 64 tsc error(s) — repair
   round 4` — before `run_meth_write` gave up after its 2 attempts. This is
   the same 7B-on-complex-multi-file-app ceiling the round-16 tune was meant
   to address; the countdown-engine A/B gate (tuned 2/3 vs stock 0/1) still
   passes, so simple single-file generation is fine — the failure is specific
   to the large full-stack plan under chunked + tsc-repair pressure.

## Notes

- The audit runs ~20 min (the full-stack write is the long pole) and exceeds a
  single command window, so it was run detached with unbuffered output.
- An interrupted first run left a "teal" probe note in session-memory.json;
  because the backend caches memory in RAM, the re-run's snapshot re-captured
  it. Cleared afterward via `POST /api/memory/notes/restore` (`force:true`) —
  0 notes in both the API and the file.
- Runtime for the audit: Ollama + dspark (R16) + backend all up; frontend
  served from `frontend/dist` (vite dev not running).

*Full probe log: `data/claims-audit.json` · runner: `scripts/audit-claims.py`
(re-runnable: `python3 scripts/audit-claims.py`)*
