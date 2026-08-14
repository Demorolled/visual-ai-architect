# VACA Build Triage — Live-Pipeline Failure Report

> Date: 2026-08-13 · Driver: `scripts/vaca-build-test.mjs` · API: live VACA backend (`:3001`, LLM = local Qwen2.5-7B via DSpark `:8000`)
> Method: each app was run through the exact frontend flow — create project → `/api/architect/plan` → save nodes → `/api/generate/:id/files` (full validation, no skips) → `/api/export/:id/per-file-scaffold`. Every export was then independently verified (tsc / go build / run / render gate).
> Raw evidence: `out/vaca-builds/<slug>/{plan,generation,files,report}.json`

---

## Build matrix — all three FAILED

| # | App | Plan | Files | VACA tsc gate | VACA runtime smoke | Independent verify | Verdict |
|---|-----|------|-------|--------------|--------------------|--------------------|---------|
| 1 | CLI todo manager (TS) | 10 nodes (incl. `ui`+`guiLayout` for a CLI app, `ui-functions` type not in allowed set) | 11 files / 52.5 KB | ❌ 25 errors, 4 failed files, `tsCompileClean:false` | ❌ JS syntax error | ❌ 29 tsc errors; `npm start` crashes: entry imports `Config` (type-only) as a value | **FAIL** |
| 2 | Tic-tac-toe web game (TS) | 7 nodes (ok) | 8 files / 26.9 KB | ❌ 26 errors, 5 failed files | ❌ JS syntax error | ❌ 26 tsc errors (identical); `config.ts` has `DATABASE_URL`+hardcoded secrets in a browser game; `ui.css` fed to the TS compiler | **FAIL** |
| 3 | 3D chess game (Go) | 8 nodes, all `logic`/`ui`, Go (linux→go mapping) | 9 files / 27.4 KB | ⚠️ `tsCompileClean:true` **while 8/9 files failed** (Go fed to tsc) | ❌ JS syntax error (Go booted in browser) | ❌ `go build` fails: import paths contain spaces; `main.go` imports its own package; files are stubs + a literal prompt artifact | **FAIL** |

**Every build VACA ships is broken.** The gates that are supposed to catch this (`isAllValidated`, `tsCompileClean`, runtime smoke) either fire and are ignored, or give false positives.

---

## Failure catalog — what failed, why, and the fix

### F1. Entry point imports type-only exports as runtime values → instant crash
- **Where:** scaffolder `perFileScaffolder.ts::buildTsEntryPoint` (deterministic bug, hits every project).
- **Evidence (build 1):** `config.ts` exports `['Config', 'config', 'validateConfig']` — `Config` is an `interface`. The entry point emits `import { Config as Config } from './src/config/config.ts'`. At runtime: `SyntaxError: The requested module ... does not provide an export named 'Config'`.
- **Why:** the builder takes the *first* export of each file and imports it as a value, never checking whether it is a `type`/`interface` (type-only). tsc is lenient (elides the import) but ESM/tsx crashes.
- **Fix:** filter type-only declarations out of `file.exports` before choosing the entry import; import only values (functions/classes/consts). Also have the entry point actually **call** the app (`main()`, `start()`, `runApp()`) instead of only importing + re-exporting — nothing ever runs.

### F2. Entry point is a banner, not a bootstrap
- **Evidence (all 3):** `index.ts` prints `🚀 ... starting...` and re-exports symbols. No function is ever invoked — the "app" is dead code even when it compiles.
- **Why:** the scaffolder builds imports/exports only; no code-gen step wires a call into `main`.
- **Fix:** after imports, emit `main?.();` / `start?.();` guarded by existence (TS), `main()` in Go's `func main` body, etc.

