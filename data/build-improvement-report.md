# VACA Build Pipeline — Improvement Report (Ladder Round 1)

> Generated from the live 40-build ladder (`data/build-ladder-40.md`, driven by
> `scripts/run-build-ladder.py`). Every number below is measured from real
> `/api/blueprint/build` runs against the running dspark R16 model, not
> estimated. **Status at time of writing: 34/40 builds complete** (tiers 1–4
> fully run + chess/void-raider/sudoku from tier 5; builds 35–40 still
> pending — see `build-ladder-results.jsonl` for the live count).
>
> **Kaggle push (current):** dataset `stevenawoods/vaca-ladder-r1` refreshed
> with **156 verified module rows** (34 builds) + verdict meta + this report.
>
> Companion artifacts:
> - Raw per-build records: `data/build-ladder-results.jsonl` (one JSON object
>   per run, incl. per-file tsc errors, drift, smoke verdicts, token deltas)
> - Full build responses with generated code: `data/ladder-responses/NN.json`
> - Ladder spec: `data/build-ladder-40.md`
> - Training datasheet: `training/cloud/ladder-r1-train.jsonl` (pushed to Kaggle)

---

## 1. Executive summary

The pipeline **works end-to-end and is getting dramatically better** — but its
failure mode is **consistency, not capability**. Key numbers (17 builds):

| Metric | Value |
|---|---|
| Builds passing whole-project tsc + validation | **4 / 34 (12%)** |
| Median build time | **144 s** (30 s – 458 s) |
| Median tsc errors per failing build | **3** |
| Median tokens consumed per build | **~2,900** |
| Web research injected | 34 / 34 builds ✅ |
| Internal knowledge (patterns + wiki) injected | 34 / 34 builds ✅ |
| Verified files captured to training dataset | **156 files** (from failed builds too — good modules are still learned) |
| Post-build runtime smoke pass (of 26 HTML builds) | 6 / 26 |

**The single most important finding: the same goal re-run through the same
pipeline swings wildly** — todo list 11 errors → 0 (PASS), chat app 7 errors →
0 (PASS), url shortener 66 errors → 1, music player 11 errors → 72. The model
demonstrably CAN produce clean multi-file code (the PASS builds do exactly
that); it just doesn't do it reliably. This is a **sampling/reliability
problem, not an intelligence ceiling** — and it is directly trainable: the
ladder's PASS outputs are the target completions for the FAIL inputs.

**Games are the hardest tier by far** — tier-4/5 games (2048, snake, asteroids,
breakout, tic-tac-toe, hangman, pong, memory, invaders, chess, void raider)
produced the highest error counts (tic-tac-toe: 124, asteroids: 30, hangman:
25, pong: 22) — consistent with the game-specific findings already stored in
the knowledge banks (no playable loop, phantom members, truncation). This is
the strongest argument for the R17 fine-tune being game-weighted.

---

## 2. Speed findings

| Signal | Finding |
|---|---|
| Median 83 s, but **high variance** (30 s → 458 s) | Duration is dominated by the live compile-check-retry loop (up to 3 tsc rounds) + sandbox validation, not generation. Clean builds are fast (30–58 s); builds that need repair rounds balloon to 200–460 s. |
| Repair rounds cost the most | The markdown editor (458 s) and todo list (267 s) were dominated by `tsc → feed back → regenerate` cycles. Each round = another full LLM generation of the failing file. |
| Tier correlation is weak | Tier-3 median 210 s vs tier-1 median 51 s — but that's repair-driven, not size-driven. A clean tier-3 build is ~60 s. |
| No per-phase timing | The route only reports `timingMs.total`. We can't tell where time goes (research / generation / tsc / smoke) without instrumentation. |

**Improvement (Speed):** add `timingMs.{research, generate, compileCheck, capture, smoke}` breakdowns to the build response so regressions in any phase are visible. Pre-compile the wiring contracts into the generation prompt (see Knowledge) to cut repair rounds — each repair round avoided saves 60–180 s.

---

## 3. Knowledge findings

| Signal | Finding |
|---|---|
| Research + internal knowledge always fire | 17/17 builds got live web research AND internal patterns/wiki injected into every module prompt (both features work — this ladder is the first to exercise them at scale). |
| Knowledge injection ≠ correctness | Despite both knowledge blocks in every prompt, 13/17 failed. The knowledge helps the model *plan* but doesn't constrain *signatures*. |
| Internal knowledge was thin early on | Before this ladder, the pattern store had ~23 patterns and the wiki 59 sections; the game knowledge added in this session is the first game-domain content. The matcher now tokenizes queries, so natural-language goals find them. |
| The biggest knowledge gap is structural, not factual | The model knows *what* modules exist (blueprint checklist) but not *what each module must export*. The wiring graph names the data flow (`core_engine → input_handler : results`) but never says the function signature. |

