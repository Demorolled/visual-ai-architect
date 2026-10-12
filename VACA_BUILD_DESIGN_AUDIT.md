# VACA Build-Design Audit — missing & incorrect design needs

> Date: 2026-10-02 · Scope: VACA's *generation/verification pipeline* (not the model weights)
> Method: read the real pipeline source (`codePlanner.ts`, `fileGenerator.ts`, `architect.ts`,
> `qualityGate.ts`, `generation.ts`) and cross-checked against the historical failure catalog
> `VACA_BUILD_TRIAGE.md` (F1–F11) and `VACA_SCAN_REPORT.md` (R1/I1–I6).
> Findings are ranked by impact. Every claim carries a `file:line` to verify.

---

## 0. The core structural finding

VACA ships **two independent generation pipelines with divergent verification standards**, and
the one the chat UI actually uses is the weaker one:

| | Canvas path | Chat path (the one users build in) |
|---|---|---|
| Entry | `POST /api/generate/:id/files` → `layers/fileGenerator.ts` | `POST /api/reason/write-code` → `routes/codePlanner.ts` |
| Compiler gate | tsc **+ `runNonTsProjectGates`** (go build / py_compile) — `fileGenerator.ts:2234` | tsc only — `codePlanner.ts:3275` |
| Stub / prompt-artifact gate | **yes** — `isStubBody` at `fileGenerator.ts:2209` | **no** — `isStubBody` is not referenced anywhere under `routes/` |
| Browser smoke engine | `sandbox/runtimeSmokeTest.ts` (TS/Playwright, works here) | `scripts/smoke-test-html.py` (`runRenderSmoke`, unavailable here) |
| Honest verdict | `tsCompileClean = tsGateClean && nonTsGateClean && stubFailureCount === 0` (`:2234`) | `✅ Wrote N files successfully` whenever `remainingTsc === 0` (`buildWriteSummary`, `codePlanner.ts:5549`) |

The frontend chat build calls `/api/reason/write-code` (`frontend/src/components/ReasoningPanel.tsx:743`)
→ `generatePlanFiles` (`codePlanner.ts:4738`). **None** of the F3/F5/F6/F11 gates that were added to
`fileGenerator.ts` exist on that path. The repairs from the last scan landed in the *canvas* pipeline
but the newer one-shot/chunked *chat* pipeline — now the primary surface — was never brought up to the
same standard.

---

## A. Missing design needs

### M1 — No non-TS compile gate on the chat write path (F3, still open)
`runTscCheck` filters to `.ts`/`.tsx` and returns `status:'skipped'` when none exist
(`codePlanner.ts:3275`). `fileGenerator.ts` built the honest counterpart
(`runNonTsProjectGates`, `fileGenerator.ts:2311`: `go build ./...` / `python3 -m py_compile`,
unavailable toolchain = FAILED), but `codePlanner.ts` never calls it.
**Consequence:** a Go/Python/Rust/CSS plan returns `compileStatus:'skipped'`, `remainingTsc:0`, and
`buildWriteSummary` prints `✅ Wrote N files successfully` — even for the exact malformed-import Go
build F5 describes. Reproduces the "`tsCompileClean:true` while 8/9 files failed" false positive, now
on the chat path.

### M2 — No stub / placeholder / prompt-artifact gate on the chat write path (F5/F6/F11)
`isStubBody` + `PROMPT_ARTIFACT_RE` (`knowledge/qualityGate.ts:100`, `:51`) exist and are wired into
`fileGenerator.ts:2209`, but `codePlanner.ts` has **zero** references to either. A file whose body is
`// TODO: Implement` or the echoed `// REAL FILE CONTENT: … injected by the platform` scaffolding
passes the write path as long as it type-checks.

### M3 — Plan-stage node-type coherence is incomplete (F10 residual)
Three different sources of truth for the allowed node types disagree:
- `types.ts:29` → 9 types **including `master`**
- `routes/architect.ts:96` → 8 types (no `master`)
- `routes/scanner.ts:13` → 7 types (no `master`, no `gui-layout`)

`sanitizeNodes` (`architect.ts:297`) coerces anything outside its 8-type set to `logic`, so a
`master` node silently becomes `logic`; `scanner.ts` would coerce `gui-layout` too. Meanwhile the plan
prompt at `architect.ts:1256` tells the model only **6** types (`input, output, logic, api, database, ui`).
There is no single shared, exported `NodeType` constant. Client-side suppression exists
(`isClientSideRequest`, `:326`; api/database stripped at `:1154`), so the worst F10 symptom is
contained — but the vocabulary drift is a latent bug class (plan output the validator silently
rewrites ≠ what the user/Library believes).

