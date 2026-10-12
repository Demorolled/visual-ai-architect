# "Void Raider" build — failure report

**Requested:** create a classic arcade game "void raider" (a space-shooter style
arcade game).

**Result:** Vaca did NOT create "void raider". It created a project named
**"classic game"** whose blueprint is **`memory_card_game_2`** — a *memory
matching card game*. No real "void raider" (space shooter) exists anywhere in
the project store, the blueprint bible, or the exports.

Evidence collected (all live, 2026-08-14 ~22:37 UTC):

- `backend/data/projects.json` — latest project `cfb56ca9` = `"classic game"`,
  master label `"memory_card_game_2 blueprint"`, modules `Game Controller / Game
  Engine / Game State / AI Opponent / Render View`. All 5 module nodes are
  `status: "pending"` with **no generated code**.
- `matchBlueprint("classic game")` → `memory_card_game_2` at 1.00 (top hit),
  ahead of `frogger_2`, `memory_card_game`, `simon_says`. Space-shooter
  blueprints (`space_shooter`, `asteroids`, `space_invaders`) do NOT rank.
- `matchBlueprint("void raider")` → `evaluation_report` at 0.31 (garbage match;
  no space-shooter blueprint recognizes the title).
- `training/dataset/verified-generations.jsonl` — exactly ONE row for
  "classic game" (`source: blueprint-verified:memory_card_game_2:classic game`),
  and its output is placeholder-quality (see error #3).
- `/api/session/builds` — `lastBuild` is still "full 3d chess game" (Aug 13);
  the "classic game" build never recorded a session build.

---

## Error #1 — `detectBuildIntent` drops the game's actual title ("void raider")

**File:** `frontend/src/components/ReasoningPanel.tsx` → `detectBuildIntent()`

The goal-capture regex matches greedily up to the first app-type suffix word:

```js
(\w[\w\s]*(?:appSuffixes))   // appSuffixes includes "game"
```

So for `"create a classic arcade game void raider"` the capture is
`"classic arcade game"` and **"void raider" (the name of the game) is
discarded**. For `"create a classic game void raider"` it is just
`"classic game"`. The game's name never reaches the planner or the blueprint
matcher, so the system can only guess the genre from the generic prefix
("classic … game").

**Fix direction:** capture the full noun phrase (and especially any trailing
proper-noun title) after the verb, e.g. handle `"called X"` / `"named X"` /
trailing title words, instead of truncating at the first app-type suffix. At
minimum, preserve `"void raider"` as the goal/purpose so matching sees it.

---

## Error #2 — Blueprint matcher misroutes "classic game" → memory card game

**File:** `backend/src/blueprint/bible.ts` → `matchBlueprint()` /
`lexicalHitCount()`

`memory_card_game_2` literally contains the keyword `"classic"` in its
`keywords` array, so the goal `"classic game"` gets a 2-hit lexical bonus
("classic" + "game") and tops the ranking at 1.00 — above the actual
space-shooter blueprints. There is no "void raider" blueprint, and
`"void raider"` alone matches `evaluation_report` (0.31), i.e. pure noise.

**Fix direction:**
- Add/alias a space-shooter arcade blueprint so titles like "void raider"
  (and "raider" as a token) have a correct home, or map arcade/shooter genre
  words ("arcade", "shooter", "raider", "invaders", "asteroids") to the
  `space_shooter` family.
- De-weight the generic keyword "classic" (it is a genre adjective, not a
  domain), or require domain keywords ("shooter"/"space"/"arcade") to beat a
  mere "classic + game" match.

---

## Error #3 — Placeholder code passes the "verified" capture gate

**File:** `backend/src/training/verifiedGenerationCapture.ts` (stub gate) and
the generation path that produced it.

The one file captured as "verified" for this build is `Game State` and its full
output is a non-functional shell:

```ts
// Game State.ts
// Game Engine.ts
export class GameState {
  state_and_events: any[];
  gameData: string;
  constructor(gameAndEvents: any[], gameData: string) {
    this.state_and_events = gameAndEvents;
    this.gameData = gameData;
  }
  update(result: any): void {
    this.state_and_events.push(result);
    this.gameData = JSON.stringify(this.state_and_events);
  }
  getData(): any[] {
    return JSON.parse(this.gameData);
  }
}
```

No imports, no real game state (cards/matches/score), `any[]`, and JSON
round-tripping. The stub detector (`not implemented`, `placeholder for`,
`TODO: Implement`, etc.) does not catch this shape, so it enters the training
dataset as "verified" while the other 4 modules were skipped (not verified).

**Fix direction:** strengthen `isStub()` / `skipReason()` to flag `any[]`-only
classes, "JSON.stringify/parse round-trip" shells, zero-import module stubs, and
stray `// FileName` comment headers — so placeholder output never enters
`verified-generations.jsonl`.

---

## Error #4 — LLM health flaps and long generations block the server

**File:** `scripts/dspark_server.py` + `backend/src/index.ts` (`llmHealth()`)

- `chat_completions` is `async def` but calls the **synchronous**
  `llm.create_chat_completion(...)` directly, which blocks the single uvicorn
  event loop for the entire generation. Observed: one completion ran
  `11723 tokens in 426.09s` (7 minutes), during which `/v1/health` and
  `/v1/models` time out.
- `backend/src/index.ts` `llmHealth()` polls `/v1/models` with a 2s timeout, so
  during any real generation `/api/health` reports
  `llm: { up: false, error: "The operation was aborted due to timeout" }` even
  though the model is fine. This also makes `GET /api/llm/dspark-status` report
  `loading: true` (pid alive but health timed out) while the server is actually
  serving.

**Fix direction:** run the blocking llama.cpp call off the event loop
(`run_in_executor` / a worker thread, or switch to `def` endpoints that uvicorn
handles in a threadpool), so `/v1/health` and `/v1/models` stay responsive
during generation; and/or raise the backend health-check timeout so it stops
reporting a healthy-but-busy model as down.

---

## Summary of what to correct in system code

1. **Intent extraction** (`ReasoningPanel.tsx`): stop discarding the app's
   proper name; carry "void raider" through to matching.
2. **Blueprint matching** (`bible.ts`): make arcade/space-shooter genre words
   (and the title) beat a generic "classic + game" match; add a home for
   "void raider"/raider-style titles.
3. **Verified-capture gate** (`verifiedGenerationCapture.ts`): reject the
   `any[]`/JSON-round-trip/zero-import placeholder shell that was captured as
   verified.
4. **DSpark server** (`dspark_server.py`): unblock the event loop so health
   endpoints don't time out during long generations (and fix the downstream
   "LLM down" false alarm in `index.ts`).
