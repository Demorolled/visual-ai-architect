# NEXT SESSION — handoff notes (2026-08-17)

> **Agents: read `AGENTS.md` before you start.** Cap command output with
> `scripts/cap.sh` — never dump whole files into the transcript. A single
> session once hit 21 MB and froze the client.

Short handoff from the R19 session. Full detail in `VACA_CHANGE_LIST.md` (#59–#61).

## Update (2026-09-29): Tree Mode — several app trees in one project

A project can hold **several app trees** (`Project.trees`, `NodeData.treeId`, root nodes
reuse `type: 'master'`). Users add a second tree from the canvas tree bar, then connect a
node in one app to a node in the other from the node's detail overlay
("🔗 Share with another app") with a payload (login session, records, …).
**Frontend**: `types.ts` (`AppTree`, `CrossTreeConnection`, `CROSS_TREE_PAYLOAD_OPTIONS`),
`store/projectStore.ts` (`addTree`/`removeTree`/`renameTree`/`setActiveTree`/`connectTrees`,
`migrateTrees`, `isRootNode`), `Canvas.tsx` tree bar, `NodeDetailOverlay.tsx` connect UI.
**Backend**: `utils/treeScope.ts` (`resolveTreeScopes` splits intra-tree edges from
cross-tree handoffs, `planBridges` groups them per (source app → target app, payload),
`buildCrossTreeBoundarySection`, `buildBridgePrompt`, `planExportLayout`/`exportDirFor`),
`layers/fileGenerator.ts` (dependency graph built from `intraEdges` ONLY — a cross-tree edge
is a data handoff, never an import — plus `generateBridgeModule`, `appDir`/`treeIds` on
`GeneratedFile`, and one `scaffoldRelPath()` shared by the compile gates, the deterministic
repair fixers and the exporter), `export/perFileScaffolder.ts` (each app tree exports as its
own `apps/<app>/` program with its own entry point + config; bridges live in a shared
`bridge/` dir re-exported from both entry points; `trees` is now pushed to the backend by
`ensureServerProject`/App.tsx so the server actually sees the trees).
**Known gap**: the chat build path (`ReasoningPanel` → `/api/reason/plan-code` +
`/write-code`, i.e. `routes/codePlanner.ts`) is NOT Tree-Mode aware yet — it plans from the
user's text, not the canvas graph, so a build started there still produces one flat app.
Wire `resolved.links` + bridge modules into `generatePlanFiles`/`finalizeGeneratedFiles` the
same way `fileGenerator` does to close it.

## Update (2026-08-18): TS2307 sibling-path resolver IMPLEMENTED (#64)

**`applyDeterministicSiblingPathFix` is live in the tsc-gate repair loop** — the zero-LLM
fix the R20 probe data pointed at (its dominant residual class, TS2307 ×10: `../controllers`
for a same-dir sibling, `'../database/database.ts'` for a sibling that's just
`'./database'`, wrong directories). For each failing RELATIVE specifier in a file's tsc
errors, it resolves the basename against the ACTUAL files in the export (extension-tolerant,
case-insensitive, directory-index aware); when exactly ONE file matches it rewrites the
import path (`from 'SPEC'` / `import 'SPEC'` / `require('SPEC')` only — body untouched),
else falls through to the LLM prompts. Placed in the shared `finalizeGeneratedFiles`
tsc-gate loop right after the phantom-package strip, before any LLM repair round — so BOTH
write paths (one-shot and chunked/per-file) get it, and the macro loop re-runs it after the
whole-project pass. **Tests: 11 new in `codePlanner.test.ts`** (probe cases, multi-line /
double-quote / CJS / index-dir / case-insensitive / ambiguous / unresolved / non-relative /
body-literal guards) — all green; backend tsc clean. Only pre-existing failure in the suite
remains (`getInternalKnowledgeBlock` — reads the LIVE knowledge store, which changed when
Sheet #264 archived; fails identically without this change).
**NEXT**: re-measure — one more 6-write convergence probe on R20 (`probe-write-convergence.py`)
to confirm TS2307 drops; needs the backend free ~40-60 min (ask user).

**TS2345 investigated + repair-prompt gap fixed (#65)**: the probe's "new" class (7× in
write-6, all in `tests/app.test.ts`) is really a catch-all — 26 across all exports, 13
PROD / 13 TEST. Taxonomy: (a) partial object literal → full interface (dominant — the
write-6 `addNote({ content })` vs `interface Note { id; title; content }`),
(b) cross-file type-identity (`import("...")` mismatches — duplicate same-named types),
(c) primitive mismatches (string↔number), (d) misc (array vs single, React setter,
reversed args). Root cause of the write-6 failure: `buildRealTypeShapeBlock` only parsed
TS2339/TS2305 phrasing, so the regenerate prompt showed the model its own broken partial
calls with NO view of the real interface — it re-invented `{ content }` every round.
**Fix**: the shape block now also extracts type names from TS2345/TS2322
("not assignable to [parameter of] type 'X'" + "missing the following properties from
type 'X'") — the per-file regenerate prompt (and the escalation path) now shows the real
interface members. 1 new unit test (the write-6 case verbatim) — green; backend tsc
clean; only the pre-existing live-store failure remains.
**Not yet handled (future classes)**: TS2345 type-identity mismatches (`import("...")` —
same-named types declared in two files) — separate class, would need a dedup/align pass;
and the option of a deterministic partial-object call-site patcher (insert missing fields
with type-appropriate placeholders) if the re-measure still shows survivors.

## Update (2026-08-18): R20 re-measure probe — regression ruled out, chunked-loop gap found + fixed (#66)

**PROBE RERUN (04:58–05:32 EDT, backend restarted first on the #64/#65 code — the running
backend was Aug-17 code): tscErrors [1, 4, 0, 0, 1, 31] = 37 total, 2/6 clean.**

| Run | clean | total | TS2307 | TS2345 | dominant other |
|---|---|---|---|---|---|
| R19 baseline | 2/6 | 13 | — | — | — |
| R19 probe | 0/6 | 24 | 8 | 0 | TS2304×6, syntax×3 |
| R20 probe | 0/6 | 35 | **10** | **7** | TS2345, TS2554×4 |
| **R20 rerun** | **2/6** | 37 | **4** | **2** | TS2304×13+TS2339×13 (write 6 only) |

**Verdict: the R20 probe's poor result was NOISE, not regression.** The fixes worked:
TS2307 10→4 (−60%), TS2345 7→2 (−71%), and cleanliness is back to R19-baseline level
(2/6) — writes 1-5 totaled just **6 errors** (vs R20 probe's 22 across the same span), with
writes 3+4 tsc-CLEAN (the first clean writes since the R19 baseline; knowledge gate fired
+5/+6 patterns on exactly those two, zero on the error-bearing four).

**Write 6 (31 errors) is a NEW structural failure, not the old classes**: the model built a
DEEPER test layout (`tests/frontend/App.test.tsx`, `tests/backend/notes.test.ts`) and wrote
tests against **@testing-library/react — a phantom package** (strip correctly removed the
import, stranding render/screen/getByLabelText as TS2304/TS2339) plus an invented
`Database` class (db.ts) and a wrong `'../src/App'` path. The chunked repair loop then
failed twice: (1) its deterministic chain is a DRIFTED COPY of the finalize loop's —
missing the sibling-path resolver, name-drift, and plan-driven import insert (the probe's
chunked writes 1/2/5 carried TS2307 residuals that per-file mode fixed); (2) the
whole-project pass returned **unusable JSON** ("round 2 produced no usable JSON rewrite")
— the 14B's known JSON weakness, leaving all 31 errors to ship.
**FIXED (#66)**: brought the chunked loop's deterministic chain to parity — added
`applyDeterministicSiblingPathFix` + `applyDeterministicNameDriftFix` (before the strip)
+ `applyDeterministicImportPatch` (after content-driven/collision). Backend tsc clean, 289
passed (only the pre-existing live-store failure). **Not yet addressed**: whole-project
JSON-parse robustness (repairAndParseJSON only handles the basic cases) and the
phantom-package-dependent test-file class (a test whose whole approach needs a banned
package — the prompts instruct a rewrite without it, but the 14B couldn't within budget).
**ORPO side benefit**: +19 pairs (129 → 148).

## Write-6 dig + repair lessons (2026-08-18, #67)

Deep post-mortem of the ORIGINAL R20 probe's worst write (13 err / 15 files,
`a-full-stack-note-taking-app-in-typescri-1787014007010`) by diffing each file's
`_first-drafts/` (pre-repair) against its final:

1. **Root-cause files with zero errors are invisible to per-file repair.** note.ts
   (non-exported `interface Note`) was NEVER touched — it caused TS2459×2 AND made App.tsx's
   `Note` reference unimportable (no sibling exported it). The per-file loop only selects
   erroring files; only the whole-project pass could see it, and it failed.
2. **Repair can COMPOUND errors.** Asked to fix "Cannot find name 'deleteNote'", the model
   ADDED a new route using deleteNote (server.ts) instead of removing the use.
3. **Blind shape iteration.** app.test.ts went `addNote('x')` → `addNote({ content: 'x' })`
   — closer every round, never seeing the real `Note` interface (#65's shape block now shows
   it).
4. **LLM path repairs guess wrong again.** App.tsx's `'../server'` → `'../src/server'`
   (still wrong; real: `../../src/server`) — #64 now resolves this deterministically.
5. **Deep drift layers.** With the path fixed, the NEXT layer surfaced: the client imported
   `{ getNotes, addNote, deleteNote }` from server.ts, which only exports `startServer` —
   architecturally wrong wiring (client importing backend functions instead of HTTP calls),
   unreachable by deterministic fixes; the whole-project pass (its designated fix) returned
   unusable JSON.

**Measured on the real export** (deterministic chain, 6 rounds): **13 → 12** — TS2307 ✓ +
TS5097 ✓ eliminated, storage.ts cleared; residuals = the wiring drift (TS2459/TS2305/TS2304)
+ TS2345×7 (shape class).

**Implemented (#67, both repair loops)**: `applyDeterministicMissingExportFix` — parses
TS2459 "declares X locally, but it is not exported", finds the local declaration in the
TARGET file, adds `export` (collapses the root-cause cascade; 5 unit tests incl. the
note.ts case verbatim). `normalizeImportExtensions` — content-based TS5097 strip: removes a
`.ts/.tsx` extension from a relative import ONLY when the extension-less path resolves
(4 unit tests). Both zero-LLM/idempotent, wired into finalize AND chunked loops. Backend tsc
clean; 298 passed (only the pre-existing live-store failure).
**Still open**: whole-project JSON-parse robustness (the unusable-JSON failure), the
TS2345 deterministic call-site patcher (deferred — risk of compiling-but-wrong tests), and
the phantom-package test-file class.

## Whole-project JSON hardening (2026-08-18, #68)

**The write-6 "no usable JSON rewrite" failure, fixed**: the whole-project pass asks for
`{"files": {path: content}}` and the 14B's dominant failure mode is emitting file content
with RAW newlines inside the string values (instead of `\n` escapes) — invalid JSON that
`extractJSON`'s direct/fence/balanced-scan attempts all rejected — plus maxTokens truncation
mid-content (unterminated string). **`repairLLMJson`** (exported, wired into `extractJSON`'s
new `tryParse` used by EVERY parse attempt) is a string-aware pass that: (1) escapes raw
`\n`/`\r`/`\t` ONLY inside strings (raw newlines are valid whitespace outside them),
(2) never double-escapes an existing `\n`, (3) closes an unterminated trailing string then
unclosed structures in LIFO order. Valid JSON passes through byte-identical (unit-tested).
6 new unit tests incl. the whole-project `{"files":...}` shape with raw newlines, escaped
quotes in code, and truncation cases — green. Backend tsc clean; 304 passed (only the
pre-existing live-store failure).
**Still open**: phantom-package test-file class, and — still — the case where the 14B
returns BARE CODE instead of any JSON (a prompt/system-prompt problem, not a parse one).

## TS2345 partial-object call-site patcher IMPLEMENTED (2026-08-18, #69)

**The deferred patcher from #67 is now live — and it WORKS on the real write-6 export:**
`applyDeterministicPartialObjectFix` (both repair loops) parses TS2345's
`Argument of type '{ ... }' is not assignable to parameter of type 'X'` phrasing, derives
the missing members from the REAL sibling declaration of `X` (not the error text — tsc's
"missing the following properties" detail line never reaches the error array), and inserts
type-appropriate placeholders (`string→''`, `number→0`, `boolean→false`, `[]`) at
single-line call sites. Safety guards: never when a missing member is referenced later in
the file (its value then matters → LLM), never when a member's type is complex (placeholder
wouldn't compile), multi-literal/multi-line lines skipped.

**Critical design fix found during real-file validation**: first-match-wins across siblings
is WRONG when a same-named interface exists elsewhere with a DIFFERENT shape — write 6's
`client/src/components/NoteList.tsx` declares its own `interface Note { id; content }`
(smaller than the `src/note.ts` one the test imports). The patcher now prefers the files
THIS file imports from (resolves its relative import specifiers against the working set)
before scanning the rest — so `addNote({ content })` gets `id: ''` AND `title: ''` from the
imported `Note`, not just `id` from the component's local one.

**Measured on the real export (sim through the actual loop's file set): 13 → 6 errors,
TS2345 7 → 0.** The 6 survivors are the architectural wiring drift (TS2459/TS2305/TS2304 —
client importing server functions) that no deterministic fix can reach.

Verified: 8 unit tests incl. the write-6 case verbatim + the NoteList import-linked trap +
all guards; backend tsc clean; 1050 passed (only the two pre-existing environmental
failures: `getInternalKnowledgeBlock` live-store, and `todo.test.ts`'s real-todo-file test
whose `TODO fixes.txt` no longer exists at the resolution path).

## Update (same day, post-session)

**Pattern capture was DEAD on the two paths that actually run — fixed (#63).** User QA
("are the builds being stored as patterns?") showed `backend/knowledge/patterns.json` frozen
at 26 since Aug 15 while every capture session ran: the codePlanner write path never called
the learning engine, and blueprint builds skipped it via `skipVerifiedCapture`. Now both
paths learn (tsc-clean gated, same funnel): `learningEngine.learnFromGeneratedFiles`
(blueprint + canvas) and `learnFromFiles` (write path). Backend tsc clean, 1016/1017 tests.
**VERIFIED LIVE**: backend restarted on the new code; a live todo-CLI write printed
`[codePlanner] Learned 3 pattern(s)` and `patterns.json` grew 26 → 30 (3 node patterns +
architecture). Pattern capture is now working on the write path; the blueprint route uses
the same tested helper. Note: the orpo-seed --medium4/5 run finished EXIT=0 but its writes
5-10 all failed (backend restart mid-run); orpo-pairs.jsonl still holds the 33 prior pairs.

## Claims audit (2026-08-18, ran on the #64-#67 backend)

**213/250 (85%) — ALL 25 claims PASS, 25/25.** Baseline (saved as
`data/claims-audit-roundR20.json`): 209/250 (84%). The only score delta was
**emotional continuity 4→8** — the known audit keyword-list false-negative class (same
movement as the #57 round, no code change involved). Everything else held:
workflow:testing AND workflow:deployment BOTH passed at 8 — the first time both
methodology tail-claims hold in one run (the section-11 write shipped core + UI + tests
+ Dockerfile: `src/main.ts`, `src/notes.ts`, `src/storage.ts`, `index.html`,
`tests/app.test.ts`, `Dockerfile`). write-code files-array 9, blueprint 9, live progress
stream 9, TTS 10, project mgmt 10. Full log at /tmp/vaca-audit.log; results in
`data/claims-audit.json` (saved 06:36:28Z).

IMPORTANT: this run was on the backend restarted at 05:59 — i.e. it carries #64-#67
(sibling-path, shape-block, chunked parity, missing-export, TS5097 strip) but NOT #68
(JSON hardening) or #69 (TS2345 partial-object patcher). A future audit after the next
restart exercises the full stack.

## Chess build post-mortem + fix (2026-08-18, user-requested build "3d chess game")

**SYMPTOM**: the chess build rendered a board but was NOT playable — clicking pieces
selected them, but no square handlers existed, so pieces could never move.

**ROOT CAUSE (from `scripts/backend.log`)**: the build went through the blueprint/
fileGenerator delegator path (7B, 9 files: core_engine, ui_screens, input_handler,
data_store, game_engine…). The render smoke gate FAILED round 1 with
`startGame is not defined` (clicked primary control), the repair round rewrote
`index.html` as a self-contained inline app (fixed startGame) — but the re-verification
TIMED OUT (35s cap) → `render smoke: unavailable (timeout) — HTML render NOT verified`
→ shipped anyway as "0 tsc errors". The repaired HTML was only a board renderer + piece
selector: **no move logic existed anywhere** (the 7 external module files — game.js,
input.js, render.js, all stubs with `// TODO: Implement` — were never even loaded by
index.html; the "3D" request degraded to flat 2D).

**SYSTEMIC GAP exposed**: the smoke gate validates "does clicking cause console errors"
— NOT "is the game actually playable". A static board with selectable pieces passes.
Worth a future hardening pass (e.g. a playability probe that tries a full move cycle).

**FIX**: rebuilt `backend/exports/3d-chess-game-1787074372022/src/index.html` as a
self-contained, fully playable chess game — complete rules engine (legal moves,
king-safety, castling, en passant, auto-queen promotion, check/checkmate/stalemate,
insufficient-material draw), turn alternation, move highlighting, Undo, New Game, a
simple material-greedy AI (button + vs-AI toggle). Engine internals exposed on
`window.__chess` for testability.

**VERIFIED — 17/17 headless-Chrome checks** (`scripts/chess-verify.mjs`, kept as a
reusable harness): renders 64 squares/32 pieces; e2-e4 + d7-d5 land correctly;
**e4xd5 capture works** (captured pawn removed); knight targets L-shapes only;
**fool's-mate checkmate detected** ("Checkmate — Black wins!"); New Game resets;
AI move executes. ALSO: the project's own `scripts/smoke-test-html.py --behavioral`
now reports `pass: true, pageErrors: [], consoleErrors: []` — the exact gate that
failed the original build. All of the "engine bugs" during debugging were MY harness
coordinate errors (e.g. h4 = idx 39 not 31) — the rebuilt engine was correct throughout.

**NOTE**: the shipped index.html is a rewrite of the export — the 7 external stub
module files remain alongside but are unused. If VACA regenerates a chess game,
the same smoke-gate limitation may recur; the playability-probe hardening above is
the durable fix.

## Playability probe added to the smoke gate (#70, follow-up)

**The gap**: the smoke gate validated "does clicking cause console errors" — NOT
"is the game actually playable". The broken chess build (static board with
selectable-but-immovable pieces) passed it. **The probe** (in
`scripts/smoke-test-html.py --behavioral`): finds the container with >=8 clickable
non-control cells (a board), samples occupied cells spread across the board (a
corner piece may have zero moves — a pawn mid-board does), and after each click
looks for (a) legal-move/target markers appearing in the DOM, or (b) a destination
click actually relocating a piece (layout fingerprint = leaf text + position,
classes IGNORED so selection toggling never counts). If neither ever happens →
`playability.playable: false` → the smoke gate FAILS and the render repair loop
gets a "static board: pieces never move" error + a prompt hint to implement the
real interaction. **TS side** (`codePlanner.ts` runRenderSmoke) parses the new
`behavioral.playability` verdict into the failure detail; repair prompt now names
the static-board class explicitly.

**Verified**: probe passes the rebuilt chess (targetsAppeared ✓ + piecesMoved ✓),
FAILS a reconstructed static board (selectable pieces, no move logic), skips
normal apps (todo/note forms, plain pages) and canvas 3D games (their failures
stay on the pre-existing 3D-canvas gate). New pytest
`scripts/test-smoke-playability.py` (3 tests, all green) with playable/static/plain
fixtures. Backend tsc clean; suite 1050 passed (only the 2 pre-existing env
failures). **The probe also caught a real bug in my chess rebuild**: pieces are
absolutely-positioned ON TOP of their squares, so a user's click hits the piece,
not the square — and the rebuild had NO piece click handlers (my chess-verify
passed only because it clicked `.square` elements directly). Fixed: pieces now
route clicks to the same square handler; smoke re-verified pass.

## Deterministic HTML runtime fixer (JS-side #64-#69 sibling) + probe upgrade (#71-72)

**Live test found the repair loop's gap**: a VACA-generated checkers build failed
its own smoke gate with `static board (24 occupied cells, 12 tried — pieces never
move)` — a genuinely broken board — and the 14B's 2 repair rounds could NOT fix
it (both rewrites re-emitted the same crash, shipped as "0 tsc errors"). Root
cause dug out by actually PLAYING it in Chrome: three deterministic bug classes,
all mechanical — the TS-side deterministic-fix playbook (#64-#69) applied to HTML.

**`applyDeterministicHtmlRuntimeFixes(html)`** (runs BEFORE the LLM repair call in
the render repair loop; zero-LLM, idempotent, smoke re-run is the arbiter):
- **A) dataset-string vs number comparison** (`el.dataset.row === row` where
  `dataset.row` is a string and `row` is a number — `"0" === 0` is false → find()
  returns undefined → `.querySelector` crashes on the FIRST user click). Fix:
  `el.dataset.row === String(row)` — also covers member expressions
  (`m.row` from a moves list) and never mangles element accessors
  (`e.target.dataset.row` stays intact; coerce the VALUE, not the element).
- **B) use-after-null timing** (`selected = null;` then a LATER line reads
  `selected.…`): reorder — the null assignment is dropped when the read is within
  the next 3 lines with no reassignment in between.
- **C) unguarded computed lookup** (`squares.find(...).querySelector(...)`): a
  capture midpoint like `(a+b)/2` may match no square → find() returns undefined.
  For METHOD CALLS optional chaining (`find(...)?.querySelector(...)` → undefined,
  caller's `if (capturedPiece)` skips); `|| {}` would give `({}).querySelector` =
  "not a function". For PROPERTY ACCESS `|| {}` is kept (optional chaining on an
  assignment target is a SyntaxError).

**Real-world result**: applying the fixer to the shipped checkers export removes
ALL page errors; the game is genuinely playable (select piece → move targets →
destination relocates; verified move-by-move in Chrome, board layout correct).
The remaining checkers gap — NO capture/jump logic in `getValidMoves` at all — is
a missing FEATURE (beyond one-line fixes), not a crash.

**Probe upgrade (checkers exposed two blind spots)**: colored-div pieces have NO
text (text-layout fingerprint never changes) and targets highlight via
`transform` (no marker classes). New signal: track the PIECE ELEMENT's own
position across clicks — a real move always relocates it; a selection toggle
never does (can't false-positive on the static class). Also: (1) click ALL
neighbor destinations, not the first 4 (checkers' legal moves are the FORWARD
diagonals — last in row-major order); (2) EMPTY destinations before occupied ones
(clicking an occupied cell RE-SELECTS that piece and steals selection from the
piece under test). New pytest fixtures (7 total): colored-piece game passes,
static colored board fails, playable chess still passes.

**Verified**: fixer unit tests 9/9, `scripts/test-smoke-playability.py` 7/7,
backend tsc clean, suite 1059 passed (only the 2 pre-existing env failures — todo
file missing + live knowledge store).

## Live fixer test — 6 builds, fixer stayed silent, and that's correct (#71 follow-up)

Drove 6 live board-game builds through the restarted backend (checkers ×3, chess
×2, connect4) watching for the fixer to fire in a real repair round. **It never
fired — and that's the right behavior, not a miss.** The 14B's stochastic
generations produced DIFFERENT failure classes every time: missing-function
stubs (`selectPiece`/`newGame`/`saveGame is not defined`), blank pages
(`bodyText=0`), and one static board the LLM itself repaired to passing in 2
rounds. None of those classes match patterns A/B/C, so the fixer correctly made
zero changes; the LLM repair loop handled what it could. Also worth noting: the
earlier (pre-restart) log DID show `applied deterministic HTML runtime fixes`
from the session's manual application — the wiring is proven by the code path
(fixer runs before every LLM repair call) plus the deterministic before/after
below. **Definitive evidence the fixer works when its class appears**: the
previously-shipped-broken checkers export (…0858898, 14 `dataset` refs) —
ORIGINAL: smoke FAIL, 10 page errors, unplayable → FIXER APPLIED: smoke PASS,
0 errors, pieces move (verified via the real smoke gate). Takeaway: the fixer is
a targeted safety net for its 3 mechanical classes, not a general repairer —
the stochastic 14B may or may not produce those classes on any given build.

## State

- **R20 DEPLOYED (2026-08-17 ~20:05 EDT)**: Qwen2.5-Coder-14B **R20 Q4_K_M live on dspark**
  (`:8000`) — merge (build-r20-merged.py, 29.5 GB 16-bit validated) → convert → q4_k_m →
  restart, all done; smoke test OK ("OK"). Backend on `:3001` (tmux: `dspark`,
  `vaca-backend`, plus `vaca-hear/speak/talk` voice stack — all restored after the merge
  paused them to free the GPUs). R19 Q4 backed up to model-backups/ then removed from
  models/; `vaca-r20-adapter` pushed to Kaggle (R21's resume point). NOTE: the deploy
  script's foreground run hit a 600s timeout mid-health-check — dspark was already up;
  steps 5b (adapter push) + 5 (R19 removal) were completed manually. Disk freed to 28G.
- **Kaggle `vaca-qlora-round19` = ERROR** — the post-training *witness-merge* OOM only; all
  214/214 training steps completed. Real final LoRA recovered from `checkpoint-214/resume/`,
  promoted to `training/cloud/out/round19/adapter/`, and auto-pushed as
  `stevenawoods/vaca-r19-adapter`. Nothing to fix.
- **Tests**: backend tsc clean, 1004/1005 (only the pre-existing `todo.test.ts` env failure).

## Last session's changes (all verified)

- **Audit**: 209/250 (84%). `workflow:deployment` + `workflow:testing` both pass (deterministic
  enforcement, T1-style). Only failure: `emotional continuity` — a known stochastic probe
  (flaps 4↔8 with no code change; keyword-list + reply stochasticity).
- **Residual-error confinement (5 tiers, #61)** — the observed write classes
  (TS2304 6× / TS2451 4× / TS2339 3×):
  1. Content-driven auto-import (zero LLM) — beyond the plan's `uses`
  2. TS2451 local-collision dedup (zero LLM)
  3. REAL TYPE SHAPES in the repair prompt (TS2339)
  4. `tscClasses` telemetry in responses, sidecar, capture log
  5. `scripts/build-residual-repair-pairs.py` → **+130 rows recovered** into
     `repair-pairs.jsonl`; `residual-repair-pairs.jsonl` ready for future error-bearing writes

## TODO for the next session (the actual next step)

**R20 CONVERGENCE PROBE (2026-08-17 ~20:11–20:57 EDT, `scripts/probe-write-convergence.py
--tmux`, 6× the SAME request on the R20 ORPO-tuned model): tscErrors 4/1/8/3/6/13 = 35
total, 0/6 clean.** Class mix: TS2307 ×10 (missing module — still dominant), TS2345 ×7
(NEW — argument type mismatch, all in write 6), TS2554 ×4, TS2304 ×3, TS1005 ×3 (syntax),
TS2339 ×2 (back after the R19 probe's 0), TS2459 ×2, TS5097 ×2, TS2305 ×1, TS1002 ×1.
**Comparison: R19 baseline 13 err (2/6 clean) | R19 probe run 24 err (0/6) | R20 35 err
(0/6).** Honest verdict: the R20 ORPO round did NOT improve first-draft convergence on
this noisy n=6 sample — total errors ROSE vs both R19 runs (though the two R19 runs
spanned 13↔24 on identical requests, so n=6 is far too noisy to call a regression;
TS2307 stayed dominant, TS2345 is a newly-surfaced class). Consistent with the 1-epoch /
104-pair quota-fit being a SMALL preference update (acc 0.525) — a first ORPO step, not a
decisive shift. Knowledge gate held: all 6 writes error-bearing → patterns.json unchanged
(27 in sheet #265, mtime 17:23 EDT). Side benefit: +25 new ORPO pairs (104 → 129) from
the probe's first-drafts (build-orpo-pairs.py, finals re-verified).
**Next target stays TS2307** — the content-driven import fixer resolves unambiguous sibling
imports; surviving TS2307s are imports of modules that don't exist (model-invented paths).
The sibling-path resolver (../controllers → ./controllers, ext-tolerant, case-insensitive)
would have fixed most of this probe's 10 TS2307s at zero LLM cost.

**Knowledge bank (post-#63)**: 26 → 100 patterns → **Sheet #264 ARCHIVED to the Training
Studio** (`backend/llm-training-app/data/uploads/venorica-sheet-264-2026-08-17T19-50-01-788Z.jsonl`)
at the 100-pattern cap — the bank now cycles into the training pipeline by design — and
sheet #265 is live and accumulating (clean writes from the seed batches keep adding;
broken writes still store zero, gate holds). ORPO pairs: 33 → 104.

## ORPO / self-learning path (parked, next milestone)

Goal: train the model to PREFER its own verified-good output over its own broken first
drafts — true self-improvement. Infrastructure now in place (#62):

- `snapshotFirstDrafts` saves every .ts/.tsx file's FIRST draft to
  `backend/exports/<slug>/_first-drafts/` before the tsc gate repairs it (both write
  paths, live in the running backend).
- `python3 scripts/build-orpo-pairs.py` → `training/dataset/orpo-pairs.jsonl`
  (instruction, chosen=final tsc-clean, rejected=first-draft).

**Next step after the next capture/write session**: run `build-orpo-pairs.py`, then an
ORPO LoRA round on Kaggle (same push pipeline as SFT, ~6.5h slot; unsloth supports ORPO).

**R20 ORPO pipeline WRITTEN + PAIRS FILLED (2026-08-17)**: `train_round1.py` gained
`--train-type orpo` (TRL `ORPOTrainer`, prompt=system+instruction / chosen / rejected
message lists, version-agnostic SFTConfig-style dance, reuses the resume/save/sanity
machinery); `scripts/build-r20-orpo-corpus.py` (orpo-pairs.jsonl →
`training/cloud/round20-orpo-train.jsonl`); `scripts/build-round20-kaggle-notebook.py` →
`train_r20_orpo_coder14_kaggle.ipynb` (resumes `vaca-r19-adapter` ✓ ready on Kaggle,
LR 1e-5, β 0.1, 3 epochs, seq 3072, validates ✓); `scripts/kaggle-setup-round20.sh` (push
pipeline). **orpo-pairs.jsonl = 104 pairs** (was 33 this morning — three seed batches:
medium/2/3 + medium4/5; corpus + notebook rebuilt with the final count).
**QUOTA-FIT (user constraint: only 1h40m Kaggle for the next 4 days)**: the R20 kernel is
now 1 epoch (~12 steps ≈ 29 min training) + `--skip-merge --skip-eval` (adapter-only save,
no in-kernel 16-bit merge — the R19 OOM spot; merge locally after download via the
build-r19-merged.py pattern) ⇒ **~45-60 min kernel + queue**, fits the budget.
**PUSHED + RUNNING (17:46 EDT)**: dataset `stevenawoods/round20-orpo-corpus` (104 pairs,
238KB) + kernel **`stevenawoods/vaca-qlora-round20-orpo`** — NOTE the actual slug gained
the `-orpo` suffix (title-slug resolution; the setup script's metadata id
`vaca-qlora-round20` ≠ the real slug — use `vaca-qlora-round20-orpo` for
status/output/download). GPU granted immediately, ETA ~18:30-18:45 EDT.
After COMPLETE: download adapter (checkpoint recovery if the run errors),
merge LOCALLY (build-r19-merged.py pattern — no in-kernel merge), deploy only with user OK
(swaps the live dspark model).
**WATCHDOG**: `scripts/kaggle-watch-round20.sh` live in tmux `r20-watch` (poll 300s,
log /tmp/kaggle-watch-round20.log) — on COMPLETE it auto-downloads results.zip to
`training/cloud/out/round20/` and prints the local-merge steps; `--once` for a single check.

**v1/v2 ERRORED, v3 COMPLETED (17:46→19:36 EDT)**: v1 OOM'd at step 0/12 (batch 2 ×
seq 3072 — ORPO needs ~2× SFT memory). v2 (batch 1 × accum 8, seq 2048) got 6/12 steps
then OOM'd needing 686 MiB with ~380 free. **v3 = seq 1280** (measured corpus p50 ≈ 330 /
p90 ≈ 610 / p99 ≈ 1074 tokens — only ONE 7800-char outlier truncates) freed ~1.3 GB
⇒ **COMPLETE**: 12/12 steps in 553s (9.2 min), train_loss 1.501, rewards/accuracies 0.525
(chosen preferred 52.5% of rows), SANITY OK (adapter differs from loaded R19). **Adapter
downloaded → `training/cloud/out/round20/`** (adapter_round20/ 132MB + checkpoint-12 +
results.zip). Quota used total ≈ 43 min of the 1h40m.
**NEXT (local, needs user OK — swaps the live dspark model)**: `python3
scripts/build-r20-merged.py` (merge to 16-bit — MUST pause dspark first, it holds the
GPUs) then `bash scripts/deploy-round20.sh` (convert → q4_k_m → restart dspark → push
`vaca-r20-adapter` for R21 chaining). Both scripts written + syntax-validated.

**Update (Aug 17 seed run)**: three batches via `scripts/run-orpo-seed.py` produced
**33 real pairs** in `orpo-pairs.jsonl` across 15 apps (flashcard ×5, markdown blog ×4,
quiz ×3, budget splitter ×3, then ×2 for habit tracker/note-taking/kanban/pomodoro/
expense/music playlist/tic-tac-toe, ×1 for temp converter/todo CLI/contact book/log
analyzer) — all finals re-verified tsc-clean, all chosen≠rejected. New error classes
beyond the original three: TS5097 (.ts-extension imports), TS1005 (syntax), TS2459,
TS2554, TS2341 — telemetry captures them automatically. ORPO is runnable; more capture
sessions keep filling the file. Rough target before an ORPO round: 100+ pairs.

## R20 pipeline (when ready)

Corpus builder `build-r19-corpus.py` pattern → resume from `vaca-r19-adapter` (exists on
Kaggle) → kernel `vaca-qlora-round20`. 10h weekly Kaggle quota is the hard constraint
(cap corpus ~1,900 rows ≈ 6.5h; the R19 kernel OOM'd its merge witness — for R20 skip the
in-kernel merge when `--no-gguf`).