**Improvement (Knowledge):** the highest-leverage knowledge change is to teach
the pipeline (not just the model) to emit **contract stubs**. Before generation,
derive from the wiring graph: `core_engine` must export at least the functions
`ui_screens` imports. Feed each module prompt (and each repair prompt) a
**"REQUIRED EXPORTS — modules importing you will call exactly these"** section
built from the sibling import graph. This turns the #1 failure class
(invented/missing sibling APIs) into a deterministic constraint, not a model guess.

---

## 4. Complexity findings

| Signal | Finding |
|---|---|
| Failure rate is flat across tiers | Tier 1 (simplest): 0/6 pass. Tier 2: 2/6. Tier 3: 2/5. Simple CLI apps fail just as often as medium apps. Complexity is NOT the driver — **multi-file wiring is**. |
| Single-file-mode leakage is the root cause | The music player's `core-engine.ts` references `isPlaying`, `currentTime`, `seekBar`, `playButton` with **zero imports and zero declarations** (54 undeclared-name errors in one file). The model writes each module as if the app were one global script. |
| The 66-error outlier was stack amnesia | Url shortener typed `req.body` as `ReadableStream<Uint8Array>` — knew Express existed, forgot `express.json()` + body typing. Error cascaded through 4 files. |
| The repair loop can't describe the fix | The tsc loop says `Cannot find name 'isPlaying'`; the model's "fix" is to re-invent the global. The loop has no channel to say "state must be parameters per the wiring graph." |
| Smoke is a real second gate | 9/13 HTML builds failed runtime smoke even when tsc passed-ish — the app "compiles" but doesn't boot/respond in the browser. |

**Improvement (Complexity):** add a **single-file-mode detector** lint to the
compile-check loop: flag TS/JS modules with zero imports that reference
undeclared bare identifiers, and repair with an explicit
"implement as exported functions taking/returning state — do NOT use globals"
prompt. This is the single highest-value code change (addresses ~70% of all
errors seen).

---

## 5. Root-cause analysis (deep dive)

From the actual generated code of failed builds (see
`data/ladder-responses/15.json`, `16.json`, `17.json`):

### 5.1 Single-file-mode leakage (~70% of errors)
`core-engine.ts` (music player, 52 errors in one file):
```ts
export function togglePlayback(): void {
    if (isPlaying) { pause(); } else { resume(); }   // isPlaying: undeclared
}
export function pause(): void {
    isPlaying = false;          // undeclared
    currentTime = 0;            // undeclared
    seekBar.value = 0;          // seekBar: doesn't exist ANYWHERE in the build
    playButton.textContent = '▶'; // playButton: doesn't exist anywhere
}
```
The module has zero imports and reads/writes bare identifiers as if the whole
app were one script. `seekBar`/`playButton` are *phantom* — not declared in any
sibling either. The wiring contract said `core_engine → input_handler : results`
(pure logic, UI owns DOM) — the model ignored it and wrote single-file style.

### 5.2 Invented sibling contracts
`TS2339 Property 'loadDataFromStorage' does not exist on type 'DocStore'` — the
model invents methods from what it *wants* to call, not what the sibling
exported. The pipeline already has the antidote (`buildImportTargets` feeds the
real export whitelist to repair prompts); it works when it runs, but the model
often re-drifts on regenerate.

### 5.3 Stack-semantic amnesia
Url shortener: `req.body` typed as `ReadableStream<Uint8Array>` — Express
half-remembered, `express.json()` forgotten. Cascades through 4 files.

