# VACA App Change List

> Each item maps to a failure in `VACA_BUILD_TRIAGE.md` (F1–F11). Ordered by impact. All changes are in `backend/src` unless noted.
> **Status legend:** ✅ implemented 2026-08-13 · ⬜ open

## Implemented (2026-08-13)

| # | Change | Files | Status |
|---|--------|-------|--------|
| 1 | Entry point imports only VALUE exports (skip interfaces/types) + guarded auto-bootstrap call for non-UI projects | `backend/src/export/perFileScaffolder.ts` + 3 new unit tests | ✅ |
| 2 | Sandbox language pass-through: Go/Python/Rust no longer compiled as TypeScript (`osToLanguage` mapped everything to TS → bogus TS1434 on every Go file) | `backend/src/sandbox/runner.ts` | ✅ |
| 3 | Go module path from sanitized slug (was raw project title with spaces → `malformed import path`) + skip `package main` self-import in the Go entry | `backend/src/layers/fileGenerator.ts`, `backend/src/export/perFileScaffolder.ts` | ✅ |
| 4 | Prompt-artifact gate (`REAL FILE CONTENT`, `injected by the platform`, ...) added to learning + capture gates | `backend/src/knowledge/learningEngine.ts`, `backend/src/training/verifiedGenerationCapture.ts` | ✅ |
| 5 | Client-only prompt guard: browser apps told never to emit DATABASE_URL/secrets/placeholders | `backend/src/layers/fileGenerator.ts` | ✅ |
| 6 | Repaired `todo-app/` (checked-in generated app): stripped markdown fences from 9 files (4 .tsx, package.json, tsconfig, .npmrc, 2 .gitignore) — it now compiles | `todo-app/*` | ✅ |
| 7 | **Deterministic repair fixes before the LLM ever sees errors**: (a) import-collision guard — `findLocalDeclaredNames` drops auto-imported names the file declares locally (kills the `types.ts` TS2440/TS2395/TS2300 class without the LLM); (b) same-name field/method collision lint feeding exact rename hints (kills the `grid.ts` TS2300 class); (c) tsc-gate `globals.d.ts` so CLI `process`/node globals don't false-positive TS2580. Measured on the todo build: 43 → 0 structural tsc errors | `backend/src/layers/fileGenerator.ts` + tests | ✅ |
| 8 | **Funnel gate on the knowledge store**: `isQualityCode` extracted to shared `qualityGate.ts`; `addPattern()` itself now enforces the `AUTO_LEARN_DISABLED` kill switch + quality gate and returns `null` on rejection — closes ALL bypass paths (LLM ServiceTools add, `POST /api/knowledge/`, scanner, auto-learn export, scripts), not just the two chokepoints | `backend/src/knowledge/qualityGate.ts` (new), `knowledgeStore.ts`, `learningEngine.ts`, `routes/knowledge.ts`, `tools/tools/ServiceTools.ts`, `routes/scanner.ts`, `services/autoLearnService.ts`, `index.ts` | ✅ |
| 9 | **Purged poisoned training data**: 90 fence/separator/artifact-poisoned JSONL files removed from `backend/knowledge/auto-learn/` + 575 poisoned copies from `llm-training-app/data/uploads/` (re-scan: 0 poisoned remain in either; MindSpace/datasheets-growth dirs clean) | `backend/knowledge/auto-learn/*.jsonl`, `llm-training-app/data/uploads/*.jsonl` | ✅ |
| 10 | **R16 anti-fence training round** — root-cause fix for the fence/prose poisoning baked into R10-14 (the deployed R15's lineage). Clean corpus (613 rows, 552 train / 61 val) built by re-filtering R10-15 through the `isQualityCode` gate + tsc-gated verified generations; 347 poisoned rows rejected; pushed to Kaggle and RUNNING (v2 fixed the missing `pip install` cell + title-slug 409). | `scripts/build-r16-antifence-corpus.py`, `scripts/build-round16-kaggle-notebook.py`, `scripts/kaggle-setup-round16.sh`, `training/cloud/kaggle/*-round16*` | ✅ pushed, training |
| 11 | **R16 download → merge → deploy pipeline** — `download-round16-merged.py` (kernel artifacts), `build-r16-merged.py` (base + adapter_round16 via unsloth `merged_16bit`; the LoRA chain telescopes so the vanished R14/R15 fp16 shards are unnecessary), `deploy-round16.sh` (q4_k_m → dspark, backs up + drops R15), `kaggle-watch-round16.sh` (auto: poll → download → merge → deploy → probe), `probe-r16.py` (anti-fence battery using a Python port of `isQualityCode`, gate verified 6/6 against the TS gate) | `scripts/download-round16-merged.py`, `scripts/build-r16-merged.py`, `scripts/deploy-round16.sh`, `scripts/kaggle-watch-round16.sh`, `scripts/probe-r16.py` | ✅ ready (runs when kernel COMPLETEs) |
| 12 | **Pre-build GUI mockup (GUI before code)** — new `POST /api/blueprint/mockup`: matches the goal to the blueprint bible (same resolver as `/build`), renders a DETERMINISTIC mockup of how the app's interface should look (module sidebar, per-module cards, data-flow strip, stack chips, palette from the blueprint) with NO LLM call and NO file generation, and screenshots it to a real PNG via headless Chromium (Playwright, already in the stack). Frontend (both entry points): "Build from Description" offers **🎨 Preview GUI First** and the wizard's welcome step adds **🎨 Preview GUI** next to Find Designs — both show the image (HTML iframe fallback) + matched blueprint/modules/score, then "✅ Looks Good" proceeds to the existing flow. **Theme + layout pickers** (7 themes: ocean/violet/emerald/rose/amber/slate/cyan; 3 layouts: sidebar/dashboard/topnav) available in both entry points. Verified live: recipe → `recipe_manager_2` (1.0), chess → `checkers_2`, pomodoro → `pomodoro_timer_3` (1.0), PNG in ~0.5–1.5s, vision-reviewed clean | `backend/src/blueprint/mockup.ts` (new) + `mockup.test.ts` (new), `backend/src/routes/blueprint.ts`, `frontend/src/api/client.ts`, `frontend/src/components/BlueprintBuildDialog.tsx` + `.css`, `frontend/src/components/MasterNode.tsx` + `.css` | ✅ |
| 13 | **Blueprint drift report (mockup ↔ build verification)** — `compareModulesToFiles` (pure, in `mockup.ts`): compares the modules the mockup PROMISED (blueprint architecture_checklist) against the files the build actually produced, excluding the auto preview wrapper, case-insensitively. `POST /api/blueprint/build` now returns a `drift` object; BlueprintBuildDialog's done screen shows "✅ Mockup ↔ Build in sync" or lists **missing** (promised but no file) and **unexpected** (file not in the mockup) modules with a count. Verified live: pomodoro build → 5/5 matched, clean:true; synthetic drift → data_store missing + mystery_extra unexpected, clean:false | `backend/src/blueprint/mockup.ts` + `mockup.test.ts` (+6 tests), `backend/src/routes/blueprint.ts`, `frontend/src/components/BlueprintBuildDialog.tsx` + `.css` | ✅ |
| 15 | **Chat "🖥 Show Preview" button** — every AI chat message now has a **🖥 Show Preview** button next to the existing 🔊 speak button. It bumps a new `previewRequestToken` in the project store (`requestPreview()`); App.tsx watches the token and opens the floating preview window. The other chat elements the user listed (reactions 👍😕🚀😡😂🤩+❤️ via `MessageReactions`, `👤 You` / `LLM 1` role labels, 🔊 TTS) already existed and are untouched | `frontend/src/store/projectStore.ts`, `frontend/src/App.tsx`, `frontend/src/components/ReasoningPanel.tsx`, `frontend/src/components/TerminalSection.css` | ✅ |
| 14 | **♻️ Regenerate Missing Modules (drift repair)** — BlueprintBuildDialog captures the build's `projectId` + node-id↔label mapping; when the drift report shows missing modules, the done screen offers **♻️ Regenerate N Missing Modules**. It re-generates ONLY the drifted nodes via the existing per-file endpoint (`POST /api/generate/:projectId/file/:nodeId`), attaches each result to its canvas node, folds regenerated modules back into the drift state (clean when all resolved), and shows a per-module ✅/❌ result list + terminal broadcast. Nothing else is re-generated — no full rebuild, no LLM on untouched files. Verified live: per-node regenerate on a chess build returned real code (HTTP 200); frontend + backend tsc clean, 1014 tests pass | `frontend/src/components/BlueprintBuildDialog.tsx` + `.css` | ✅ |
| 16 | **Chat reactions synced to the backend (cross-device persistence)** — reactions previously lived only in `localStorage` (`ai-reactions`). New `POST/GET /api/reactions/:messageId` persists to `data/chat-reactions.json`; the toggle semantics (un-react on same emoji, switch on different) moved server-side into a pure `applyReaction()` so counts stay consistent across devices. Each client sends a stable anonymous `userId` (localStorage `vaia-reaction-user-id`, generated via `crypto.randomUUID()`); the backend stores per-message `counts` + `userId→emoji` map. Frontend paints from the local cache instantly, then overrides with the authoritative server state on mount and after every click; if the backend is unreachable it falls back to the localStorage cache. Verified live: alice👍+bob👍 → count 2, bob switches to 🚀 → 👍:1/🚀:1, alice un-reacts → 🚀:1, bad emoji → 400, missing userId → 400; 1021 backend tests pass | `backend/src/routes/reactions.ts` (new) + `reactions.test.ts` (new, 7 tests), `backend/src/index.ts`, `frontend/src/api/client.ts`, `frontend/src/components/MessageReactions.tsx` | ✅ |
| 17 | **Smart "Show Preview" — live app when built, GUI mockup when not** — the chat's 🖥 Show Preview button now does exactly what the user described: it opens the floating preview and, if the app has generated code or a site preview URL, shows the live app. If NOTHING has been generated yet, it calls `/api/blueprint/mockup` with a goal (the user's own preceding chat message → `previewRequestGoal`, else the wizard's `userGoal`/`projectName`) and shows the deterministic **planned-interface mockup** (image, appType badge, match score, module chips, "no code generated yet") inside the floating window via the new `MockupPreviewPanel`, with loading/error/empty states. The window title switches to "Planned Interface". Verified live: minimal `{goal, purpose, targetOS}` payload → `pomodoro_timer_3` (1.0), 5 modules, PNG+HTML; 161 frontend tests + 41 store tests pass, tsc + vite build clean | `frontend/src/components/MockupPreviewPanel.tsx` + `.css` (new), `frontend/src/App.tsx`, `frontend/src/components/ReasoningPanel.tsx`, `frontend/src/store/projectStore.ts` | ✅ |
| 18 | **⚡ Build This Now inside the mockup preview** — the planned-interface mockup in the floating window now has a **⚡ Build This Now** button that goes straight to generating the code: it bumps a new `blueprintRequestToken` + goal/purpose (`requestBlueprintBuild`) in the store; App.tsx closes the floating window and opens the BlueprintBuildDialog pre-filled with that goal, which **auto-starts the existing build flow** (`POST /api/blueprint/build` → live progress → project loaded into canvas with code attached + drift report). The dialog consumes the request on mount (`clearBlueprintRequest`), so normal "Build from Description" opens are never pre-filled or auto-started by a stale request. Verified live: the exact auto-start payload → `pomodoro_timer_3` (1.0), 6 files, drift `clean:true`; 45 store tests (4 new) + 161 frontend tests pass, tsc + vite build clean | `frontend/src/components/MockupPreviewPanel.tsx` + `.css`, `frontend/src/components/BlueprintBuildDialog.tsx`, `frontend/src/App.tsx`, `frontend/src/store/projectStore.ts`, `frontend/src/__tests__/projectStore.test.ts` | ✅ |
| 19 | **LLM-aware auto preview — no button needed** — (a) `maybeAutoPreview()` in ReasoningPanel fires automatically when `processUserRequest` senses a build request (`detectBuildIntent`) OR an explicit preview ask ("show me a preview of X", "preview of X" — regexes verified against 6 phrasings, goal extracted by stripping the prefix), but ONLY while nothing is generated yet (no site preview URL / no node with code) so the live preview/canvas aren't fighting a popup on every message. It carries the goal into the smart preview (700ms delay + re-check), so the planned-interface mockup just appears. (b) The chat system prompt gains a `PREVIEW_MENTION_RULE` telling the LLM to mention the GUI preview in ONE short sentence when the user asks to build/show/preview an app ("I've opened a GUI preview of how it will look"), point at ⚡ Build This Now when nothing's built, or the 🖥 Show Preview button when it is — worded to stay truthful. Verified live: extracted goal "a chess app" → `chess_game` (0.63), 6 modules, PNG; 165 frontend tests pass, tsc + vite build clean | `frontend/src/components/ReasoningPanel.tsx` | ✅ |
| 20 | **Preview toast — explains the auto-opened mockup** — when the planned-interface mockup actually renders (mockup data present, not loading), a small fixed top-center toast appears: "🎨 Opened a GUI preview of how your app will look — click ⚡ Build This Now to generate the code." Auto-dismisses after 6s (timer ref, cleared on re-trigger/unmount) and has a ✕ dismiss button; disappears immediately when the window switches back to the live preview. Re-shows on each re-render/Redesign. Styled to the app's dark palette with a slide-in animation (`preview-toast-slidein`) — the pre-existing ReasoningPanel toast referenced `toast-slidein` keyframes that were never defined, so this one ships its own. 165 frontend tests pass, tsc + vite build clean | `frontend/src/App.tsx`, `frontend/src/App.css` | ✅ |
| 21 | **Auto GUI Preview toggle in Settings** — the ProjectManager settings dropdown (next to Fast Preview Mode) gains a **🎨 Auto GUI Preview** toggle, default ON. When OFF, the chat never auto-opens the mockup popup on build requests — the single chokepoint (`maybeAutoPreview` in ReasoningPanel) early-returns via `isAutoPreviewEnabled()` (localStorage `vaia-auto-preview`, `!== 'false'` so unset = ON). The explicit 🖥 Show Preview button, ⚡ Build This Now, and the smart live-vs-mockup window are unaffected — only the automatic popup is disabled. Toggle semantics verified (unset/true → enabled, false → disabled); 165 frontend tests pass, tsc + vite build clean | `frontend/src/components/ProjectManager.tsx`, `frontend/src/components/ReasoningPanel.tsx` | ✅ |
| 22 | **Preview toast once per session (+ persisted dismissals)** — the preview toast is now keyed by the mockup's blueprint `appType` and shows at most once per session per preview (in-memory seen-set in App.tsx), so Redesign/re-render of the same mockup never re-toasts. Clicking ✕ persists the key via `utils/previewToastPrefs.ts` (localStorage `vaia-preview-toast-dismissed`) so that preview never nags again across sessions either. Corrupt storage handled (starts empty), persist idempotent. 170 frontend tests pass (5 new), tsc + vite build clean | `frontend/src/utils/previewToastPrefs.ts` (new) + `frontend/src/__tests__/previewToastPrefs.test.ts` (new), `frontend/src/App.tsx` | ✅ |
| 23 | **Toast links to the Auto GUI Preview toggle** — the preview toast gains a **⚙ Auto Preview setting** button that bumps a new `settingsOpenToken` in the store (`requestOpenSettings`); ProjectManager watches it, opens the Settings dropdown, and briefly pulses the **🎨 Auto GUI Preview** row (`settings-row-pulse` keyframes, 3s) so the user can see exactly which setting controls the popup. The toast dismisses on click. 171 frontend tests pass (1 new store test), tsc + vite build clean | `frontend/src/store/projectStore.ts`, `frontend/src/components/ProjectManager.tsx` + `.css`, `frontend/src/App.tsx` + `.css`, `frontend/src/__tests__/projectStore.test.ts` | ✅ |
| 24 | **Browser-QA found + fixed: Build This Now auto-start broken under React StrictMode** — a full Playwright walk of the preview flow (chat "show me a preview" → mockup → toast → settings link → Build This Now) revealed the dialog stayed on the form: the auto-start used a pre-set ref guard + setTimeout, and StrictMode's dev double-mount (mount → cleanup → mount) cleared the timer then skipped rescheduling, so `handleBuild` never fired (works in prod build, broken in dev). Fixed by moving the guard INSIDE the timeout callback (second mount schedules a fresh timer; only one build can start). Verified in-browser: dialog leaves the form, matches blueprint, generates batches, reaches "✅ Generation complete — loading into canvas". Kept `scripts/preview-e2e.mjs` + `scripts/probe-autostart.mjs` as regression/diagnostic tools | `frontend/src/components/BlueprintBuildDialog.tsx` | ✅ |
| 25 | **Browser-QA robustness fix: LLM calls now fail fast instead of hanging forever** — the build pipeline's translator (`backend/src/ai/translator.ts`) only applied an abort timeout when the caller passed `timeoutMs`, and the fileGenerator's `reason`/`reasonFast` pass none — so a wedged model request hung the build indefinitely (observed in the browser walk: batches stalled, no error, no dspark activity). Now `callOpenAIWithTokens` always applies `AbortSignal.timeout` with a 300s default (callers can still override) and the fast-coder tier calls get a 120s default; the fallback wrapper rethrows abort/timeout errors (no bogus Ollama fallback), so a wedged endpoint surfaces as a clean error → the node gets a flagged placeholder and the build finishes with `isAllValidated:false` + drift report instead of hanging. Verified: builds still complete (curl 162s direct, ~60s browser probe); backend 860 tests pass, tsc clean | `backend/src/ai/translator.ts` | ✅ |
| 26 | **Auto-learn in-generation capture was dead code — nothing ever landed from the canvas path** — the per-file hook in `fileGenerator.generateFiles` passed raw pre-assembly model output and ran BEFORE `generatedCode` was written back to the project nodes, so `learningEngine.learnFromProject`'s node loop always found empty code and silently no-oped (verified end-to-end: a clean 3-node build stored 0 patterns even with capture enabled; only the manual `POST /api/knowledge/learn` worked). Now capture runs ONCE after all files are assembled, on a shallow-copied project with each validated file's code attached, gated by the SAME `tsCompileClean` stamp as the training capture (broken output still never enters the store). Verified: clean single-file build stored 2 patterns in-generation (node pattern + full-architecture), broken build stored 0; backend 865 tests pass, tsc clean | `backend/src/layers/fileGenerator.ts` | ✅ |
| 27 | **Tool knowledge re-registered on every backend restart (store doubled 21 → 42)** — `registerToolKnowledge` in `src/index.ts` added all 21 tool patterns unconditionally at startup; harmless while `AUTO_LEARN_DISABLED=true` (the funnel rejected them) but once capture was re-enabled each restart doubled the store. Now registration is idempotent: entries whose title already exists for the `tool-system` project are skipped. Verified: restart kept the store at exactly 23 (no re-registration); backend 865 tests pass, tsc clean | `backend/src/index.ts` | ✅ |
| 28 | **Export-to-studio queue signal was dead — `metadata.json` never created, so the Training Studio never saw exports** — `POST /api/knowledge/export-to-studio` only updated `llm-training-app/data/metadata.json` when it ALREADY existed (and even then set `in_queue: false`), so on a fresh studio the export landed in uploads/ but was invisible. The studio discovers files via that metadata's `{ files, training_queue }` (same convention as the datasheet routes in `routes/training.ts`). Now the endpoint creates `metadata.json` if missing and rebuilds the queue from ALL uploads with `in_queue: true` — the export is immediately visible as 'Ready for Training'. Verified: metadata.json created with 1183 files queued (architect_patterns.jsonl first), idempotent on re-export (still exactly 1 entry); backend 865 tests pass, tsc clean | `backend/src/routes/knowledge.ts` | ✅ |
| 26 | **Preview iframe now wires multi-file builds (esbuild bundling)** — the preview wrapper (`generatePreviewHtml`) previously wrapped each file in a namespace IIFE and `stripTypeScriptKeepExports` ELIDED `import` statements, so any file importing a sibling crashed with a ReferenceError (seen live: the 5-module chess build — `ui_screens` importing `ChessEngine` from `core-engine` — previewed blank/errored). Now the TS/JS files are BUNDLED with esbuild (files staged in a temp dir mirroring their label-based paths, a virtual entry imports each as a namespace and calls preferred entry exports with #app-container), so cross-module imports resolve inside the srcdoc iframe. Falls back to the legacy IIFE assembly when bundling fails (bare package imports) so previews still render. Also fixed: (a) the first-export auto-call invoked CLASS constructors without `new` (chess `core_engine.ChessEngine` tripped it) — classes are now skipped via a `/^class\s/` guard; (b) a pre-existing unescaped apostrophe (`This app\'s`, one backslash → consumed by the template literal) made the init script a SYNTAX error on every preview — now `\'`. Verified end-to-end: the live chess project's preview boots in headless Chromium with zero errors (runtime-smoke all green, 3 buttons clicked, UI responds); 19 new/updated unit tests; backend 865 tests pass, tsc clean; esbuild added to backend deps | `backend/src/layers/fileGenerator.ts` (+ tests), `backend/package.json` | ✅ |
| 29 | **Real "Session History" window — VACA can now actually show it (was: claimed a GUI preview opened and did nothing)** — the chat's canned `PREVIEW_MENTION_RULE` line ("I've opened a GUI preview…") fired for "can you show me the session history" with nothing behind it. Now: (a) new `SessionHistoryPanel` in the floating preview window with 3 tabs — 💬 Conversation (recent chat from localStorage), 🏗 Builds (`/api/session/builds`), 💾 Sessions (`/api/session/list` with a Load button that restores the snapshot to the canvas + broadcasts a confirmation line); (b) new store token `sessionHistoryRequestToken` / `requestSessionHistory()`; App.tsx opens the window in a new `session-history` preview mode (title "Session History", 📜 icon); (c) `detectSessionHistoryIntent` (pure util, unit-tested) auto-opens the window from the chat for "show me the session history / what was our last session / how far back does your memory go…" — guarded so app builds that merely describe a "session history" feature ("a pomodoro timer with session history") never trigger it; (d) every AI message gains a 📜 Session History button next to 🖥 Show Preview; (e) the chat system prompt gains a `SESSION_HISTORY_RULE` telling the LLM to truthfully say "I've opened your session history…" and never claim the GUI preview opened for session-history questions. 176 frontend tests pass (5 new), tsc + vite build clean | `frontend/src/components/SessionHistoryPanel.tsx` + `.css` (new), `frontend/src/utils/sessionHistory.ts` (new) + `frontend/src/__tests__/sessionHistory.test.ts` (new), `frontend/src/store/projectStore.ts`, `frontend/src/App.tsx`, `frontend/src/components/ReasoningPanel.tsx`, `frontend/src/__tests__/projectStore.test.ts` | ✅ |
| 30 | **Real "Show your wiki" window — VACA can now actually show her wiki (same bug family: "can you show your wiki" got the canned GUI-preview line and nothing opened)** — (a) NEW backend `GET /api/wiki` (`routes/wiki.ts`): reads `modelVeronice.txt` and parses it into numbered sections — robust to wrapped multi-line titles AND hand-appended sections with no leading separator (49–51), using a monotonic-number fallback so body lists like "1. PASSWORD MANAGERS" are never mistaken for headers; returns `{ sections, totalSections, lastUpdated }` (52 sections live); (b) NEW `WikiPanel` in the floating preview window — searchable numbered section list + preformatted section body, defaults to the newest section, loading/error/empty states, 🔄 refresh; (c) new store token `wikiRequestToken` / `requestWiki()`; App.tsx opens it in a new `wiki` preview mode (title "VACA Wiki", 📗 icon); (d) `detectWikiIntent` (pure util, unit-tested) auto-opens the window from the chat for "show your wiki / open the wiki / read your wiki" — guarded so memory writes ("write this into your wiki") and knowledge queries ("what does your wiki say about X") never trigger it; (e) every AI message gains a 📗 Wiki button; (f) the chat system prompt gains a `WIKI_RULE` telling the LLM to truthfully say "I've opened my wiki — it has 52 sections" and never claim the GUI preview opened for a wiki question. Verified: endpoint live (52 sections, lastUpdated), 870 backend tests (5 new) + 181 frontend tests (5 new), tsc clean both, vite build clean | `backend/src/routes/wiki.ts` (new) + `wiki.test.ts` (new), `backend/src/index.ts`, `frontend/src/components/WikiPanel.tsx` + `.css` (new), `frontend/src/utils/wikiIntent.ts` (new) + `frontend/src/__tests__/wikiIntent.test.ts` (new), `frontend/src/store/projectStore.ts`, `frontend/src/App.tsx`, `frontend/src/components/ReasoningPanel.tsx`, `frontend/src/__tests__/projectStore.test.ts` | ✅ |
| 31 | **Deep Scan → Node Build now shows how the app connects to its files AND other apps** — the drag-drop deep scan already produced module nodes; now every scan ALSO yields: (a) **file nodes** — one small node per file under its module (capped at 8/module, the rest fold into a "📁 +N more files" node), typed + emoji'd by extension, so the graph literally shows file↔module wiring; (b) **external connection nodes** — new deterministic `buildScanConnections()` (+`detectApps()`) in `routes/scanner.ts` classifies every reference: bare imports + package.json deps → 📦 package nodes, fetch/axios/WebSocket URL calls → 🌐 service nodes, cross-folder relative imports → 🔗 sibling-app nodes, each wired from the file nodes that use them; (c) **multi-app drops** — dropping several folders together detects the apps (`architecture.apps`) and links them; (d) module edges now carry the import description as a label; (e) every module node carries its `files[]` (rendered as a 📄 chip in the node); (f) the scan preview panel shows apps detected, external connections (icon/name/kind/usage), and each module's files before applying; master node summarizes modules/files/external counts. Deep-scan file cap raised 150 → 400. Verified live: 2-app payload → apps [frontend, backend], 8 external connections (axios, react, express, cors, @prisma/client, api.stripe.com, example.com/webhook, 🔗 backend); false positives (import binding "React", junk "{") filtered by uppercase/valid-name guards. 879 backend tests (9 new) + 181 frontend tests, tsc clean both, vite build clean | `backend/src/routes/scanner.ts` + `scanner.test.ts` (new), `frontend/src/components/FileDropHandler.tsx` + `.css`, `frontend/src/types.ts`, `frontend/src/components/CustomNode.tsx` + `.css` | ✅ |
| 32 | **Real "Open the todo list" window — VACA can now actually show the deep-scan TODO fixes.txt (same bug family: "can you open the todo list" got the canned GUI-preview line and nothing opened)** — (a) NEW backend `GET /api/todo` (`routes/todo.ts`): reads the repo-root `TODO fixes.txt` and parses it into the 8 `SECTION N — TITLE` blocks with their `[ ]`/`[x]` checkbox items (indented continuations folded in, `[x]` → done), priority tags parsed from titles (`P0`, `P0/P1`, …), everything before the first SECTION captured as free-form meta; returns `{ sections, summary (total/open/done + byPriority), meta, lastUpdated }` (live: 38 items, 33 open, 5 done); (b) NEW `TodoPanel` in the floating preview window — summary chips (open/done/P0-open), collapsible scan-summary meta, searchable section list with priority badges and ☐/☑ items (done struck through), 🔄 refresh; (c) new store token `todoRequestToken` / `requestTodo()`; App.tsx opens it in a new `todo` preview mode (title "VACA Todo List", 📋 icon); (d) `detectTodoIntent` (pure util, unit-tested) auto-opens the window from the chat for "can you open the todo list / show me your todo list / display the todos / what's on the todo list" — guarded so app builds ("build me a todo app") and list updates ("add X to the todo list", "mark 2.1 done") never trigger it; (e) every AI message gains a 📋 Todo List button; (f) the chat system prompt gains a `TODO_RULE` telling the LLM to truthfully say "I've opened the todo list…" and never claim the GUI preview opened for a todo-list question. Verified: endpoint live (8 sections, 38 items, lastUpdated), 883 backend tests (4 new) + 186 frontend tests (5 new), tsc clean both, vite build clean | `backend/src/routes/todo.ts` (new) + `todo.test.ts` (new), `backend/src/index.ts`, `frontend/src/components/TodoPanel.tsx` + `.css` (new), `frontend/src/utils/todoIntent.ts` (new) + `frontend/src/__tests__/todoIntent.test.ts` (new), `frontend/src/store/projectStore.ts`, `frontend/src/App.tsx`, `frontend/src/components/ReasoningPanel.tsx`, `frontend/src/__tests__/projectStore.test.ts` | ✅ |

## 1. Entry point: import only runtime values, then call the app — [F1, F2]

**File:** `backend/src/export/perFileScaffolder.ts` → `buildTsEntryPoint`

- Filter `file.exports` to *values only* before picking the import name. Type-only names (`interface`/`type` declarations) must be skipped — the extraction in the file generator should mark export kind (`value` vs `type`), and the scaffolder should ignore `type`-kind names for `import { X }`.
- After the import block, emit a guarded bootstrap call for the project's main entry symbol, e.g.:
  ```ts
  // ── Bootstrap ──
  (globalThis as any).start?.();
  ```
  (or `main?.()`) so CLI/browser apps actually run. Prefer invoking the symbol named `start`/`main`/`runApp` when present.
- Same for Go: `func main()` must call the app entry, not only `println`.

**Acceptance:** every exported TS project's `npm start` runs the app; no `does not provide an export named` crashes.

## 2. Language-aware compile gate — [F3]

**File:** `backend/src/layers/fileGenerator.ts` (the tsc gate around generation) + `backend/src/routes/generation.ts` (summary)

- Group generated files by language. Run `tsc --noEmit` only over TS/JS files. Run `go vet`/`go build` for Go, `gofmt -e`/`python -m py_compile` for others.
- Never assemble Go/CSS/HTML content into `index.ts`.
- `tsCompileClean` must be per-language and *all* must pass before `isAllValidated` can be true. Kill the current contradiction (build 3 reported `tsCompileClean:true` while 8/9 files failed).
- CSS/HTML files: exclude from TS compile; wire via `<link rel="stylesheet">`/`<script>` in the preview wrapper.

**Acceptance:** `isAllValidated` is false whenever any per-language gate fails; the verdict is reproducible by an independent `tsc`/`go build` run.

## 3. Runtime smoke: skip non-browser apps — [F4]

**File:** `backend/src/sandbox/runtimeSmokeTest.ts` + call site in `backend/src/routes/generation.ts`

- Gate on "has a UI node in a web language (ts/js/html)" before booting Chromium.
- For CLI/Go apps, run a headless process smoke instead: `tsx index.ts` (or `go run .`) with piped fixture input and a 5s timeout; assert exit 0 and expected stdout contains a real app behavior, not just the banner.

**Acceptance:** Go and CLI builds don't produce browser `pageerror` smoke results; their smoke reflects their actual runtime.

## 4. Go scaffolder: module path from go.mod, no self-imports — [F5]

**File:** `backend/src/export/perFileScaffolder.ts` → Go entry + import building

- Compute the Go module name once (sanitized slug, matching `go.mod`), pass it into every per-file prompt's import list, and build all import statements from it.
- Reject/repair `import "<module>/src/main"` (a program package) — main must never be imported by others.
- Prompt rule for Go files: import paths = `<module>/<dir>` only, where `<module>` is the exact `go.mod` module name.

**Acceptance:** `go build ./...` succeeds on exported Go projects.

## 5. Ban prompt artifacts in generated files — [F6]

**Files:** `backend/src/knowledge/learningEngine.ts` (gate), `backend/src/training/verifiedGenerationCapture.ts`, and the per-file generation prompt in `backend/src/layers/fileGenerator.ts`

- Add to `MARKDOWN`-style rejections: `/REAL FILE CONTENT/i`, `/injected by the platform/i`, `/generated for the "[^"]+" node/i`, `/entry point for the node/i`.
- Add the same to the prompt: "Never write instruction text, placeholder markers, or the word 'REAL FILE CONTENT' into the file."

**Acceptance:** no generated file contains prompt scaffolding; gate rejects such files for learning/capture.

## 6. Repair loop must fix all tsc errors, not just imports — [F7, F8]

**Files:** `backend/src/layers/fileGenerator.ts` (repair routing), `backend/src/routes/codePlanner.ts` (contract verifier)

- Route every tsc error class into repair: TS2339 (missing member), TS2345/TS2322 (shape mismatch), TS2440/TS2300/TS2395 (duplicate/conflicting identifiers), TS2588 (const assignment), TS2554 (arity).
- Pre-repair deterministic lint (no LLM): flag (a) an import binding that collides with a local declaration, (b) a field and method with the same name, (c) references to members not in the dependency's declared export list. Feed the exact rename/fix to the repair prompt.
- Give the repair prompt the dependency files' *real* export signatures (IMPORT TARGETS already carries the names — extend it with kinds: `class`, `function`, `const`, `type`) and instruct: "call ONLY members listed; if a member is genuinely missing, implement it as a local helper with a different name."
- Cap: if a file still fails after N rounds, mark it failed (it already does) — but then `isAllValidated` must be false (it is) **and** the UI/report must surface which files, so the user never sees a green check.

**Acceptance:** rerunning the three triage builds yields 0 tsc errors after repair.

## 7. Client-only guard on file content — [F9]

**Files:** `backend/src/layers/fileGenerator.ts` (prompt builder), `backend/src/scanner/CodeScanner.ts`

- When the project is client-side (`isClientSideRequest` true), append to every file prompt: "This is a client-only app: NO database, NO secrets, NO server config (no DATABASE_URL/SECRET_KEY/API_KEY/process.env), no fetch to nonexistent APIs."
- Hard-fail the security scan on `DATABASE_URL`/`SECRET_KEY`/`API_KEY`/`your...Here`/placeholder secrets in client-side projects (codeScanner already detects hardcoded secrets — escalate client-side ones to failure, not warning).

**Acceptance:** no browser app ships `config.ts` with DB/secrets; security scan flags client-side placeholder secrets as defects.

## 8. Architect plan validation — [F10]

**File:** `backend/src/routes/architect.ts` (sanitizeNodes + language mapping)

- Coerce/reject node types not in `input|output|logic|api|database|ui` (currently `ui-functions` passed through).
- Domain-based language selection instead of OS-only: web/UI requests → TypeScript/JavaScript; CLI tools → TS/Go/Python; 3D/graphics → web (three.js-style canvas) or ask; never bare-Go for 3D with zero deps.
- Feasibility check on node descriptions: flag plans that promise 3D rendering/model-loading with no framework/dependency (feed back to the planner to downscope or pick a web stack).
- CLI requests: strip `ui`/`gui` nodes from the plan (build 1 shipped a GUI layer for a terminal app).

**Acceptance:** plan node types ⊆ allowed set; CLI apps have no UI nodes; 3D games are planned on a stack that can do 3D.

## 9. Stub detection covers silent stub bodies — [F11]

**File:** `backend/src/knowledge/learningEngine.ts` + repair routing

- Extend `STUB_PATTERNS` with: function bodies that are only `// comment`, `return <literal/default>` for a function with a non-trivial signature, `{}` empty bodies, `println`-only entry points (Go), `console.log`-only functions.
- These get flagged for repair and never stored as learned patterns.

**Acceptance:** no file consisting of a comment + `return nil`/empty body passes the quality gate.

---

## Verification loop for the change list

```bash
# after each change:
cd backend && npx tsc --noEmit && npx vitest run
# then re-run the triage:
node scripts/vaca-build-test.mjs "a command line todo list manager in TypeScript" "..." --out /tmp/app1
node scripts/vaca-build-test.mjs "a tic-tac-toe game in TypeScript" "..." --out /tmp/app2
node scripts/vaca-build-test.mjs "a 3d chess game..." "..." --out /tmp/app3
# gate: all three report isAllValidated:true AND independent tsc/go build is clean AND
# CLI app runs, tic-tac-toe renders + playable in headless Chrome, chess is real chess.
```

## Poisoning-loop quarantine (2026-08-13)

Closed the four back doors that bypassed the auto-learn kill switch:

1. **`addPattern()` is now the single gated funnel.** Every capture path (learning engine, auto-learn export, scanner, LLM `ServiceTools` knowledge-add tool, `POST /api/knowledge/`, batch scripts) goes through it, and it rejects anything while `AUTO_LEARN_DISABLED=true` **or** when `isQualityCode` fails — so re-enabling capture can't re-poison. Callers handle `null` (422 on the API, tool returns `KNOWLEDGE_REJECTED`).
2. **Shared gate module** `backend/src/knowledge/qualityGate.ts` — one definition of the poison markers (fences, `---` separators, prompt artifacts, prose, stubs, JSX-in-ts), used by both `learningEngine` and `knowledgeStore` (no circular import).
3. **Historical poisoned data purged** from both the auto-learn dir and the training uploads (the `importExistingData` path would otherwise re-import them the moment the switch is flipped back).

**Re-enable checklist (when the loop is proven fixed):**
1. `AUTO_LEARN_DISABLED=false` in `backend/.env` (or delete the line).
2. Confirm `training/dataset/verified-generations.jsonl` (the tsc-gated capture path) is the only auto-ingest source you trust.
3. Restart the backend — it re-registers tool patterns and resumes capture; the quality gate keeps running regardless.

## Undo scaffold training — VACA owns the scaffold (2026-10-03)

Direction: **VACA builds the scaffold; the LLM fills in the code VACA asks for.** Teaching the
model to invent the app's node graph / file plan / architecture was measured net-negative (the
per-file scaffold LLM step was removed 2026-10-02 — `runs/scaffold-ab/removed/REMOVAL.md`), and
some corpora still carried rows that taught exactly that behaviour. Those are now purged.

| Change | Files | Status |
|--------|-------|--------|
| **Purged 360 scaffolding rows** across the corpora (`design_arch` 33, `decompose` 2, `design_node_graph` 134, `canvas_nodes_q` 134, `app_template_q` 32, `build_me_blueprint` 25) | `kaggle_upload/{train,val}.jsonl`, `training/selfplay/corpus/vaca-domain.jsonl`, `training/selfplay/corpus/r1/{train,val}.jsonl`, `training/cloud/campaign50-dataset.zip` | ✅ |
| **Purge tool** with dry-run default, `.pre-scaffold-purge-<ts>` backups, and a `--self-test` classifier guard | `scripts/purge-scaffold-training-rows.py` (new) | ✅ |
| **Generator can never re-emit them**: filter centralized in `_rows()` (the choke point every miner passes through); removed the `Build me` / `Design the node graph` / `canvas nodes` / `Which nodes…` emission sites; added `--self-test` | `training/selfplay/vaca_domain.py` | ✅ |
| **Doctrine flipped**: `VACA_BRAIN_DOCTRINE` now says "VACA OWNS THE SCAFFOLD — YOU FILL IT IN" and forbids inventing/restructuring the plan; architect + plan prompts repositioned as "scaffold assistant inside VACA" | `backend/src/ai/prompts.ts`, `backend/src/routes/codePlanner.ts` | ✅ |

VACA-knowledge rows (`What blueprint shape does VACA require…`, `What is VACA's universal project
skeleton…`, `Explain VACA's node architecture…`) are deliberately **kept** — they teach the model
about the harness it should take its lead from, which is the point of the direction.

**Not needed:** unlearning the shipped adapter. The deployed corpora (`campaign50-dataset.zip`,
rounds 11–16) carried **0** architect/scaffold rows; the scaffold-role data (`scaffold-rows.jsonl`)
was generated but never merged into any QLoRA round.

## Scaffold self-improvement loop (2026-10-03)

VACA owns the scaffold, so the idle self-improvement loop now improves the **scaffold** — a
blueprint's `architecture_checklist` + `wiring_graph` (the module contracts VACA hands the model) —
instead of only the code inside a fixed plan. The LLM still only fills the files; it is never asked
to design the architecture.

| Change | Files | Status |
|--------|-------|--------|
| **Pure scaffold-variation core**: 5 mutation operators (`split_module`, `merge_modules`, `add_wiring`, `refine_contract`, `add_leaf_module`), variant validation (mirrors the bible's referential-integrity rule), scoring (adherence-led, margin-guarded), and an in-process 7-check adherence scorer that mirrors `acceptance_check.mjs` | `backend/src/services/scaffoldVariation.ts` (new) | ✅ |
| **The search loop** with an injectable builder (no compiler/browser/model needed to test): builds the incumbent, builds each variant, keeps the best only if it beats the incumbent by a margin | `backend/src/services/scaffoldExperiment.ts` (new) | ✅ |
| **Wired into `MicroExperimenterService`**: real builder = `blueprintToProject` → `FileGenerator.generateFiles` → score on tsc/adherence/smoke/drift/violations; winners stored in `data/scaffold-variants.json` (never auto-promoted — `loadBlueprints` scans recursively, so auto-writing there would add a competing blueprint) | `backend/src/services/microExperimenterService.ts`, `backend/src/layers/fileGenerator.ts` (surfaces `renderSmoke`/`cliSmoke` on the result) | ✅ |
| **HTTP surface**: `GET /api/experiments/scaffold-variants`, `POST /api/experiments/run-scaffold` | `backend/src/routes/experiments.ts` | ✅ |
| **Tests** (37 new): operators, non-mutation of inputs, variant validation, scoring/margin, the loop with a stubbed builder, and the adherence mirror | `backend/src/services/scaffoldVariation.test.ts`, `backend/src/services/scaffoldExperiment.test.ts` (new) | ✅ |

**Idle integration:** the idle loop now ALTERNATES micro-app and scaffold experiments (`IDLE_EXPERIMENTER_SCAFFOLD_EVERY`, default 2; 0 disables the scaffold side), so enabling the experimenter exercises both. `IDLE_EXPERIMENTER_SCAFFOLD_MAX_VARIANTS` caps variants per experiment (default 4). Enabled on the agent box (`IDLE_EXPERIMENTER_ENABLED=1`).

| Follow-on | Files | Status |
|-----------|-------|--------|
| **Explicit promote step**: `promoteScaffoldIdea(id)` overwrites the LIVE blueprint file that defines the app_type with the variant's checklist + wiring (backing the original up under `data/blueprint-backups/` first); only the scaffold fields change, identity (description/keywords/stack) is preserved. The loop never auto-promotes. | `backend/src/blueprint/bible.ts` (`findBlueprintFile`), `microExperimenterService.ts`, `backend/src/routes/experiments.ts` (`POST /api/experiments/promote-scaffold`) | ✅ |
| **Smoke verdicts surfaced**: the blueprint build response now carries `smoke: { render, cli, anyFailed }` (from the FileGenerator's `renderSmoke`/`cliSmoke`), and the build dialog shows a small **Behavioral smoke passed/failed** badge next to the drift block. | `backend/src/routes/blueprint.ts`, `backend/src/layers/fileGenerator.ts`, `frontend/src/components/BlueprintBuildDialog.tsx` + `.css` | ✅ |
| **Live verification (agent box)**: `POST /api/experiments/run-scaffold` on `generic_fullstack_app` built the incumbent + 2 variants with the real model — incumbent 5.333, `add_wiring` 5.333, `split_module` 5.347 → **kept the incumbent** (+0.014 is inside the 0.25 margin, exactly the noise guard working). | — | ✅ |

Note: the agent box's frontend was an older checkout missing the Tree Mode type surface; the promotion also synced `frontend/src/{types.ts,store/projectStore.ts,utils/{exportBuild.ts,autoSave.ts,projectStorage.ts},api/client.ts}` so its frontend tsc is clean.

## Related training

See `training/dataset/vaca-build-fixes.jsonl` (repair-pair rows for the observed failures) and the Lessons 9–12 added to `data/code-lessons.md` + `knowledge/patterns.json` (pure-code output, domain fidelity, bootstrap, contracts).

## Non-TS build hardening — CLI intent, language-aware contracts, compile repair (2026-10-03)

Triggered by a live **Java tic-tac-toe** build that VACA graded **FAIL**. The Java whole-project
gate (`javac`) correctly caught the breakage (no "tsc skipped = success" false positive), but the
run exposed four defects on the path *around* the gate. All four are fixed and re-verified live.

| Change | Files | Status |
|--------|-------|--------|
| **1. CLI intent now wins the GUI check.** `isGuiRequest`'s CLI regex used `command\s*line`, which never matched the hyphenated **"command-line"** (the common spelling) — so an explicit CLI request fell through to the bare word "game" and got a stray `index.html` appended, which then hijacked the smoke gate (`renderSmoke` on a stub, `cliSmoke: skipped`). Regex is now `command[\s-]*line`. | `backend/src/ai/guiShared.ts` | ✅ |
| **2. JS import machinery gated to TS/JS files.** `verifyGeneratedContracts` applied JS relative-module / named-member / phantom-npm semantics to *every* file, producing **8 bogus violations** on the Java sources (`import Board;` flagged as a "phantom module" that repair could never fix). Added `isNonTsGateFile()`; the contract verifier and `applyDeterministicImportPatch` now skip non-TS gate languages (Java/Go/Python/Rust/C/C++/C#/Swift/Kotlin/PHP/Ruby). `stripPhantomPackageImports` already had an extension guard. | `backend/src/routes/codePlanner.ts` | ✅ |
| **3. Non-TS compile failures now drive a repair round.** `languageGates` used to be computed *after* all repair and merely returned. New shared `runNonTsGatesWithRepair()` gives javac/go/py failures the same bounded treatment tsc gets: real compiler errors → per-file repair prompt → re-gate, up to 2 rounds. `groupGateErrorsByFile()` attributes a **per-line** multi-file concatenated `javac` string back to the owning files (the first cut collapsed every error onto the longest-matching path, so the true culprit file was never repaired). Wired into both the finalize and chunked write paths. | `backend/src/routes/codePlanner.ts` | ✅ |
| **4. Planner prompt requires stateful scaffolds to expose mutation + inspection.** A game's state holder must declare a member that CHANGES state (`placeMark`/`makeMove`/…) and one that INSPECTS it (`isWin`/`isFull`/…), not just a printer — the old `Board{printBoard,checkWin}` contract left the driver calling a method that did not exist. | `backend/src/routes/codePlanner.ts` (`PLAN_PROMPT` rule 7) | ✅ |
| **Tests** (+7): hyphenated CLI games are headless; Java files produce no JS contract violations; `applyDeterministicImportPatch` never touches Java; `groupGateErrorsByFile` routing (single, multi-file, longest-path, unmatched). | `backend/src/routes/codePlanner.test.ts` | ✅ |

**Live re-verification (agent box, adapter `vaca-r40-off-distill-adapter`, OpenJDK 17 installed):**
- Plan now emits **no `index.html`** (fix 1) and a `Board` contract with **`mark` + `checkWin` + `isFull`** (fix 4).
- Write: `contractViolations` **8 → 0** (fix 2); `stubFailures` empty; smoke honest (`renderSmoke: skipped (no HTML entry)`, `cliSmoke: skipped (no runnable entry)`).
- Gate repair now fires and attributes correctly: round 1 → all 4 files, round 2 → `Player.java` (fix 3).

**Still failing (out of scope, next step):** the four Java files disagree on the *signatures* of the
shared API (`Board.mark(int,int,String)` vs callers assuming `mark(i,j)→Optional`, `Board.SIZE`,
`placeMark(int,char)`, `checkWin(char)`, `printBoard()`), so `javac` still fails. The file contract
carries member **names only, not signatures/types**, so typed languages cannot align. The next
improvement is to add member signatures to the plan contract (or a typed-sibling block in the write
prompt) so all files agree — a schema change, deliberately not bundled into this fix set.

**Retry after stripping the failed build (2026-10-03).** Removed the 3 failed Java export dirs
(backup `/tmp/ttt-strip-*`) and purged 6 junk `Auto-learned conversation` tic-tac-toe **error**
patterns from `knowledge/patterns.json` (83 → 77). Two fresh attempts then showed:

- **Signature drift eliminated.** The non-TS repair prompt now includes the sibling files' **REAL
  code** (not just declared member names), so a typed language can align. One run produced a fully
  correct, complete `Board.java` (validated `makeMove(int,int,char)`, real win detection, `isDraw`).
- **Residual failures are model-generation quality, not pipeline bugs:** a truncated second file
  (`reached end of file while parsing`), invented members (`board.hasWon()`, `TicTacToeUtils`), and
  repeated invalid Java same-package imports (`import Board;`). The small local adapter
  (`vaca-r40-off-distill-adapter`) keeps re-emitting these. Candidates: a deterministic Java
  import sanitizer (bare `import Identifier;` is always a compile error), a non-TS truncation
  detector + completion pass, typed contracts, or a stronger model.

**Deterministic non-TS source fixups (2026-10-03).** Added to the non-TS gate loop (runs before the
first gate and after every repair round), zero LLM:
- `sanitizeNonTsSource`: for Java, strip bare `import Foo;` lines (a single-identifier import is
  ALWAYS a `javac` error); for brace languages, append missing closing braces when the file is
  truncated (`braceBalance`, string/comment-aware, guarded to ≤12).
- Tests: `sanitizeNonTsSource` + `braceBalance` (keeps qualified imports, closes truncated files,
  ignores braces in strings/comments). Suite: **1409 passed, 2 skipped**.

**Result:** the Java tic-tac-toe now **COMPILES** — `java=PASS` and an independent `javac` returns
OK (the sanitize fixed 1 file; the repair loop converged). But it is a **compiling stub**: `Game.play()`
is `// TODO: Game loop logic` and `Board.checkWin` is `return false;`, so running it prints a 3×3
grid of NUL chars and exits. `stubFailures: []` — the stub gate's `STUB_PATTERNS` only match the exact
`TODO: Implement`, not `TODO: <other>`, and there is no placeholder-return heuristic. Next: broaden
stub detection (any `TODO:`/`FIXME` in a body, a method whose body is a single `return false/0/null`,
etc.) so "compiles but does nothing" is caught.

**Stub gate broadened + contract-aware implementation gate (2026-10-03).**
- `isStubBody` (`src/knowledge/qualityGate.ts`) now also rejects: any `TODO`/`FIXME`/`XXX` **comment**
  (not just the exact `TODO: Implement`), and any method whose body is a single placeholder
  `return <literal>;` (e.g. `boolean checkWin(...) { return false; }`). New exported helpers
  `stripComments`, `collectBraceBlocks`, `hasPlaceholderMethodBody`, `memberImplementationState`
  (brace-block aware, so an `if`-block that returns false is NOT misread as a method body).
- **Contract-aware gate**: `findUnimplementedPlannedExports(files, contractFiles)` (codePlanner)
  flags a PLANNED export whose generated body is `trivial` (empty / placeholder return) in any
  language, or `absent` for non-TS gate languages (TS already has the export-drift check). Merged
  into the planner's `stubFailures`, so `deriveBuildVerdict` rejects the build.
- Tests: `qualityGate.test.ts` (TODO comments, placeholder returns, real getters/if-blocks NOT
  flagged) + `codePlanner.test.ts` (trivial export, unimplemented non-TS export, clean pass,
  class/type exports skipped). Suite: **1415 passed, 2 skipped**.

**Live retry:** `stubFailures: ["src/Board.java: planned export 'Cell' is not implemented in the
generated code"]` — the contract-aware gate fired on a planned-but-unwritten export, the summary
now reads `⚠️ Wrote 3 files — java compile gate FAILED …`, and the sanitizer ran again
(`non-TS sanitize: 2 file(s) fixed`). The pipeline now correctly **rejects** "compiles/partially
compiles but unimplemented" builds instead of reporting success.

**Stub-repair loop (2026-10-03).** `runNonTsGatesWithRepair` now repairs on **either** a compile
failure **or** a stub/unimplemented body — previously the stub gate only flagged. Added
`pathFromGateFailure` + `groupStubFailuresByFile`; the loop merges compile errors and stub notes per
file and sends one prompt: `buildNonTsRepairPrompt` (generalized from the compile-only prompt) now
includes an **UNIMPLEMENTED / STUBBED** section and an explicit "implement the real logic — no TODO,
no empty body, no placeholder `return false/0/null`" instruction. Tests: +2 (`pathFromGateFailure`,
`groupStubFailuresByFile`). Suite: **1417 passed, 2 skipped**.

**Live result — first WORKING build.** Fresh Java tic-tac-toe: `java=PASS`, `stubFailures: []`,
independent `javac` OK, and the program **runs a real game** — `playGame()` loop, move validation,
turn switching, correct win detection (rows/cols/diagonals) AND draw detection, input error handling.
(That run's repair was compile-only; the stub-repair path is wired and would now handle the earlier
`Cell`-unimplemented case.)

Remaining artifact-level bug (model output, not pipeline): the winner is announced as the WRONG
player — `currentPlayer` is toggled *before* the `"Player X wins!"` message, so an X win prints
"Player O wins!" (verified: moves 0,3,1,4,2 → `X|X|X` → prints "Player O wins!"). Also `getPlayerMove`
throws on EOF. A CLI behavioral smoke that scripts a deterministic win would catch the first.

**Scripted CLI tic-tac-toe behavioral smoke (2026-10-03).** The remaining wrong-winner bug is a
CLI failure class a generic "does it run?" probe cannot see: the program runs a perfect game but
*announces the wrong result*. `src/sandbox/behavioralSmoke.ts` gained a scripted probe:
- `looksLikeTicTacToe` (detects the app from the request or the source), `ticTacToeWinningInput`
  (a deterministic winning row, in the program's own move encoding: `0\n3\n1\n4\n2\n` for 0-based
  single ints, `1\n4\n2\n5\n3\n` for 1-based, `0 0\n1 0\n0 1\n1 1\n0 2\n` for row/col), plus
  `parseAnnouncedWinner` / `parseFirstPlayer`.
- `runScriptedTicTacToe`: compiles + runs the entry (TS/JS via tsx, Java via `javac` + `java`),
  feeds the winning input, and asserts the ANNOUNCED winner equals the player who actually moved
  first. Wired into the CLI branch of `runBehavioralSmokeGates` (preferred for a tic-tac-toe,
  falling back to `cliProbe` when skipped) with an injectable `gameProbe` for tests.
- Tests: `src/sandbox/scriptedGame.test.ts` (6) — helpers, PASS on a correct winner, FAIL on the
  wrong winner, and a runaway-output cap.

**Crash fix — runaway output / orphaned grandchild.** A generated game that loops forever printing
its board had two failure modes, both fixed in `spawnWithInput`:
1. Unbounded stdout accumulation threw V8's `Invalid string length` and **killed the backend**.
2. After capping at 256KB, killing the runner (`tsx`) left its **grandchild** node process holding
   the inherited stdout pipe, so `close` never fired and the probe **hung forever** (backend health
   went dark during a live smoke run).
   Fix: spawn `detached: true` and kill the whole process **group** (`process.kill(-pid, 'SIGKILL')`)
   on cap/timeout, and settle the promise on the first of `exit`/`close`/`error` with a short grace.
   Cap now fires in ~240ms with a `failed` verdict.

Suite after: **67 files / 1427 passed / 2 skipped**; `tsc` clean.

**Scripted-smoke hardening round 2 — four real false-pass/ordering bugs (2026-10-03).** Live Java
tic-tac-toe runs exposed four issues, all fixed:

1. **Gate ordering.** The behavioral smoke (which now COMPILES Java itself via the scripted probe)
   ran BEFORE the non-TS compile gate, so it judged un-repaired source and reported a bare
   "compile failed" — then the non-TS gate repaired it to PASS two rounds later. Reordered in BOTH
   pipelines (`codePlanner` finalize + chunked): non-TS compile-repair first, then the behavioral
   smoke, so the runtime verdict is about BEHAVIOR, not missing braces.
2. **Java game with no `main` was silently un-verified.** The scripted probe returned `skipped`
   ("no main class") and fell through to the generic CLI probe, which only understands TS/JS → also
   `skipped` → the whole behavioral gate was a no-op and an unrunnable Java CLI shipped as
   `✅ Wrote 1 file successfully`. Now "no main" is a FAILURE with a repair target (the likeliest
   entry file), plus a dedicated "ADD the launcher" repair prompt.
3. **Scripted failure downgraded to a pass.** The CLI repair loop re-ran the GENERIC `cliProbe`
   after a scripted FAIL; for Java that returns `skipped`, clearing a real failure. Now the loop
   re-runs the SAME scripted probe (`scriptedActive`), and a re-probe that can no longer recognize
   the app keeps the prior failure instead of clearing it.
4. **Stale non-TS verdict after smoke repair.** The smoke repair can re-introduce a compile error
   (observed: it added a second `class Board` inside TicTacToe.java → `javac: duplicate class`),
   yet the response still reported `java=PASS`. Added a repair-DISABLED non-TS gate re-run on the
   FINAL code in both paths, so the reported verdict matches what ships.

Tests: `scriptedGame.test.ts` now 8 (added no-main detection + no-downgrade). Suite: **67 files /
1429 passed / 2 skipped**; `tsc` clean. Note: the laptop's `backend/knowledge/patterns.json` was
clobbered once during a test run (1308→2) — a pre-existing test-isolation leak unrelated to these
changes (the `learningEngine` tests write the live store); restored via git checkout.

**Final live verification (agent box, 2026-10-03).** With all four fixes synced + backend restarted,
the Java tic-tac-toe pipeline is now internally consistent and honest:
- non-TS gate + stub repair run FIRST (java PASS), then the scripted probe runs on repaired code;
- the scripted probe caught a genuine BEHAVIORAL failure (`tic-tac-toe: no winner announced`) rather
  than a bare compile error — the ordering fix working as intended;
- a repair round then introduced `duplicate class: Board/Player`; the scripted probe reported
  `compile failed`, and the post-smoke non-TS re-verification reported `java clean:false` (NOT the
  stale `PASS` it would have shown before). Summary: `⚠️ Wrote 3 files — java compile gate FAILED …`.

The small local adapter (`vaca-r40-off-distill-adapter`) still cannot produce a fully-correct game,
but the pipeline no longer ships an unverified/broken Java CLI as success. VACA now rejects exactly
the failure classes it is supposed to.

**Test isolation — the knowledge store is no longer clobbered by tests (2026-10-03).** A full
`vitest run` mutated the real `backend/knowledge/patterns.json` (observed twice: 59→61, and one run
truncated it 1308→2). Two tests write real patterns through the process-lifetime `knowledgeStore`
singleton. Fixed:
- `KnowledgeStore` now honors an optional `VACA_KNOWLEDGE_DIR` env override for its base dir (unset
  in production → unchanged behavior). Set it *before* the singleton is constructed to redirect it.
- `learningEngine.test.ts` and `microExperimenterService.test.ts` set `VACA_KNOWLEDGE_DIR` to a
  throwaway temp dir via `vi.hoisted` (runs above the static imports, so the singleton is built
  against the temp dir) and remove it in `afterAll`. The read-only `internalKnowledge.test.ts` still
  reads the real store on purpose.

Verified: the full suite leaves `patterns.json` byte-identical (59 patterns before and after).
Suite: **67 files / 1429 passed / 2 skipped**; `tsc` clean.

**Language coverage — toolchains, scaffolders, and non-TS knowledge (2026-10-03).** VACA's depth
was TypeScript-only: the plan stage accepted 12 languages, but the scaffolder fell back to
`index.ts` for everything except go/rust/python, the toolchains for most languages were missing, and
the knowledge store was 100% TS/JS. Three additions close that:

**1. Toolchains (Windows + Linux).**
- `nonTsCompileGate` gained a `TOOLCHAINS` descriptor per language (candidate binaries, version
  probe, and per-OS install command) plus `toolchainBin()` (platform-aware resolution) and
  `detectToolchains()` (a preflight report). The gate now resolves the real binary instead of a
  hardcoded name, and C# falls back to `dotnet build` when `csc` is absent.
- Binary resolution searches PATH **and** the well-known non-login dirs (`~/.cargo/bin`,
  `~/.dotnet`, `~/.local/bin`, `/usr/local/bin`) and returns the ABSOLUTE path — a rustup/.NET
  install is invisible to the backend process otherwise. Resolution is intentionally NOT cached
  (a cached path goes stale when PATH changes — this made a Go E2E test exec a deleted temp binary).
- `scripts/install-toolchains.sh` (apt/dnf/pacman/zypper/brew) and `scripts/install-toolchains.ps1`
  (winget/choco) install the core set: C, C++, Rust, Go, Java, C#, Python, PHP, Ruby, Node.
- `npm run toolchains:report` (`src/scripts/report-toolchains.ts`) prints availability + how to
  install what's missing.
- **Installed on the agent box:** go 1.26, rustc 1.99, .NET SDK 8.0.425, php 8.5, ruby 3.3 (plus the
  existing gcc/g++/javac/python3/tsx). Report now shows all core languages ✓ (swift/kotlin remain
  unavailable by design — not in the desktop/server core set).

**2. Per-language scaffolders** (`export/perFileScaffolder.ts`). Added real entry points + project
configs for Java (`Main.java` + Makefile), C (`main.c` + Makefile), C++ (`main.cpp` + Makefile),
C# (`Program.cs` + `app.csproj`), PHP (`index.php` + `composer.json`), Ruby (`main.rb` + `Gemfile`)
— previously all of these silently fell back to `index.ts`/`package.json`. Also added matching
`.gitignore` and Quick-Start README branches. Tests: +6 (`perFileScaffolder.test.ts`).

**3. Non-TS knowledge** (`ai/languageGuidance.ts`, `services/microExperimenterReference.ts`,
`knowledge/curatedLanguagePatterns.ts`).
- `languageGuidanceBlock()` injects a compact per-language standard-library/idiom primer into the
  file-write prompt (both finalize + chunked paths) — directly countering the observed failures
  (Java `System.console()` NPE, invented members, third-party imports). Includes the explicit
  "never `System.console()`" Java rule.
- Added Rust + C++ worked before→after examples to the reference corpus (12 total) + catalog entries.
- `curatedLanguagePatterns.ts` seeds 6 hand-written Rust/C++/Go/Java patterns into the knowledge
  store, idempotently, via `npm run seed:knowledge`.

Tests: +9 guidance/seed + 6 scaffolder + 3 real-toolchain gate tests (C++/Rust/Java, self-skipping).
Suite on the agent box (all toolchains present): **69 files / 1450 passed / 2 skipped**; laptop:
**69 files / 1447 passed / 2 skipped**; `tsc` clean on both.

**Swift + Kotlin toolchains, and the scaffold self-improvement loop goes language-aware (2026-10-03).**
Two follow-ups to the language-coverage work above.

**1. Swift + Kotlin installed and gated.** The previous note said they were "unavailable by design";
they are now part of the gate set, since the app targets a wide range of platforms.
- Agent box now has `swiftc 6.4` (via swiftly → `~/.local/share/swiftly/bin`) and
  `kotlinc-jvm 2.4.20` (`/snap/bin`). `nonTsCompileGate` resolves both through `toolchainBin()` and
  the real-toolchain gate tests (Swift, Kotlin) pass on the agent box.
- Corrected the Swift Linux install hint: apt's `swift` package is OpenStack Swift, **not** the
  compiler — the gate now points at the swiftly installer. `JetBrains.Kotlin` / `Swift.Toolchain`
  were added to the winget installer.
- The JVM/Native real-toolchain tests were given explicit timeouts (Kotlin compiles in ~4s via
  `kotlinc`; the vitest default 5s made it flaky) — C/C++/Python 60s, Rust/Java 120s,
  Swift/Kotlin 180s.

**2. The scaffold self-improvement loop now scores non-TypeScript scaffolds.** The idle
`MicroExperimenter`'s scaffold search (`services/scaffoldExperiment.ts` → `scaffoldVariation.ts`)
mutates a blueprint's checklist + wiring, builds each variant, and keeps a winner on the shared
gates. Its adherence scorer (`scoreFilesAdherence`) was TypeScript-shaped (`scanFileExports`,
`extractImports`, no-JSX-in-.ts, sibling imports) — so **every** Go/Rust/C#/Python/C++/… file scored
~1/7 and the loop could not tell a good non-TS scaffold from a bad one: the search was blind on
exactly the new languages.
- New dependency-free `utils/languageFromPath.ts` (shared with `learningEngine`, which now delegates
  to it).
- `scoreFilesAdherence` is language-aware: TS/JS keeps the original seven binary checks byte-for-byte;
  non-TS files get the checks that genuinely transfer — `declares_code` (a language-appropriate
  top-level declaration scan), `no_prose_leak`, and `not_stub` — instead of the TS-only ones. TS-only
  check names never appear in a non-TS score.
- Result: the loop's `VariantMetrics.adherence` now discriminates for the new languages, so a real
  Go/Rust/… scaffold ranks above a stubbed one and the idle search can adopt improvements there.
- Also removed the unwired `knowledge/scaffoldLearning.ts` stub (a per-language scaffold-template
  cache) — the user chose the self-improvement loop as the scaffolding-learning path, and reuse of a
  prior project's entry point would have re-imported modules that do not exist in the new project.

Tests: +6 (`scaffoldVariation.test.ts` language-aware adherence; `scaffoldExperiment.test.ts` Go
outcome scoring + ranking). Suite — agent box: **69 files / 1459 passed / 1 skipped**; laptop:
**69 files / 1454 passed / 6 skipped**; `tsc` clean on both.

**Micro-app experiments go language-aware + compiled-language adherence; canvas non-TS gate path fix (2026-10-03).**
Follow-ups to the scaffold-loop language coverage.

**1. `imports_resolve` — the compiled-language import/contract adherence check.**
`scoreFilesAdherence` (the scaffold loop's metric) scored non-TS files on declarations
only. It now also checks cross-file wiring for Go/Rust/C#/Java — the analog of the TS
`sibling_imports_ok` — and is deliberately conservative (only an unambiguously dangling
PROJECT-LOCAL reference fails; stdlib/framework/unknown imports pass):
- Go: an internal `import "<module>/src/<dir>"` must name a directory that exists.
- Rust: every `#[path = "..."] mod x;` target must exist (and a bare `mod x;` needs `x.rs`).
- Java: non-JDK imports must name a class the build actually produced.
- C#: a `using` that is neither a stdlib root nor a declared project namespace is dangling.

**2. Micro-app experiments now cover the new languages.**
- `dominantLanguage` used to collapse every non-ts/js/html file to `typescript`, so a
  Rust/C++/Go/… micro-app was stored and looked up as TypeScript. It now uses the shared
  `utils/languageFromPath`.
- `MICRO_CATALOG` / `MICRO_BUILD_REFERENCES` gained worked before→after examples for Go,
  Python, C, Java, C#, Kotlin, Swift, PHP, Ruby (9 new references; catalog now spans
  ts/js/html/rust/cpp + all of these).
- `verify()` now runs the non-TS compile gate (`runNonTsProjectGates`) on each built file
  set. Before this a non-TS micro-app was accepted on `tsc: skipped` + `smoke: skipped`
  with NO verification at all — the loop would have learned broken output.
- `ai/libraryContext` gained `c`/`cpp`/`java`/`php`/`ruby` file mappings and
  `dart`/`csharp`/`php`/`ruby` bible-level mappings.

**3. Canvas non-TS gate staged every file flat (bug, fixed).**
`fileGenerator`'s compile gate + post-smoke re-verify passed the bare `fileName`, so every
node landed in ONE directory. Any multi-package Go/Java/C# build then failed with
`found packages X and Y in <dir>` regardless of correctness — which also blocked the
scaffold self-improvement loop from ever scoring a PASSING non-TS build. The gate (and the
repair write-back / stub mapping) now stage through the canonical `scaffoldRelPath(f)`,
the same layout tsc and the export already used.

**End-to-end scaffold experiments on Go blueprints (agent box, real LLM).**
`POST /api/experiments/run-scaffold { appType: "chat-go" }` and `shortlink-go` ran the
incumbent + 2 variants each. Result: **kept incumbent** — all builds scored
`adherence=1.000 (5/5 and 4/4 fully adherent)` with `tsc=errors`, i.e. the language-aware
scoring now discriminates correctly and the loop declined to adopt. `tsc=errors` is the Go
gate rejecting the generated code: the LLM uses a third-party package (`gorilla/websocket`
in chat-go) and/or a bare local import (`import "src/campaigns"` in shortlink-go) that lacks
the module path. Both are generation-quality issues, not scoring issues; the flat-path
false failure is gone.

Tests: +5 (`imports_resolve`), +1 (`dominantLanguage`), +1 (catalog coverage).
Suite — agent box: **69 files / 1466 passed / 1 skipped**; laptop: **69 files / 1461 passed
/ 6 skipped**; `tsc` clean on both.

---

## Multi-language dry run — build the same tiny app in 11 languages, then compile + RUN each

A dry run was run through VACA's real build path (`planProject` → `generatePlanFiles`, the
same round-0 path the micro-experimenter uses) for ONE tiny CLI app per gate language
(python, go, rust, c, cpp, java, c#, kotlin, swift, php, ruby). Every produced file set was
then **independently compiled and executed with the real toolchain** — not just VACA's
gate. Harness: `backend/src/scripts/dry-run-languages.ts`.

**Results (VACA gate → independent real-toolchain build/run).**
- PASS (compiles AND runs correctly): **C, C#, Kotlin, Swift** — e.g. Kotlin temp-stats
  printed `Average: 20.33 / Min: 19 / Max: 22`; C# todo ran interactively; C dice rolled.
- FAIL as a *runnable app*: Python, PHP (planned/emitted only a bare function with no
  entry point or I/O — they compile, so the compile-only gate passes them), Rust
  (unstable `#![feature(alloc_error_handler)]` + a `flat_map` type error), Go (a bare
  local import `wordcount/internal/wordfreq` plus an unused `strings` import), C++
  (`#include "../gameLogic.h"` — wrong relative path, no `main()`, `guess` shadowed), Java
  (`import src.Auth`, no `Bank.java`, duplicate top-level classes), Ruby (`require_relative
  '../anagram_groupers/…'` from `lib/cli.rb`, plus an undefined `WordGrouper`).

**Dedicated fix — C# whole-project gate was inverted (bug, fixed).**
`runNonTsProjectGates` detected dotnet with `csBin === 'dotnet'`, but `toolchainBin`
returns an **absolute path** whenever a dotnet exists (the normal case). The check was
therefore always false, so the gate ran `dotnet -nologo -target:library …` (the csc form)
instead of `dotnet build` and reported EVERY valid C# project as broken —
`Could not execute because the specified command or file was not found.` One of the
best-looking dry-run apps (a working C# todo CLI) was flagged this way. Now checks the
basename (`path.basename(csBin) === 'dotnet'`). The dry run's C# artifact passes the gate
after the fix, and a real-toolchain C# gate test was added (the missing test that let the
bug ship).

**Follow-ups the dry run surfaced (not yet fixed).**
- Non-TS builds have NO CLI smoke gate (`pickCliEntryFile` only covers ts/tsx/js/mjs/cjs),
  so a "CLI program" that is really just a library fragment (Python/PHP above) still passes.
- Go: the gate picks a module name (`sanitizeGoModuleName`) but never tells the writer, so
  generated code invents its own and `go build` rejects the bare local import.

Tests: +1 (C# real-toolchain gate). Suite — agent box: **69 files / 1467 passed / 1 skipped**;
`tsc` clean.

---

## Non-TS entry-point gate + Go module name in the writer prompt

**1. Non-TS entry-point gate (compiles but has no runnable entry ⇒ rejected).**
The compile gates only prove a file parses/links. A library-shaped fragment — a Python file
of bare functions, a PHP file with only `function` definitions, a C++ class with no `main`
— passed every gate and then could not be run at all. `runNonTsProjectGates` now folds an
entry-point check into each language's verdict:
- Compiled languages match a literal entry: Go `func main()`, Rust `fn main()`, C/C++
  `int main(`, Java `public static void main(`, C# `static Main(` **or** C# top-level
  statements, Kotlin `fun main(`, Swift `@main`.
- Script languages are detected by **executable top-level statements** (Python
  `__main__`/top-level call, PHP/Ruby non-declaration statements) — biased toward false
  passes over false failures.
The error names the missing shape (`no runnable entry point — this python build compiles
but cannot be launched (found no if __name__ == "__main__" or a top-level call)`). Because
it lives in `runNonTsProjectGates`, every caller (chat, canvas, micro-experimenter, scaffold
loop) enforces it with no wiring changes.

**2. The Go module path is now injected into the writer prompt.**
VACA writes `go.mod` (`module <sanitizeGoModuleName(request)>`) *before* the model writes
code, so the model had no way to know the path and invented its own — `go build` then
rejected every internal import (`package X is not in std`). `languageGuidanceBlock(language,
{ goModuleName })` now appends the exact module path to the Go guidance ("any sibling
import MUST use `<module>/<dir>`; never a bare `src/foo`"), and both chat write-prompt sites
pass `sanitizeGoModuleName(request)` — the same function the gate uses, so they agree.

**Re-run of the 11-language dry run (agent box, real LLM):**
- **C# now gate=PASS** (was a false FAIL) — and the generated todo app independently
  `dotnet build`s and runs correctly. Fix confirmed end-to-end.
- **Python, PHP, C++ now gate=FAIL with the entry-point error** (were gate=PASS) — the gate
  catches the exact fragments the first run shipped.
- Go generated a **single `package main`** (no internal imports) and gate=PASS — the module
  guidance steered it away from the broken multi-package split.

Tests: +2 (entry gate) +1 (Go module guidance). Suite — agent box: **69 files / 1470 passed
/ 1 skipped**; laptop green; `tsc` clean.

---

## Rosetta Code corpus importer — real per-language worked examples

The knowledge store's non-TS coverage was 6 hand-written patterns. That does not scale to
"the writer should see real examples in every gate language". This adds an importer that
pulls the SAME small task solved in each of the 11 gate languages from Rosetta Code and
seeds them as knowledge-store patterns.

**Fetch (network) → corpus (committed) → seed (offline).** Splitting these keeps
`seed:knowledge` runnable with no network and puts the imported snippets in a reviewable
diff before they reach the store.

- `knowledge/rosettaCode.ts` — pure wikitext parser (unit-testable, no network):
  `parseSections` (splits on `=={{header|Lang}}==`, incl. piped aliases like
  `C sharp|C#`), `extractRosettaCode`, `htmlUnescape`, `stripWikiMarkup`,
  `stripOutputComments`, `isSubstantive`, `buildRosettaPatterns`, `ROSETTA_TARGETS`,
  `ROSETTA_TASKS`.
- `knowledge/rosettaPatterns.ts` — `seedRosettaPatterns` (idempotent by title, same
  contract as `seedCuratedLanguagePatterns`) + `loadRosettaCorpus`.
- `scripts/fetch-rosetta.ts` (`npm run fetch:rosetta`) — MediaWiki fetch at
  `https://rosettacode.org/w/api.php` (the `/mw/` and `/api.php` paths 404), writes
  `src/knowledge/rosettaCorpus.json`.
- `scripts/seed-knowledge.ts` now seeds the corpus too; `npm run seed:knowledge`.

**Parser facts learned the hard way (each cost real coverage):**
- The section HEADER is the authoritative language signal — the `lang=` attribute is often
  wrong (`Kotlin`'s "99 bottles" block is labelled `lang="scala"`). Trusting `lang=` alone
  cut Kotlin from 31 patterns to 7. Fallback now: match `lang` → first non-output block →
  lone block.
- `[[` must NOT be treated as leaked wiki markup — it is real code (Python
  `Callable[[float], float]`, nested arrays, bracket-string test fixtures). `{{` was clean.
- Rosetta stores some Python sections as REPL transcripts (`>>> …`); those are session logs,
  not runnable files, so they are rejected for `python` only (in Java/Kotlin `>>>` is a valid
  unsigned shift, and it is always mid-line there).
- Trailing `/* Output: … */` blocks are stripped — their prose otherwise trips the quality
  gate's markdown-bullet rule and would reject good code.
- Every candidate still passes the shared `isQualityCode` funnel, so a fetch can never smuggle
  prose/stubs into the store. Imported patterns get `qualityScore: 7`, one below the curated
  set (8), so the hand-written idioms still win the store's retrieval ranking.

**Sheet-cap guard.** `knowledgeStore.addPattern` ARCHIVES AND CLEARS the whole store the
moment it reaches `SHEET_CAP` (100). A bulk import that crossed the cap would silently rotate
every previously learned pattern out, so `seedRosettaPatterns` seeds at most
`sheetCap - existing - margin`, round-robin across languages so none is starved, and reports
what it truncated. It also uses the store's `batchAddPatterns` when available, so the
per-pattern RNN quick-train fires once instead of once per snippet (observed: 50 training
runs → 7).

**Corpus:** 313 patterns over 32 tasks — go 30, python 16, rust 30, c 29, cpp 31, java 28,
csharp 31, swift 31, kotlin 31, php 29, ruby 27. Tasks were chosen from the intersection of
all 11 language categories (314 tasks) and are small, stdlib-only and runnable. Python is
lowest because Rosetta's Python entries are frequently one-line idioms or REPL transcripts,
both correctly rejected as non-substantive. Seeding into a clean store yields 44 Rosetta +
6 curated = 50 patterns (4 per language).

Tests: +23 (`rosettaCode.test.ts` 16, `rosettaPatterns.test.ts` 7 — parser quirks, header
alias, REPL rejection, sheet-cap guard, batch path, committed-corpus coverage). `tsc` clean;
the 23 new tests pass on both boxes.

> Pre-existing, unrelated: `internalKnowledge.test.ts` and `codePlanner.test.ts` assert the
> LIVE store holds `void_raider` patterns. The running backend archived sheet #266 at 00:56
> (normal rotation at the 100-pattern cap), leaving the store empty, so those two fail for
> environmental reasons. They do not depend on any change here.

### Follow-up: the seed selection was arbitrary (fixed) + applied to the live store

**Bug.** `fetch-rosetta` fed the pages to `buildRosettaPatterns` in the order MediaWiki
returned them — which is NOT the order they were requested in. Since `seedRosettaPatterns`
takes the first `maxPerLanguage` tasks per language, the tasks that actually got seeded were
arbitrary and could shift on any re-fetch. `buildRosettaPatterns` now re-orders pages by
`ROSETTA_TASKS` (unknown tasks last, stable), and `ROSETTA_TASKS` was re-ordered so the most
instructive tasks lead: **99 bottles of beer, FizzBuzz, Factorial, Fibonacci sequence** — now
the seeded four in every language, deterministically.

**`clearRosettaPatterns`.** Titles are one-per (task, language), so when `ROSETTA_TASKS`
changes the new titles do not collide with the old ones and seeding would ADD alongside the
stale imports instead of replacing them. This helper removes only `projectId === 'rosetta'`
entries so a changed corpus can be re-seeded cleanly. It proved its worth immediately: on the
agent box the store had grown from 50 to 71 patterns (the live backend learned 21 `typescript`
patterns in ten minutes), and clearing removed exactly the 44 stale imports and left the
learned ones intact — 71 → 27 → 71.

**Applied to the live agent store (stop → seed → start, so the running backend could not
clobber the seed from memory):** 44 Rosetta + 6 curated = 50 non-TS patterns, all 11 languages,
`Sheet #267 (71/100)`. Verified through the real retrieval path (`getRelevantContext('logic',
<lang>, 'linux', 3)`) that every gate language now returns worked examples for
FizzBuzz / Factorial / 99 bottles, and that the hand-curated idioms still rank first where
they exist (go, rust, java, cpp) — the `qualityScore: 7` vs `8` split working as designed.

Tests: +4 (deterministic ordering in `buildRosettaPatterns`, corpus-order guard,
`clearRosettaPatterns`, no-op without `deletePattern`). 27 rosetta tests, `tsc` clean.

> **Correction to the note above.** `internalKnowledge.test.ts` and
> `codePlanner.test.ts` were not broken — they assert the LIVE store is non-empty, which the
> 00:56 sheet rotation had made false. Repopulating the store fixed them with no code change,
> confirming they are purely store-state dependent. Final agent-box suite: **71 files /
> 1497 passed / 1 skipped / 0 failed** (1470 baseline + 27 new).

### Measured: the per-language seed budget does NOT affect retrieval (keep it at 4)

Raising `maxPerLanguage` from 4 → 6 → 8 → 12 and re-measuring both retrieval paths shows the
writer sees **byte-identical** output at every budget:

- writer path `getRelevantContext('logic', <lang>, 'linux', 3)` — unchanged for all 11
  languages (store grows 50 → 72 → 94 → 95, retrieval identical);
- goal-aware `query({ searchText: goal, limit: 3 })` over six representative goals — also
  unchanged.

Reason: the writer path passes **no `searchText`** and returns the top `limit: 3` by
`qualityScore + usageCount*0.1`. Every imported pattern has an identical `qualityScore: 7`,
so they tie and the stable sort falls back to **insertion order** — the round-robin order,
i.e. `ROSETTA_TASKS` order. Extra untruncated tasks (4..N) just land after the top 3 that
`limit: 3` already fills. (This is why re-ordering `ROSETTA_TASKS` was the change that
actually mattered, not the budget.)

**Raising it is actively harmful.** Budget 8 puts the store at **94/100**; budget 12 hits
`95/100` and truncates 43 candidates. `knowledgeStore.addPattern` archives and CLEARS the
whole store at 100, and the live backend learned 21 patterns in ten minutes — so a 94/100
store would rotate within minutes and throw every imported pattern into a JSONL. The budget
stays at **4**.

The levers that would actually change what the writer sees:
1. pass the build goal as `searchText` in the writer path (goal-aware, like
   `internalKnowledge`) instead of the bare `nodeType + language` filter;
2. raise `getRelevantContext`'s `limit` (currently 3);
3. stop the flat `qualityScore` from overriding relevance — one uniform score per source
   means the ranking carries no signal.

### Goal-aware retrieval + quality-as-tiebreak (relevant imports no longer buried)

Two related changes to `knowledgeStore`, driven by the measurement above.

**1. Quality is now a TIEBREAK inside relevance, not an override.** `query()` ran two
sequential sorts — relevance (`sort((a,b) => b.hits - a.hits)`), then an unconditional
`qualityScore` sort. Because `Array.sort` is stable, the second sort only preserved the first
on exact quality ties, so a merely higher-scored pattern buried a more relevant one. Relevance
is now the primary key and `qualityScore + usageCount*0.1` the tiebreak, in a single
comparator. With no `searchText` the ordering is byte-identical to before (pure
quality/usage).

Measured on a freshly seeded store (`searchText`, limit 3):

| goal | before | after |
|---|---|---|
| "compute the factorial of a number" | `c++ interactive-loop` \| `java Scanner` \| `Factorial (java)` | `Factorial (java)` \| `Factorial (csharp)` \| `Factorial (kotlin)` |
| "build a CLI that reads command line arguments" | `rust stdin` \| `go bufio` \| `java Scanner` | `Command-line arguments (python)` \| `rust stdin` \| `go bufio` |

The relevant pattern went from absent/third to first.

**2. `getRelevantContext` is goal-aware.** New optional 5th arg `searchText`, tried first and
falling back to the plain top-N when nothing matches — so a goal sharing no tokens with any
pattern can never strip a language's examples away (verified: "detect palindromes in text"
falls back cleanly because no palindrome pattern is in the seeded 4/language). Threaded
through `learningEngine.getGenerationContext`, `prompts.enrichWithKnowledge` /
`getEnrichedNodePrompt` / `getEnrichedSystemPrompt`, `ServiceTools.knowledge_query` (passes its
`input.query`) and `POST /api/knowledge/context` (accepts `searchText`).

**The live writer path was already goal-aware** — `codePlanner.getInternalKnowledgeBlock` →
`gatherInternalKnowledge(request)` → `query({ searchText, limit: 3 })` — so change 1 is what
actually unburies patterns there. Verified live on the agent box through
`getInternalKnowledgeBlock`: "write a program that computes the factorial of a number" now
injects `rosetta — Factorial (csharp)` (previously the C++ interactive-loop pattern).

> Note: `prompts.enrichWithKnowledge` / `getEnrichedNodePrompt` / `getEnrichedSystemPrompt`
> are **exported but never called** — that architect-era path is dead, and the live injection
> is `internalKnowledge`. They were updated for consistency, not because they run.

> Remaining gap: `gatherInternalKnowledge` has **no language filter**, so a Go build gets
> `Factorial (java)/(csharp)/(kotlin)` — relevant task, wrong language. Passing the target
> language through would be the next improvement.

Tests: +7 (`knowledgeStore.test.ts` — relevance-above-quality, quality tiebreak, no-searchText
ordering unchanged, no-token-match filtering, goal-aware lookup, empty-match fallback,
goal-less top-N). Suite — agent box: **72 files / 1504 passed / 1 skipped / 0 failed**;
laptop green; `tsc` clean.

### Language-aware writer knowledge + the dead prompt-enrichment path removed

**1. The writer's knowledge injection is now language-aware.** `gatherInternalKnowledge` had no
language filter, so a Go build was shown whichever patterns won the relevance ranking regardless
of language. It now takes `GatherOptions { language?, query? }` and selects in two steps:

1. patterns matching the goal **and** the target language,
2. otherwise patterns matching the goal in **any** language.

Step 2 is deliberate: the store's per-language coverage is uneven, so requiring the language
outright would empty the block for a language with no matching pattern — the wrong-language
example still carries the right task. `language` is trimmed + lowercased before matching.

Wired at all three live call sites: `codePlanner.getInternalKnowledgeBlock(request, language?)`
now takes the language and the two write-prompt builders pass it — `getWritePromptWithContext`
uses the plan's `dominant.language`, `getFileWritePromptWithContext` uses `file.language`. The
plan-prompt builder passes none (no language is known at planning time). `blueprint.ts` `/build`
passes its `language` body override.

Verified live on the agent box through the real entry point:

| requested language | injected pattern |
|---|---|
| `go` | `rosetta — Fibonacci sequence (go)` |
| `kotlin` | `rosetta — Fibonacci sequence (kotlin)` |
| *(none)* | `rosetta — Fibonacci sequence (python)` — the any-language fallback |

Before this, the same goal injected `Factorial (java)/(csharp)/(kotlin)` — the right task, the
wrong language, with the requested one absent entirely.

**2. Removed the dead `enrichWithKnowledge` path.** `enrichWithKnowledge`,
`getEnrichedNodePrompt` and `getEnrichedSystemPrompt` in `ai/prompts.ts` were **exported but
never called** anywhere in the repo — the architect-era enrichment path, superseded by
`internalKnowledge`. They were deleted (and the stale `enrichWithKnowledge` reference in a
`codePlanner.ts` comment corrected) rather than wired up: the live paths already inject
knowledge, so resurrecting them would have double-injected. Their now-unused
`knowledgeStore` / `getLibraryContextForNodeType` imports went with them.

Tests: +3 language-filter tests in `internalKnowledge.test.ts` (seam-injected, so a sheet
rotation can't fail them) and +3 writer-level tests in `codePlanner.test.ts` using the new
optional `query` seam on `getInternalKnowledgeBlock` (same-language injection, any-language
fallback, unchanged without a language). Suite — agent box: **72 files / 1511 passed /
1 skipped / 0 failed**; laptop green; `tsc` clean.

### Repo fix: `backend/src/sandbox/` was never under version control

`.gitignore` line 13 was a bare `sandbox/`. A gitignore pattern with **no leading slash matches
at any depth**, so it swallowed `backend/src/sandbox/` — real source, not scratch. The effect:

- **0 of its 17 files were tracked.** `git archive HEAD -- backend/src/sandbox` was empty, so
  the committed tree simply did not contain them.
- **Three tracked modules import from it** (`routes/codePlanner.ts`, `routes/generation.ts`,
  `tools/ServiceTools.ts`), so a fresh clone could not compile or start the backend. Four test
  files were missing from the suite as well.
- **The rule protected nothing.** The runtime sandbox dir is `join(tmpdir(), 'sandbox', id)` →
  `/tmp/sandbox/<id>`, outside the repo; and `backend/dist/sandbox/` was already covered by the
  `dist` rule on line 2 (`git check-ignore -v` attributes it to `dist`, not line 13).
- It came in with the initial commit, and `backend/src/sandbox/` was the **only** ignored source
  dir under `backend/src`.

Fix: deleted the `sandbox/` line and staged the 17 files (`git add backend/src/sandbox/`).
Verified: no `sandbox` rule remains, `git check-ignore` no longer matches the source, and
`git ls-files backend/src/sandbox/` now reports 17.
