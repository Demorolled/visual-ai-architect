# One-Shot Design Review

## UPDATE — post-fix re-probe (probe4, same todo-CLI prompt)

The P0 missing-import fix (import-necessity check #3 + dedicated `buildMissingImportRepairPrompt` + TS2305/2614 routing + `import type` support + comment/string/local-declaration false-positive guards) shipped and is verified:

**What changed vs the original failing probe:**
- ✅ **Cross-file imports now exist.** probe1's files had ZERO import statements; probe4's `main.ts` imports `./todo`, `storage.ts` imports `./todo` — the hole is closed.
- ✅ **TS2552 (phantom symbol `new App()`) routed** to the missing-name repair class (was falling through to generic repair and surviving).
- ✅ **False-positive guards verified by unit tests:** locally-declared members (inlined) don't trigger repair; member names in comments/strings don't count as references; `import type { X }` satisfies the necessity check.
- ✅ 881 backend tests pass (was 877 before this change set).

**Residual failure class exposed (different from missing imports):**
The one-shot truncated and fell back to per-file; the 3 generated files still had 6 tsc errors after 2 repair rounds:
1. **Cross-file API drift** — `main.ts` writes `.completed` but `todo.ts` declares `TodoItem.done` (TS2353 + TS2339). The contract verifier checks export *names*, not *member shape*, so a property-name mismatch sails through.
2. **Undefined constants** — `storage.ts` references `TODO_FILE` (TS2304) never defined anywhere.
3. **Wrong-runtime globals** — `todo.ts` uses `Deno.readTextFileSync`/`Deno.writeTextFileSync` in a Node/tsc target (TS2304 ×2); the model even wrote a *second* local `loadTodos`/`saveTodos` in todo.ts instead of importing from storage.ts.
4. **Stub detector flagged all 3 files** — the probe's per-file fallback produced quality issues beyond compile errors.

**Suggested next fixes (beyond P0):**
- Route TS2304 toward an "undefined symbol" repair prompt that explicitly says: *replace wrong-runtime globals (Deno/Bun/globalThis/localStorage) with the target platform's APIs (Node fs/path) or define the missing constant locally* — the current prompt says "define locally OR import" but the weak model keeps the broken global.
- Add a shape-drift check to the verifier: when file A uses type `TodoItem` from file B, spot-check that property names used in A (`t.completed`) appear in B's type declaration (`.done`).
- Detect dual definitions: a file that defines a local helper with the same name as a declared export of a sibling it's supposed to use (todo.ts re-defining loadTodos/saveTodos instead of importing them).

**Two additional bugs found and fixed during validation (both mattered in probe5/probe6):**
- **`[IMPORT]`-tagged violations never routed to repair.** The contract-repair loop grouped violations with `v.match(/^([^ ]+)/)`, which captured the `[IMPORT]` tag as the grouping key — a key that matches no planned file — so missing-import violations were silently skipped by the repair pass. Fixed: the regex now strips an optional `[TAG]` prefix before capturing the file path.
- **Shared repair budget starved the tsc gate.** A single 6-call pool let the contract-repair phase consume every call (9 violations → 4), leaving **0 calls** for the tsc gate — observed as "18 tsc errors, 0 repair rounds." Fixed: per-phase budgets (contract ≤ 4, tsc gate reserves its own 4).

**Probe6 result (post-fix, same todo-CLI prompt):** one-shot wrote 3 files with **correct cross-file imports** (main.ts → `./todo` + `./storage`; storage.ts → `./todo`), **tscErrors = 0**, 3 contract violations → 1 after 2 repair rounds (the residual is declared-export drift: plan declares `run`+`main`, code exports only `main` — a separate weakness class, not imports).

**Probe7 + probe8 (post-routing-fixes):** import checks fully clean — **contractViolations = 0**. The remaining error class shrank to a single TS2307 "Cannot find module './app'" — the model importing a file the plan never declared. Two routing corrections from code review + live probes:
- **TS2339 removed from the import-repair class.** "Property X does not exist on type Y" is cross-file *shape drift* (`.completed` vs `.done`), not a missing name; the import prompt's "only add imports, don't restructure" instruction was *blocking* the model from fixing the real mismatch. It now stays on the generic repair prompt.
- **TS2307 added to the import-repair class** + the prompt now explicitly says: *if a module import points at a non-existent file, REMOVE it and implement locally or import from a planned file.* (Probe7's `import { TodoApp } from './app'` — with no `app.ts` anywhere — survived 2 generic-repair rounds because no prompt told it to drop the phantom import.)
- **Mixed-class routing fixed.** The tsc-repair class used `every()` on the missing-name regex, so a file mixing TS2304 with TS2554 (probe8: main.ts) fell to the generic prompt, which fixed arity but left the missing import. Now `some()` — any missing-name error routes the whole file to the import prompt, which also corrects call sites.

**Final probe results (probes 6–9, same prompt):**
- **contractViolations = 0 on every run** — the import-necessity check + repair are fully effective. (Original probe1: zero imports, 5 errors; probe5: 18 errors with repair starved to 0 rounds.)
- tsc errors dropped to 0–2 per run (probe6 hit a clean **0**).
- The repair loop now engages properly: contract 3→0 in 2 rounds, tsc 4→2 in 2 rounds (backend log).
- Residual errors are pure model-quality classes outside imports: TS2588 (reassigning a `const`), TS2307 phantom-module imports the weak model doesn't always remove within its 2-round/4-call budget. These belong to the future-fixes list (stronger generation, deeper repair budget for stubborn files), not to the import hole.

---

# One-Shot Design Review — codePlanner /write-code (Pass 1)

**Test:** `scripts/test-one-shot.py` (re-runnable) · **Probe:** "a small todo list CLI app with add, list and complete commands" · **Model:** Qwen2.5-7B (R6, DSpark)

## What the one-shot path does

`generatePlanFiles` → Pass 1: one LLM call (`maxTokens: 13000`) emits **all planned files in a single JSON** `{"files":[{path,content}...]}`. Guards layered on top:
1. `extractJSON` — recovers prose-wrapped / truncated-but-balanced JSON
2. **GUI-entry guarantee** — re-generates a missing index.html per-file
3. **Partial-write gate (1b)** — `findMissingPlannedFiles` fills any planned file the response skipped, per-file
4. **Contract verifier** — `verifyGeneratedContracts` scans generated code for declared-exports drift + imports of undeclared members → bounded repair (2 rounds / 6 calls)
5. **tsc gate (Phase 5)** — compiles the written .ts files, feeds errors back for bounded repair (2 rounds)
6. **Auto-chunk escape** — plans > 14 files go chunked instead of one-shot

## Live probe results (real run)

| Metric | Result |
|---|---|
| Mode | `one-shot` (as intended) |
| Wall time | **23.8s** for 3 files |
| Files written | 3 on disk (`src/todo.ts`, `src/ui.ts`, `src/index.ts`) — API response's `files` key absent (returns `written`), a client-contract papercut |
| tsc errors | **5 survived after 2 repair rounds** |
| Contract violations | 0 reported — **but the code is broken anyway** |

### The failure: missing imports (the verifier is blind to it)

```ts
// src/index.ts (as generated)
export function main() {
  const list = new TodoList();            // TS2304: Cannot find name 'TodoList'
  displayTodos(list);                     // TS2304
  const action = promptAddTodo();         // TS2304
  if (action) addTodo(action, list);      // TS2304
  console.log('Todos saved.');
}
// src/ui.ts
export function displayTodos(todos: TodoItem[]) { ... }  // TS2304: TodoItem
```

**Zero `import` statements were emitted anywhere.** The one-shot model wrote cross-file references with no imports. The contract verifier checks *"declared exports that never materialize"* and *"imports of undeclared members"* — but with **no imports at all**, it finds nothing wrong. `checkContractConsistency` validates the *plan's declared* contracts (which were consistent), not the written code's imports. So **0 contract violations + 2 repair rounds + 5 tsc errors** is exactly the failure mode the design was built to catch — and it slipped through both verifiers.

The tsc repair loop also failed to fix it: errors were mapped to `index.ts`/`ui.ts`, the repair prompt asked for the corrected file, but the model evidently returned code without imports again (bounded at 2 rounds / shared 6-call budget with contract repair).

## Weaknesses (ranked)

1. **Missing-import failure class is undetected by the contract verifier** (critical). `verifyGeneratedContracts` only scans *existing* imports for undeclared members; it never checks that referenced identifiers are imported at all. A file that references a sibling's symbol with zero imports passes. **Fix:** add an import-necessity check — for each planned file, every identifier used but not locally declared must appear in an import from a planned file (regex best-effort: scan `used` names vs `import` statements; flag references to planned-file exports that have no import).
2. **Repair budget is shared and shallow.** Contract repair and tsc repair share `MAX_REPAIR_CALLS = 6` and each gets ≤ 2 rounds; the model's failed fix consumes budget silently. **Fix:** separate budgets, and add a *third* specialized repair prompt for "missing import" errors (TS2304/TS2339) that explicitly lists "add import { X } from './file'" — distinct from generic code-fix repair.
3. **One-shot response shape vs route contract is inconsistent.** The route returns `written`, `totalFiles`, `writtenCount` but not a `files` array; the frontend probe (and likely UI code) assumed `files`. **Fix:** include `files` in the response for API symmetry (or document `written`).
4. **No cross-file import synthesis in the one-shot prompt.** `WRITE_PROMPT` says "Files must properly import from each other" but the tuned 7B still omits imports. **Fix:** add an explicit per-file import checklist to the plan contract block ("for each `uses` entry, the file MUST contain `import { member } from '<from>'`") and require the writer to echo imports.
5. **Auto-chunk threshold is file-count based (14), not token-based.** A 10-file plan with dense files can still truncate the one-shot JSON (the exact failure from INTENT_UPGRADE_PLAN.md §1.4). **Fix:** estimate planned tokens (Σ summary+exports lengths) and auto-chunk above a token budget (~6k output), regardless of file count.
6. **Single non-streaming LLM call = silent minutes.** 23.8s for 3 files; a 12-file one-shot is ~4–6 min with no progress signal. **Fix:** prefer chunked mode by default for >6 files, or stream per-file progress.
7. **`extractJSON` balanced-brace recovery can accept a truncated-but-balanced object.** If the model stops mid-content but braces happen to balance, a partial file set is accepted as "one-shot success". The 1b partial gate only fills *missing* files, not truncated ones. **Fix:** after parse, sanity-check each file has a plausible ending (e.g. non-trivial content length, no unterminated template literals) before accepting.

## Improvements (concrete)

- **P0 (bug):** Add the missing-import check to `verifyGeneratedContracts` + a dedicated import-repair prompt. This closes the exact hole the probe exposed.
- **P0 (API):** Return `files` from `/write-code` (or update consumers to `written`).
- **P1:** Auto-chunk by token estimate, not just file count; default threshold lower (>6 files or >6k output tokens).
- **P1:** Dedicated "missing import" tsc-error handling: when all errors are TS2304/TS2339 for sibling-file symbols, generate an import-only patch (one small LLM call) instead of rewriting whole files.
- **P2:** Separate repair budgets per phase (contract vs tsc) so one can't starve the other.
- **P2:** Add an import-echo requirement to the one-shot prompt and the FILE CONTRACT blocks (already present for per-file) — the one-shot's `contractsSection` shows `uses` but never demands import statements.
- **P2:** Stream progress events (SSE or WebSocket) during one-shot generation.

## Verified strengths (keep these)

- Partial-write gate (1b) fills missing files per-file ✅
- GUI-entry guarantee re-generates missing index.html ✅
- tsc gate runs on every write path with bounded repair ✅
- Contract verifier does catch the *declared-vs-actual export drift* class ✅
- Auto-chunk escape for >14 files prevents total token-cap failure ✅
- Training sidecar (`_training.json`) records mode/repair/tsc for fidelity ✅