### F3. The tsc gate is TS-only and language-unaware → false verdicts
- **Evidence (build 3):** all 8 Go files "failed" with `index.ts:1:1 error TS1434: Unexpected keyword or identifier` on `package main` — Go source was compiled as TypeScript. Yet the summary reported `tsCompileClean: true` (contradicting 8/9 failed) — a false positive that would let broken apps pass.
- **Evidence (build 2):** `ui.css` (a CSS node) produced `index.ts:3:1 error TS1128: Declaration or statement expected ... .ui-board {` — CSS also ran through the TS compiler.
- **Why:** the compile gate assembles a fake `index.ts` from whatever files exist, regardless of language.
- **Fix:** gate per language — Go → `go build`/`go vet`, CSS/HTML → excluded from TS compile and wired via `<link>`/`<script>` instead; never mix languages into one `index.ts`. Report honest per-language verdicts and require *all* gates green for `isAllValidated`.

### F4. Runtime smoke runs a browser check on non-browser apps
- **Evidence (builds 2 & 3):** smoke `entryFile: index.html` booted in headless Chromium, failed with `pageerror: Unexpected identifier 's'` — for a Go app and a CLI app.
- **Why:** a preview `index.html` is auto-generated for every project, so the smoke always finds an "entry", even when the real app is a CLI/Go program.
- **Fix:** skip the browser smoke unless the project actually contains a UI node in a web language (TS/JS/HTML). For CLI apps, run a `tsx index.ts`/`go run` smoke with a fixture input instead.

### F5. Go import paths built from the raw project title → malformed modules
- **Evidence (build 3):** `import "a 3d chess game with 3d pieces and board, an AI opponent, and the full rules of chess/src/types"` — the untruncated, un-sanitized title (with spaces and commas) became the module path. `go build` rejects it: `malformed import path ... invalid char ' '`. The `go.mod` module name (`a-3d-chess-game-...`) is never used.
- **Why:** the Go import builder uses the project name directly instead of the sanitized module name.
- **Fix:** derive all Go import prefixes from the `go.mod` module name (or a stable slug), never from the display title.

