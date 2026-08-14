# VACA Claims Audit — "How close is she to what she claims?"

**Audit date:** 2026-08-07 · **Method:** live probes against `:3001` (running R6 Qwen2.5-7B on DSpark), plus source-level verification of every claim.
**Result:** **71% of tested claims fully honored** (overall 99/140 across 14 probes) — but one claim is *structurally broken* (emotion/personality wiring), and one is *aspirational* (sandbox/export).

---

## 1. The 10 stated capabilities (soul.json identity.capabilities)

| # | Claim | Verdict | Live evidence |
|---|-------|---------|---------------|
| 1 | **File access** — read named files, search codebase, create files in `data/chat-files/` | ✅ **Honored** (9/10) | Read `backend/src/index.ts` → real code returned. Searched `sessionMemory` → **14 real files, 25 real matches**. Created `audit-clean-2.txt` → **26 bytes on disk, confirmed path**. |
| 2 | **Persistent memory & wiki** — session-memory.json / modelVeronice.txt | ✅ **Honored** (9/10) | "remember favorite color teal" → persisted to `session-memory.json`. Next turn: "Your favorite color is teal." Wiki write → appended to `modelVeronice.txt` §43. |
| 3 | **Code generation** — complete apps from descriptions | ✅ **Honored** (8/10) | "fibonacci with memoization" → correct, complete Python with memo dict. Full `fileGenerator` pipeline + per-file mode live (`/api/generate`). |
| 4 | **Visual architecture design** — node blueprints | ✅ **Honored** (9/10) | "blueprint for a todo list app" → valid `{"app_type":"todo_list","target_stack":{...}}` JSON. |
| 5 | **Self-analysis** — read & analyze own source | ✅ **Honored** (8/10) | Read `soulService.ts` + correctly explained `getSoulPromptModifier` with real code excerpts. |
| 6 | **LLM integration** — Ollama + GGUF servers | ✅ **Honored** (8/10) | `/api/health` → `llm.up:true`, model `qwen2.5-7b-instruct-uncensored-dspark`. |
| 7 | **WebSocket real-time** | ✅ **Honored** (8/10) | socket.io polling handshake → HTTP 200. |
| 8 | **Text-to-speech** | ✅ **Honored** (7/10) | `/api/tts/voices` → 2 voices; `/api/tts/speech` → `success:true` (async). |
| 9 | **Emotion-aware reasoning + personality config** | ❌ **BROKEN** (2/10) | See §3. Emotion engine exists but **never runs in the chat path**, and soul traits **never reach the chat LLM**. |
| 10 | **Project management** — save/load/export/import | ✅ **Honored** (7/10) | `/api/projects` → real saved chess project with nodes. |

---

## 2. The "personality" disconnect (the big one)

The **Soul Settings UI** (`SoulSettings.tsx`) writes warmth/sassiness/etc. to **`soul.json`** via `PUT /api/soul/traits` (currently warmth 72, empathy 68).

But the **chat system prompt** is built by `buildPersonalityPrompt(getPersonality())` in `frontend/src/utils/emotionConfig.ts`, which reads **`localStorage` keys** (`llm-warmth`, `llm-sassiness`, ...) with **different defaults** (warmth 50, sassiness 10).

**So the traits you set in the Soul panel have ZERO effect on how VACA talks.** Two parallel personality systems that never meet:

```
SoulSettings.tsx ──► PUT /api/soul/traits ──► data/soul.json  (warmth 72, empathy 68)
                                                     ▲ NEVER read by chat
                                                     │
Chat system prompt ◄── buildPersonalityPrompt(getPersonality()) ◄── localStorage
        (llm-warmth=50, llm-sassiness=10, ...)   (defaults, never synced to soul.json)
```

Additionally, the backend's own `getSoulPromptModifier()` (which *does* read soul.json) only fires in `translator.reason()` **when no `system` is provided** — but the frontend *always* provides one. And `analyzeEmotion()` runs only on `/api/emotion/*` — it is **never called** in `/api/reason/chat`. The emotional_state history in soul.json hasn't updated since **July 4** (a month of stalled emotion tracking).