### M4 — Primary path can't run *behavioral* (click-through) verification here
`codePlanner`'s GUI gate is `runRenderSmoke` → `python3 scripts/smoke-test-html.py`
(`codePlanner.ts:3359`), which returns `unavailable` on any box without the Python Playwright
package (true on this box). The TS browser engine built for exactly this (`sandbox/runtimeSmokeTest.ts`,
probes + hidden-control handling) is only invoked by `generation.ts:112` (the canvas path).
**Consequence:** the chat build path cannot detect "compiles but crashes on click" at all in this
environment — the class the runtime-smoke work was created to catch. Two independent smoke
implementations is itself the design smell.

### M5 — `tscVerified` is semantically wrong and unused
`tscVerified: tscVerdict.status === 'clean' || tscVerdict.status === 'errors'`
(`codePlanner.ts:3096` and `:5425`) is **true even when the verdict is `'errors'`** — it reads as
"verified" but means "the gate ran". It is not in any route response (`/write-code` returns
`compileStatus`, not `tscVerified`, `:5858`) and has no consumer outside `codePlanner`. Dead field
that encodes a false contract; a future consumer or test will read it as "compiles".

---

## B. Incorrect design needs

### I1 — Two honesty standards for one product (root of M1/M2)
The same builder reports different truths depending on entry point. Any future fix applied to one
path silently misses the other unless the gates are factored into shared helpers (the pattern
started with `guiShared.ts`, but the *verification* gates were never shared).

### I2 — `learnFromWrite` self-poisoning window on smoke-unavailable boxes
The gate (`codePlanner.ts:5571`, logic at `:5595`) only refuses to learn when
`renderSmoke.status === 'failed' || cliSmoke.status === 'failed'`. **`'unavailable'`, `'skipped'`,
and `undefined` all fall through and teach the store.** For an HTML app, `compileStatus === 'skipped'`
and `remainingTsc === 0`, so on this box (Python Playwright missing → render smoke `unavailable`)
**every single-file HTML build is learned into `backend/knowledge/` with no behavioral verification.**
This is the exact self-poisoning class the surrounding comment claims to prevent
("smoke-failed checkers builds stored as 'Full architecture' patterns") — the guard is keyed on
`failed`, not on `verified-clean`. Correct predicate: only learn when the relevant gate is
`passed`, and treat `unavailable`/`skipped` as "unverified".

### I3 — `buildWriteSummary` treats "no gate ran" as success
`codePlanner.ts:5549` returns `✅ … successfully` when `remainingTsc === 0` and no smoke failed —
without checking whether a gate *ran*. `compileStatus:'skipped'` (no TS) + smoke `unavailable` ⇒
green checkmark on a build where **nothing was verified**. Should mirror `fileGenerator`'s
`!hasTsJs ? nonTsGateClean : …` honesty.

### I4 — Node-type vocabulary duplicated instead of imported (M3's cause)
`NODE_TYPES` is redeclared in `architect.ts` and `scanner.ts` rather than imported from
`types.ts`. `types.ts` also still carries `master`, which no validator accepts. Single source of
truth needed.

---

## C. What is working (verified this pass, to avoid re-fixing)
- **F1/F2** — addressed: `perFileScaffolder.buildTsEntryPoint` (`:442`) skips type-only exports
  (`isTypeOnlyExport`, `:466`) and auto-bootstraps (`:478`).
- **F4** — addressed on the canvas path: `generation.ts:103` skips browser smoke for
  non-web-language projects; `codePlanner.runRenderSmoke` skips when there is no HTML entry.
- **F8** — addressed: `applyDeterministicLocalCollisionFix` (`codePlanner.ts:1930`, called `:2886`, `:5233`).
- **F10 (contained)** — `sanitizeNodes` + `isClientSideRequest` suppress the api/database-bolted-onto-UI
  and unknown-type failure modes (see M3 for the residual vocabulary drift).
- **F11 (partial)** — the stub gate exists and is wired (`fileGenerator.ts:2209`), just not on the chat path.
- **I2** — addressed: `sandbox/runner.ts:65` `osToLanguage` passes real languages through.

---

## D. Recommended priority — IMPLEMENTED this session

1. ✅ **I2** — `learnFromWrite` now requires a *passed* gate: any failed gate disqualifies, and a
   build with no passed verification (tsc `clean`, a clean non-TS gate, or a passed smoke) is never
   learned (`codePlanner.ts`).
