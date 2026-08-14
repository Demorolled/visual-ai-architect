# VACA Claims Audit — Round 6 (Aug 7, 2026)

**Score: 139/160 (87%) — all 16 probes PASS** (up from 84% Round 5, 82% Round 3).
Live against :3001 (backend in tmux `vaca-backend`), DSpark serving
`qwen2.5-7b-instruct-uncensored-dspark`, frontend on :5173.

## Claim vs Reality — per claim

| Claim (soul.json) | Score | Reality check |
|---|---|---|
| Text-to-speech voice output | **10/10** | 12 voices; POST /api/tts returned a real 17KB audio/mpeg MP3 (frame-sync magic verified) |
| Project mgmt — save/load/export/import | **10/10** | Full round-trip: create 201 → get 200 → update 200 → export 200 → import 201 → delete 200 → gone 404; disk persistence confirmed |
| Read named files | 9/10 | Read backend/src/index.ts correctly (real express imports returned) |
| Search codebase | 9/10 | Found sessionMemory references with file:line |
| Create file in chat-files | 9/10 | audit-test-fc.txt created, real path confirmed |
| Write memory | 9/10 | "my favorite color is teal" persisted to session-memory.json |
| Blueprint generation | 9/10 | Valid JSON blueprint: todo_list_app, nodes+edges |
| write-code files array | 9/10 | files[] paths == written successes subset |
| Live codegen progress stream | 9/10 | 11 events: generating 8% → … → validating → done:100% |
| Recall memory | 8/10 | "My favorite color is teal" recalled correctly |
| Code generation | 8/10 | Real memoized fibonacci (cache + recursion + test call) |
| Self-analysis | 8/10 | Read own soulService.ts, explained getSoulPromptModifier's purpose |
| LLM integration | 8/10 | DSpark health ok, model connected |
| WebSocket | 8/10 | socket.io polling handshake 200 |
| Emotional response | 8/10 | Empathic reply to stressed message |
| Emotion (soul.json freshness) | 8/10 | dominant=fear, 25 history entries, fresh timestamp |

## Quality probe (deeper than the audit)

A separate `scripts/quality-probe-round6.py` pushed the "8/10" LLM claims
harder:
- **Memory recall: 3/3** — wrote 3 distinct facts, asked to list all, all
  three recalled (color, dog, mode).
- **Codegen (chat): PASS** — complete memoized fibonacci with cache dict,
  recursion, and a test call printing 832040.
- **Blueprint: PASS** — parseable JSON, app_type + 3 nodes + 2 edges.
- **Emotion depth: PASS** — warm first reply AND warm follow-up after "it got
  worse" (continuity, not just a canned opener).
- **Self-analysis: PASS** — explains what getSoulPromptModifier does and why.

## Real weakness found: one-shot file-writer ships tsc errors

`scripts/test-one-shot.py` on a habit-tracker CLI: **mode=one-shot, 3 files,
contractViolations=0, but 2 tsc errors survived** (repair rounds consumed 2).
Across 6 recent exports, surviving error classes: TS2304 (cannot find name —
undefined symbols), TS2305 (wrong member import), TS2307 (missing module),
TS2322/TS2345 (type mismatch), TS2582 (bad import). The contract verifier now
holds (0 violations), but the tsc gate repairs and then ships with a nonzero
remainder. **This is the single biggest gap between the claim ("build
complete applications") and reality.**

## Improvement suggestions (priority order)

1. **Codegen: make the tsc gate reach 0 or self-heal.**
   - Budget the repair loop to keep retrying on the exact surviving classes
     (TS2304/TS2305/TS2307) instead of stopping after N rounds — these are
     mechanical (add import / fix name) and a dedicated prompt already exists
     for TS2304.
   - Add a **final full-file rewrite** when a file still fails: regenerate the
     whole file with the compiler errors in-context rather than patching lines.
   - Run the **independent tsc** (the same command test-one-shot.py uses) as
     the gate's authority, not just the internal check.
2. **Memory: snapshot before audit mutations.** The audit and probes write
   memory facts that accumulate; add a save/restore in `audit-claims.py`
   (backup session-memory.json, restore after) so runs never pollute or lose
   user notes. (Round 6 learned this the hard way — see note below.)
3. **WebSocket claim (8/10): upgrade probe to a real event round-trip**
   (connect, emit, receive `connected`/`status_update`) instead of a raw
   polling handshake — the capability is there, the probe is shallow.
4. **LLM integration (8/10): probe a real chat completion through the health
   model**, not just `/api/health`.
5. **Blueprint (9/10): validate node/edge referential integrity** (every edge
   references existing nodes) in the probe, and make the generator reject
   dangling edges.
6. **Emotion (8/10): multi-turn continuity probe** (already partly done in the
   quality probe — promote it into the audit) plus verify the personality
   traits actually shift the modifier string.

## Notes
- Memory cleanup incident: an over-aggressive cleanup removed 17 notes from
  session-memory.json (mostly audit/probe artifacts; the 2 legitimate
  NebulaChat user notes survived). Lesson: audits must snapshot/restore, not
  delete.
- Runtime health at audit time: backend uptime healthy, DSpark ok, frontend
  HTTP 200, no console errors in the browser during the earlier E2E run.