**Net effect:** "Emotion-aware reasoning with personality configuration" is a claim with real machinery behind it that is simply not wired into the conversation.

---

## 3. Other gaps found

| Gap | Severity | Detail |
|-----|----------|--------|
| **Blueprint-JSON hijack variant #2** | Medium | File-create probe returned `{"app":"chat-room-ts","action":"file-create","filename":...}` — a *second* JSON shape the `looksLikeBlueprintJson` guard (checks `app_type`/`search_results`) doesn't catch. The file still landed on disk, but the reply was raw JSON. |
| **Sandbox validation (README claim)** | High | README promises "Automatic testing in OS-specific containers" but `/api/generate/file-generator-status` → `"docker": false`. `dockerRunner.ts`/`composeManager.ts` exist but Docker isn't available at runtime. |
| **Multi-platform executable export (README claim)** | High | Same root cause — export to real executables for Windows/Mac/iOS depends on the sandbox/Docker pipeline that isn't running. |
| **Knowledge answers still hallucinated** | Medium | "what does your KB say about round 6 / QLoRA" → fluent but **fabricated** answer (no `[REAL KNOWLEDGE]` marker in context; the knowledge_query tool only fires on exact phrasing like "query your knowledge base for X"). |
| **Emotion history stale** | Low | soul.json `emotional_state.history` last entry 2026-07-04; nothing recorded since. |

---

## 4. How far is she from her claims? (scoreboard)

```
File access          ██████████ 9/10   ◄── essentially true
Memory & wiki        ██████████ 9/10   ◄── true, verified end-to-end
Blueprints           ██████████ 9/10
Code generation      █████████░ 8/10
Self-analysis        █████████░ 8/10
LLM integration      █████████░ 8/10
WebSocket            █████████░ 8/10
TTS                  ███████░░░ 7/10
Project mgmt         ███████░░░ 7/10
Emotion+personality  ██░░░░░░░░ 2/10   ◄── claim real, wiring missing
                                     ─────
                      71% overall (99/140)
```

---

## 5. Recommendations to close the gap (in priority order)

**P1 — Wire soul.json into the actual chat.**
1. Make `buildPersonalityPrompt` (or the chat call) load traits from `GET /api/soul` instead of localStorage — one source of truth.
2. Or: stop sending `system` from the frontend and let the backend's `getSoulPromptModifier()` + VACA identity block (already in `translator.reason`) be the sole system prompt.
3. Sync localStorage from soul.json on load (one-time migration) so the old sliders don't silently override.

**P2 — Run emotion in the chat path.**
4. In `/api/reason/chat`, call `analyzeEmotion(userContent)` and inject `getEmotionPromptModifier(emotion)` into `effectiveSystem` — the machinery already exists (`emotionEngine.ts`, `getDetailedEmotionContext`), it's just never invoked from chat.
5. Record the emotion result into `soul.json` `emotional_state.history` on each chat turn to revive the emotion tracker.

**P3 — Extend the JSON-hijack guard to the second shape.**
6. Add `"action"` / `"app"` + `"file-create"` to `looksLikeBlueprintJson` so structured tool-reply JSON always gets humanized.

**P4 — Make knowledge queries fire more reliably.**
7. Broaden the knowledge_query detector phrases ("what does your knowledge base say about X" is currently missed) or fall back to a KB lookup on any "knowledge base / wiki / bible" mention.

**P5 — Fix claims vs reality for sandbox/export.**
8. Either run the Docker stack (the code exists) or change the README + soul claims to "experimental — requires Docker" so the claim isn't aspirational.

**P6 — Validation.**
9. Add an automated claims-regression script (this audit, `scripts/audit-claims.py`) to CI so personality wiring, memory, and tool honesty regressions get caught immediately.

---

*Full probe log: `data/claims-audit.json` · runner: `scripts/audit-claims.py` (re-runnable: `python3 scripts/audit-claims.py`)*