2. ✅ **M1 + M2 + I3** — new shared `sandbox/nonTsCompileGate.ts` (`runNonTsProjectGates`,
   `sanitizeGoModuleName`); `fileGenerator.ts` delegates to it; `codePlanner.ts` runs it plus the
   shared stub gate (`runPlannerBuildGates`) on both the one-shot and chunked paths, and
   `buildWriteSummary` now prints ⚠️ for a failed non-TS gate, stub bodies, and "no gate ran".
3. ✅ **M4** — `runRenderSmoke` falls back to the TS browser engine (`runRuntimeSmokeTest`) whenever
   the Python script is missing or returns `unavailable`/error.
4. ✅ **M3/I4** — canonical `PLAN_NODE_TYPES` in `types.ts`; `architect.ts` and `scanner.ts` import it;
   the rework plan prompt interpolates the same list.
5. ✅ **M5** — `tscVerified` renamed to `tscGateRan` (documented as "gate ran", not "compiles").

**Tests:** `backend tsc --noEmit` clean; full backend suite **1332 passed / 1 skipped (59 files)**;
new `src/routes/buildGates.test.ts` (17 tests) covers the gates + node-type unification.

### Follow-up implemented: full per-language gate coverage
`runNonTsProjectGates` now covers **Go, Python, Rust, C, C++, Java, C#, Swift, Kotlin, PHP, Ruby**
(`sandbox/nonTsCompileGate.ts`), with `resolveGateLanguage` normalizing declared language/aliases
(`golang`, `c++`, `c#`, `py`, `rs`, …) and falling back to the file extension. Technicians used:
`go build ./...`, `py_compile`, `rustc --emit=metadata`, `gcc/g++ -fsyntax-only`, `javac`,
`csc -target:library`, `swiftc -typecheck`, `kotlinc`, `php -l`, `ruby -c`. A missing toolchain is a
**failed** gate (`<bin> is not installed — gate unavailable`), never a silent pass.

### Follow-up implemented: one shared verification path (I1)
New neutral module `sandbox/buildVerification.ts` is now the **single** implementation both
pipelines call:
- `runTscGate` — the TypeScript compiler gate (temp-scaffold + one tsconfig + ambient
  globals). `fileGenerator.runTscCheck` and `codePlanner.runTscCheck` are now **thin adapters**
  over it, so canvas and chat compile against identical strictness, layout rules, JSX handling,
  and diagnostics. (Previously their tsconfigs differed: tsconfig-with-paths vs raw `tsc` flags.)
- `runStubGate` — one stub/placeholder gate (both pipelines previously duplicated it).
- `deriveBuildVerdict` — one "is this build verified, and may it teach the pattern store / be
  captured?" decision. Both `buildWriteSummary` and `learnFromWrite` read it, and
  `fileGenerator` maps its compile state onto it for `tsCompileClean` + capture/learning — so a
  build can no longer be ✅ in one pipeline's summary while ineligible in the other.
- `SmokeVerdict`/`TscStatus`/`SmokeStatus` — canonical statuses in one place (re-exported by
  `codePlanner` for compatibility). `runNonTsProjectGates` is re-exported here as the one import
  site for the language gates.

**Tests:** `src/routes/buildGates.test.ts` and the existing `codePlanner`/`fileGenerator` gate
tests stay green; full backend suite **1342 passed / 2 skipped (60 files)**; `tsc --noEmit` clean.

### Follow-up implemented: planner write path Go end-to-end test
`src/routes/plannerGoE2E.test.ts` drives `generatePlanFiles` (mocked LLM) through to the shared
Go gate in two modes: a **mocked `go` on PATH** (always runs — asserts `go build ./...` was really
invoked and the verdict is honest) and a **real `go` self-skip** (asserts a genuine Go build
passes), plus an unavailable-toolchain honesty check.

### Residual (not in scope / still open)
- M4's fallback still needs a browser on the box (Playwright or system Chrome); with neither, the
  gate correctly reports `unavailable` rather than a false pass.
- I1 is *mostly* closed: all **gates** both pipelines run (tsc, non-TS, stub) plus the verdict are
  now one implementation, and there is only ever one behavioral-smoke runner (it lives in
  `codePlanner` and is used by both chat write modes). What remains is that the **canvas path does
  not yet invoke** the behavioral smoke gate — a capability gap, not a drift. Adopting it means
  staging canvas output to an export dir and giving the loop a repair budget; deferred as a
  separate feature with `buildVerification.ts` as its designated home.
