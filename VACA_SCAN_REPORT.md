# VACA Deep Scan, Repair & Improvement Report

> Date: 2026-08-13 · Scope: every code file in the repo (~1,240 source files, ~116k lines of TS/TSX + Python/Go scripts)
> Method: automated whole-repo scan (`scripts/deep-scan.mjs`) + full typecheck + full test suites + live end-to-end build verification.

---

## 1. Scan results — what the whole repo looks like

| Check | Result |
|-------|--------|
| `tsc --noEmit` backend (179 files) | ✅ clean |
| `tsc --noEmit` frontend (135 files) | ✅ clean |
| Vitest backend (40 files) | ✅ **823/823 pass** |
| Vitest frontend (9 files) | ✅ **161/161 pass** |
| `vite build` frontend | ✅ builds (one chunk-size warning, non-blocking) |
| Python syntax (`py_compile`, all scripts) | ✅ all OK |
| Go fmt (all .go) | ✅ all OK |
| Markdown fences in source | ❌ **`todo-app/`** (9 files — real leak) · rest are data artifacts/legit scripts |
| Prompt artifacts ("REAL FILE CONTENT") | ✅ none in source (the `translator.ts`/`reasoning.ts` hits are VACA's own legitimate tool-marker prompt text) |
| Hardcoded secrets | ✅ none real (ollama default key + review-prompt patterns = false positives) |
| Stub markers | ✅ only in prompt/lesson strings and `placeholderFiles.ts` (a deliberate module) |
| Duplicate basenames | ⚠️ across generated apps only; none within `backend/src` or `frontend/src` |

**Verdict:** the app code itself is healthy (compiles + all tests pass). The *real* problems were (a) one checked-in generated app destroyed by the markdown-leak bug, and (b) the deterministic pipeline bugs that produce broken exports — those don't show up in tsc/tests because they only manifest on generated output.

## 2. Repairs made

| # | Problem | Fix |
|---|---------|-----|
| R1 | **`todo-app/` was 100% broken by the markdown-leak bug** — ```` ```typescript ```` fences wrapped all 4 `.tsx` files, and ```` ```json ````/```` ```text ```` wrapped `package.json`, `tsconfig.json`, `.npmrc`, and both `.gitignore`s. tsc failed with TS2349 on every file; npm rejected the config. | Stripped every fence → `todo-app` now **compiles clean**, npm warnings gone. (Evidence that the fence-leak bug destroyed real apps — the exact failure class VACA must keep out of generated output.) |

## 3. Improvements implemented (deterministic pipeline bugs)

All verified with `tsc --noEmit` + the full backend suite (823 tests, 3 new) + a live end-to-end build.

| # | Improvement | Evidence it mattered |
|---|-------------|----------------------|
| I1 | **Entry point imports only VALUE exports** (skips `interface`/`type`), and **auto-bootstraps non-UI projects** with a guarded `start()`/`main()`/`runApp()` call | Build-1 crashed at runtime: `The requested module does not provide an export named 'Config'` (Config is an interface). The re-run build's entry now imports `commands`/`render`/`TaskStore` (values) and **runs** with no crash. 3 new unit tests cover type-only skip, bootstrap call, and UI-project skip. |
| I2 | **Sandbox `osToLanguage` passes real languages through** — Go/Python/Rust were mapped to `typescript`, so every Go file "failed" with bogus `TS1434: package main` and the sandbox could never validate non-TS output | Chess build (Go): all 8 files were marked failed by TS errors. With the fix the sandbox runs `go vet`/`py_compile` for real. |
| I3 | **Go import paths use the sanitized module slug** (matches `go.mod`) instead of the raw project title; Go entry skips `package main` self-imports | Chess build: `malformed import path "a 3d chess game with 3d pieces and board, ...": invalid char ' '` and `"is a program, not an importable package"` — both deterministic go-build blockers. |
| I4 | **Prompt-artifact gate**: `REAL FILE CONTENT` / `injected by the platform` / `generated for the "…" node` now rejected by the learning gate + verified-capture path (and heavily penalized in scoring) | Chess `game.go` literally ended with `// REAL FILE CONTENT: Real file content injected by the platform...` — now never learned from or captured. |
| I5 | **Client-only prompt guard**: browser apps (ui node, no api/database) are told never to emit `DATABASE_URL`/`SECRET_KEY`/`API_KEY`/placeholders | Tic-tac-toe build shipped `SECRET_KEY='yourSecretKeyHere'` in a browser game. Now constrained at the prompt level. |
| I6 | **Contract verifier now reports violations** it previously missed (observed `contractViolations: 0 → 3` on the re-run) — the repair loop and the verifier engage on the LLM's cross-file drift | The re-run build's remaining 12 errors are pure LLM classes (TS2300/TS2440/TS2588) that the repair loop must fix — documented as the next work item. |

## 4. What remains open (next wave)

- **Repair-loop convergence (F7/F8)** — the local 7B still ships duplicate-identifier and import-conflict errors after repair rounds; route all tsc error classes into repair with the dependency's real export signatures (VACA_CHANGE_LIST item 6).
- **Language-aware compile gate (F3)** — non-TS builds get `tsCompileClean:true` vacuously; per-language gates (go vet / py_compile) should feed an honest overall verdict.
- **Runtime smoke skip for non-browser apps (F4)** — Go/CLI apps shouldn't boot in Chromium.
- **Plan-stage fixes (F10)** — reject unknown node types, CLI apps shouldn't get `ui` nodes, 3D apps shouldn't be planned in bare Go.

## 5. Tooling added

- `scripts/deep-scan.mjs` — repeatable whole-repo scan for fences, prompt artifacts, stubs, secret-shaped literals, duplicate basenames, Python/Go sanity (re-run any time: `node scripts/deep-scan.mjs`).
- `scripts/vaca-build-test.mjs` — live end-to-end build driver (re-run after any change: proves the pipeline works).
- `scripts/build-vaca-fixes-dataset.py` → `training/dataset/vaca-build-fixes.jsonl` — 6 verified repair-pair rows for training (all outputs compile).

## 6. Verification summary

- `tsc` clean on backend + frontend + todo-app
- 823 backend tests (3 new) + 161 frontend tests, all green
- Live build re-run: entry point no longer crashes (I1 verified end-to-end), Go sandbox errors gone (I2), Go import paths valid (I3)
- No new warnings; todo-app npm warnings eliminated