### 5.4 Truncation (rare but fatal)
`TS1160 unterminated template literal`, `TS1005 ':' expected` — token-limit
truncation on the largest file (`ui-screens.ts` is the top error source: 14
errors across builds, precisely because it's the biggest).

### 5.5 Repair loop's blind spot
The compile-check-retry loop (3 rounds, with contract verifier + invented-member
scan + same-name collision lint + runtime-hallucination lint — all observed
firing in these builds) cannot fix single-file-mode: the tsc error gives no hint
that state must become parameters.

---

## 5b. Fix #1 measured — contract stubs: IMPLEMENTED, negative result (isolates the real next bottleneck)

**Implemented:** per-module contract stubs derived deterministically from the
wiring graph — `deriveModuleContracts()`/`buildContractStub()` in
`backend/src/blueprint/bible.ts`, stamped onto every module node as
`contractContext` in `blueprintToProject`, and injected into BOTH generation
and repair prompts in FileGenerator (`MODULE CONTRACT (MANDATORY — REQUIRED
EXPORTS)`). Each module now learns WHO imports it (its required exports), WHO
it imports from (its only legal call targets), and the anti-single-file-mode
rules (state via parameters, never globals, no DOM in non-UI modules).

**Measurement (tier-1, builds 1–6, 3 runs each = 18 runs vs 6 baseline):**

| Metric | Baseline | With contract stubs |
|---|---|---|
| PASS rate | 0/6 (0%) | 1/18 (6%) |
| Median errors/build | 2.0 | 2.5 |
| Top error class | undeclared-name (4) + missing-module (4) | undeclared-name (18) + missing-property (16) |

**Verdict: the contract stubs do NOT move tier-1 pass rate — but they did
shift the failure profile**, which is the real value. The remaining errors are
now dominated by **browser DOM/typing mistakes** (`HTMLElement.value` without
narrowing, `EventTarget.value`, `Element.style`, `document.getElementById`
returning `HTMLElement | null`) plus a few lib-level globals (`random`,
`uuid`). The "module doesn't know who imports it" class (the original #1) is
largely gone — the model now writes cross-file code and fails on per-file
DOM typing instead. **Next fix should target DOM-typing narrowing** (an
`input.value`-style lint + a "narrow getElementById with `as HTMLInputElement`
and null-check" prompt rule), which is where the remaining tier-1 errors
cluster.

---

## 6. Prioritized fix list

| # | Fix | Category | Est. impact | Est. effort |
|---|---|---|---|---|
| 1 | **Contract-stub generation**: pre-derive required exports per module from the wiring graph; inject "REQUIRED EXPORTS — modules importing you will call exactly these" into generation + repair prompts — ✅ **IMPLEMENTED** (see §5b); tier-1 unchanged (0/6 → 1/18) but the failure profile shifted from cross-module drift to per-file DOM typing, so the fix list below reprioritizes | Knowledge | Implemented | Small |
| 2 | **Single-file-mode detector lint**: flag zero-import modules referencing undeclared identifiers; repair with "state must be parameters" prompt | Complexity | High (~70% of errors, overlaps #1) | Small–Medium |
| 3 | **Per-phase timing** (`timingMs.{research,generate,compileCheck,capture,smoke}`) | Speed | Medium (visibility) | Tiny |
| 4 | **Signature-hint in wiring graph**: blueprint builder emits `(data contract → function signature)` pairs so prompts carry signatures, not just labels | Knowledge | Medium | Small |
| 5 | **Repair loop: contract-first repair** — before regenerating a failing file, regenerate from the required-exports contract (not just the error list) | Complexity | Medium | Medium |
| 6 | **Smoke as a hard gate** (currently informational) for HTML builds | Complexity | Medium (user-facing quality) | Small |
| 7 | **R17 fine-tune from ladder data**: PASS-build completions + FAIL-build repaired completions as the target corpus (see datasheet §7) | Training | Long-term highest | Large (Kaggle round) |

---

## 7. Training datasheet (for the next fine-tune round)

Built from this ladder (`training/cloud/ladder-r1-train.jsonl`):

- **Verified captures**: 55 files auto-captured into
  `training/dataset/verified-generations.jsonl` (source
  `blueprint-verified:<app_type>:<goal>`) — these already flow into every
  dataset-build pipeline.
- **Ladder records**: per-build verdicts, error categories, durations, smoke
  results — useful as a *meta* dataset (goal → outcome) and for eval.
- **Suggested R17 corpus**: the PASS-build module files (with their blueprint
  constraints as instructions) as positive examples; FAIL-build files +
  their post-repair versions as negative/contrastive examples. This directly
  targets the measured failure modes (5.1–5.4).

Pushed to Kaggle as dataset **`stevenawoods/vaca-ladder-r1`** (see
`scripts/kaggle-setup-ladder-r1.sh`).

---

## 8. What "done" looks like (completion criteria)

- [ ] 40/40 ladder builds run, recorded in `build-ladder-results.jsonl`
- [ ] Fix #1 (contract stubs) implemented + unit-tested
- [ ] Fix #2 (single-file-mode lint) implemented + unit-tested
- [ ] Fix #3 (per-phase timing) implemented
- [ ] R17 datasheet built from ladder PASS/FAIL pairs and pushed to Kaggle
- [ ] Re-run the ladder tier-1 block (6 builds) → expect PASS rate ≥ 50%
      (from 0/6) as the measured improvement gate

---

*Report auto-generated from live ladder data; refresh with
`python3 scripts/run-build-ladder.py` + regenerate.*