### F6. The model writes its own prompt scaffolding into source files
- **Evidence (build 3, `game.go`):** the file literally ends with `// REAL FILE CONTENT: Real file content injected by the platform. This is the actual source code generated for the "game.go" node.` — a copy of the platform's prompt placeholder text.
- **Why:** same family as the markdown-fence leak: the model echoes prompt text into its output and the harness writes it verbatim. No gate catches it (my `MARKDOWN_FENCE_RE`/`PROSE_RE` fix doesn't cover this literal).
- **Fix:** extend the output-contract ban list + the `isQualityCode`/capture gates with `REAL FILE CONTENT` / `injected by the platform` / `generated for the "..." node` markers; add to the generation prompt ("never echo instructions or placeholder markers into the file").

### F7. Cross-file contracts still violated after 4 repair rounds
- **Evidence (build 1, `main.ts`):** 15+ `TS2339: Property 'tasks' does not exist on type 'InputHandler'` and `TS2345` arg-shape mismatches survived the repair loop. Build 2 (`ai.ts`): calls `board.checkWin()`, `board.winningLine`, `board.getEmptyCells()`, `board.clone()`, `board.winningLineFromCell()` — none exist on `grid.ts`'s `Game`.
- **Why:** the contract verifier (`verifyGeneratedCodeContracts`) flags [IMPORT] violations but the general TS2339 class either isn't routed into repair or the repair prompt doesn't converge on the local 7B.
- **Fix:** route ALL tsc failures (not just missing-imports) into the repair loop; give the repair prompt the *real exported member lists* of dependency files (already exist as "IMPORT TARGETS") and instruct: "call ONLY these members; if a member is missing, implement it locally".

### F8. Duplicate identifiers / import-vs-local conflicts (recurring)
- **Evidence:** build 2 `grid.ts` — `TS2440 Import declaration conflicts with local declaration of 'Game'`, `TS2300 Duplicate identifier 'winner'` (a private field `winner` + a method `winner()`), `TS2395 merged declaration`. Build 1 `uifunctions.ts` — `TS2440 ... 'addTask'`. Earlier chess project `scene.ts` — same pattern.
- **Why:** the 7B model re-declares names it just imported, and names a method the same as a field.
- **Fix:** add a deterministic pre-repair lint that flags import-vs-local name collisions and field/method name collisions, and feeds them to repair with the exact rename.

### F9. Client-side apps get server-side config hallucinated (secrets!)
- **Evidence (build 2, `config.ts`):** a browser tic-tac-toe game shipped `DATABASE_URL = 'sqlite://./data.db'`, `SECRET_KEY = 'yourSecretKeyHere'`, `API_KEY = 'yourApiKeyHere'`, `API_PREFIX = '/api/v1'` — placeholder secrets in a client-only app (the `clientSide` filter drops api/database *nodes*, but the LLM still emitted a DB config inside `config.ts`).
- **Why:** the generation prompt for `config.ts` doesn't know the app is client-only; the client-side node filter only removes nodes, it doesn't constrain file content.
- **Fix:** pass a `CLIENT_ONLY` flag into per-file prompts (no database, no secrets, no server env); add a deterministic post-scan that flags `DATABASE_URL`/`SECRET_KEY`/`API_KEY`/`your...Here` in client-side projects (codeScanner already flags hardcoded secrets — make it a hard failure for client apps).

### F10. Plan stage: invalid node types, wrong domain shape, wrong language
- **Evidence:** build 1 plan contained node type `ui-functions` (not in the allowed set `input|output|logic|api|database|ui`) and `ui`/`guiLayout`/`uiFunctions` nodes for a **CLI** app; build 3 planned a 3D chess game in **Go** (linux→go mapping) with "3D piece models and physics" and zero 3D deps — an impossible scope that produced stubs and an enum-inflation artifact (a `PointerOutOutOut…` event enum with dozens of variants in `game.go`).
- **Why:** the architect sanitizer accepts unknown node types; the language mapping is OS-based not domain-based; the plan never sanity-checks feasibility (3D in bare Go).
- **Fix:** reject/coerce node types outside the allowed set (deterministic validation, not LLM-dependent); map language by domain (web/UI apps → TS/JS; CLI tools → TS/Go/Python; 3D → web three.js-style, or ask); flag plans whose description promises scope the stack can't deliver.

### F11. Stub/placeholder bodies in "valid" files
- **Evidence (build 3):** `main.go` is `package main` + a comment; `game.go::handleTurn()` returns a hardcoded `TurnResult{true, nil}`, `checkGameStatus()` returns `Setup`, `announceWinner()` empty; `config.ts` functions are `console.log` shells.
- **Why:** the stub gate (`STUB_PATTERNS`) only rejects literal "not implemented"/"TODO" strings — silent stub bodies pass.
- **Fix:** extend the stub gate to detect bodies that are pure comments / `return <hardcoded default>` / empty `{}` with a comment; route to repair.

---

## Severity ranking (what to fix first)

1. **F1+F2 (entry point)** — deterministic, breaks *every* build at runtime. Highest ROI.
2. **F3+F4 (verification gates)** — false "clean" verdicts mean broken apps ship silently. 
3. **F5+F6 (Go imports + prompt artifacts)** — hard failures in every non-TS build.
4. **F7+F8 (contracts + duplicates)** — the bulk of tsc errors; repair loop must converge.
5. **F9+F10+F11 (domain/config/plan + stubs)** — correctness of *what* is built, not just whether it compiles.

## How to reproduce (one command per app)

```bash
node scripts/vaca-build-test.mjs "a command line todo list manager in TypeScript" "CLI app..." --out ~/Desktop/app1
node scripts/vaca-build-test.mjs "a tic-tac-toe game in TypeScript" "two player browser game..." --out ~/Desktop/app2
node scripts/vaca-build-test.mjs "a 3d chess game..." "3D board, pieces, AI opponent, full rules" --out ~/Desktop/app3
```

Each writes `plan.json`, `generation.json` (with VACA's own verdicts), `files.json` and `report.json` under `out/vaca-builds/<slug>/`, and exports the scaffold to `backend/exports/`.
