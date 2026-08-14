# VACA Intent Upgrade — Full Plan, Evidence & Roadmap

> **Status:** Parts 1–3 **+ Part 2b (capped hybrid)** + **Part 2c (chunked incremental generation)** + **Phase 1 (cross-file contracts)** all shipped and validated — 98/98 backend tests green. This document captures *why* they were needed (the evidence), *what* each part does (the implementation), and *where this goes next* (the roadmap with effort estimates).

**Scope:** the `codePlanner` path (`plan-code` → answers → `write-code`) — the interactive flow that turns a user request like *"make a complete chess game with an AI player"* into planned files and generated code.

---

## 1. The Problem — Evidence

### 1.1 Context existed, but never reached the write path

An audit of the codebase found six candidate mechanisms for understanding the user — four of which were dead code in the generation path:

| Mechanism | Exists? | Reaches the write path? |
|---|---|---|
| `intentParser.ts` | ✅ | ❌ — parses *UI commands* (create/select/delete node), not app-building intent |
| User profile (`preferences`, `styleTags`, `history`) | ✅ | ❌ — saved via `user.ts`, but profile was `default` and nothing injected it into prompts |
| Design manifesto (`data/design-manifesto.md`) | ✅ | ❌ — injected into the **architect** prompt only |
| Library knowledge (`getLibraryContext`) | ✅ | ❌ — architect path only, not `codePlanner.ts` |
| Global UI pref (`cli/gui/ask`) | ✅ | ✅ — the *only* personalization the write path got |
| Clarifying questions | ✅ | ⚠️ — but **plain strings with no options** |

**The smoking gun:** the write path (`WRITE_PROMPT` / `FILE_WRITE_PROMPT`) saw only the `cli/gui/ask` toggle — the single least-personalized layer in the app — while the user's profile, the design manifesto, and the 40+ library pattern sheets sat unused on the architect side.

### 1.2 Free-text questions = the model guesses anyway

In the live chess tests, the model asked *"Should the AI use Monte Carlo Tree Search?"* as **free text**. We answered `"Yes"`. It wrote a stub.

> "Free-text Q&A with no structure = the model guesses your needs anyway."

Measured on the same chess request:

| Before (string questions) | After (structured questions) |
|---|---|
| 2/3 answers were `"Yes"` | answers: **TypeScript, GUI** (real options) |
| 188-byte `move_rules.ts`: `return false` | 4 real files, all > 200 bytes |
| empty board, `isGameOver` undefined, `this.` missing → **stub** | `game.ts` has a real `rnbqkbnr` board + real `makeMove` |
| — | one-shot 4/4 files in **30.9s** |

### 1.3 The post-fix failure class: cross-file API mismatch

Structured answers **killed the stub** (game.ts became real code), but a *new* failure class surfaced — files disagree on interfaces:

- `minimax.ts` calls `game.isGameOver()`, `game.getAllValidMoves()`, `game.undoMove()` — none exist on `ChessGame` → **14 tsc errors**
- Runtime crash: `TypeError: game.isGameOver is not a function`
- Some are even *internal* to a file (`move.val` vs `move.value`)

**Critical insight (reviewer-flagged):** this class is **not fixable by per-file retries** — the per-file fallback regenerates one file at a time and can never reconcile interfaces. It needs a *whole-project contract* — now **shipped** as roadmap Phase 1 (per-file `exports`/`uses` contracts, see below).

### 1.4 The partial-write failure class (hybrid chess run)

The hybrid one-shot (Part 2b) fired its context log correctly — but the measurement run exposed a *new* failure class: **the one-shot truncated mid-JSON and was silently accepted as a success.**

| Hybrid chess run | Result |
|---|---|
| Planned files | 4 |
| **Written** | **1** (`src/chess-engine.ts`, 630 bytes) |
| Missing (0 bytes) | 3 — `ai-opponent.ts`, `game-state.ts`, `ui.ts` |
| "tsc errors" | 3 — **all TS6053 "File not found"** (the missing files, not real type errors) |

Root cause: the one-shot tried to emit all 4 files in one JSON, ran out of token room, and produced a partial file set. `extractJSON` recovered the 1 complete file and `oneShot.length > 0` accepted the partial as a *successful one-shot* — the per-file fallback never rescued the other 3. The one written file itself had 3 real errors standalone (TS2307 missing `./ai-opponent` / `./game-state` + TS2693 `'Board' only refers to a type, but is being used as a value`).

**The honest read:** a 1-of-4 write makes tsc error counts non-comparable across runs — this run's "3 errors" ≠ the 14-error baseline. It is the *exact* token-cap failure the chunked mode (Part 2c) was built to solve.

### 1.5 The goal-vs-hybrid A/B (same plan, both full coverage — but confounded)

`ab-controlled.py` (now `AB_MODES=goal,hybrid,dominant`, coverage-gated) ran the same chess request in both modes:

| | **goal** (1800 goal-only) | **hybrid** (900+900) |
|---|---|---|
| Plan (same) | `game_engine.ts` + `ui/index.html` + `ui/styles.css` | same |
| Answers | `{ai_difficulty: Medium}` | same |
| **Generation path** | **per-file** (one-shot JSON unparseable → fallback) | **one-shot** |
| Coverage | 3/3 ✅ | 3/3 ✅ |
| **tsc errors** | **13** | **53** |
| Time | 69s | 53s |

**Not a clean libraryMode A/B:** the generation *paths diverged* (per-file vs one-shot), so the 13-vs-53 delta mixes path with context strategy. Error classes differ too — goal's 13 are *real* cross-file type errors (TS2528 multiple default exports, TS2614 no exported member, TS2341 private member access), while hybrid's 53 are dominated by **TS1002 unterminated string literal** — JSON-integrity corruption from the giant one-shot, not a code-quality signal. **Neither mode is tsc-clean.** The concrete takeaway: per-file-only fallback and the giant one-shot each have distinct failure modes — the **chunked mode** (small per-call generations with per-chunk tsc gates) is the path that avoids both.

---

## 2. The Intent Upgrade — Parts 1–3 + 2b/2c (SHIPPED)

### Part 1 — Structured clarifying questions  *(~1.5 days, done)*

Questions upgraded from `string[]` to a schema so the UI renders choices instead of a text box.

**Backend — `backend/src/routes/codePlanner.ts`**
- `interface ClarifyingQuestion { key, question, options?, type: 'choice' | 'text' }`
- `normalizeQuestions()` — accepts legacy strings **and** structured objects; assigns stable unique keys (`q1`, `q2`, or dedup `key_2`); infers `choice`/`text`; drops empties
- `PLAN_PROMPT` now carries a QUESTION SCHEMA section: *"options get rendered as radio buttons in the UI and produce far better answers than free text"*
- Write prompts resolve answer keys → question text (`questionByKey`), so the model sees `Q: What interface? / A: Web` instead of raw keys
- Both `plan-code` and `interactive` routes normalize before returning

**Frontend — `frontend/src/components/ReasoningPanel.tsx`**
- Live answer form above the input row: **radio buttons** for `choice`, text input for `text`, with ⚙️ **Write Code** / ✕ **Dismiss**
- One shared `writeCodeForPlan()` used by both the free-text path and the form (answers keyed by `q.key`)
- Double-submit guard (`isProcessing`), form scrolls within the panel (`maxHeight`/`overflowY`), clear buttons reset pending state

**Validation:** backend tsc ✅ · frontend tsc ✅ · **41/41 tests** ✅ · reviewer signed off.

**Evidence it worked:** same chess request, now answered with real options — stub dead, real board + real `makeMove` generated.

### Part 2 — User-context injection into the write path  *(~0.75 day, done)*

The three existing context sources now reach every generated file.

**Backend — `backend/src/routes/codePlanner.ts`**
- `loadUserProfile()` — `profiles/current_user.txt` → `backend/users/<name>/profile.json`, **10s TTL cache** (mirrors `manifesto.ts`), module-anchored paths via `import.meta.dirname`
- `getUserProfileSection()` — compact `USER PROFILE` block from `styleTags` + `preferences`
- `getWritePromptWithContext(request)` (one-shot) = `WRITE_PROMPT` + profile + manifesto + **`getLibraryContext(request)`** capped at 1800 chars
- `getFileWritePromptWithContext(file)` (per-file) = `FILE_WRITE_PROMPT` + profile + manifesto + **`getLibraryContextForNodeType(inferNodeTypeFromPath(f.path), f.language)`** capped at 1500 chars
- `inferNodeTypeFromPath()` mirrors the canvas typing heuristic (`ui`/`database`/`input`/`logic`); `capInjection()` bounds context so it can't starve the 13k-token output budget

**Validation:** backend tsc ✅ · 41/41 tests ✅ · reviewer signed off twice (fixed: path resolution + TTL cache) · live backend confirmed.

**Net effect:** the write path went from seeing *nothing* about the user to seeing their profile, the design manifesto, and relevant library patterns on every file.

### Part 2b — Capped hybrid: dominant-type + goal context in the one-shot  *(done)*

The one-shot deviation above is resolved with a **capped hybrid** — the one-shot WRITE_PROMPT now gets *both* context sources under the same 1800-char budget (900 + 900, no net prompt growth):

- `generatePlanFiles` runs a **dominant-node-type tally** across the plan (`logic`/`ui`/`database`/`input` by the path heuristic) plus the dominant language
- The one-shot prompt = `getLibraryContext(request)` (goal-based, **900 chars**) **+** `getLibraryContextForNodeType(dominantType, dominantLang)` (dominant-type, **900 chars**)
- `libraryMode` is `'goal' | 'hybrid' | 'dominant'` and **A/B switchable** via the route body — the `goal` and `dominant` variants remain for measurement (section 1.5 used exactly this switch)
- Log line: `[codePlanner] one-shot context: nodeType=logic/typescript (libraryMode=hybrid)` (label changed from the earlier `(900+900 split)` text during the dominant-REPLACEMENT work)

**Validation:** backend tsc ✅ · **98/98 tests** ✅ (85 codePlanner + 13 intentExtractor) · hybrid shipped and A/B-measured against `goal` in section 1.5.

### Part 2c — Chunked incremental generation  *(done, `chunkSize` opt-in)*

The token-cap failure class (section 1.4) is addressed by a `chunkSize` opt-in on `write-code` / `interactive` (int 1–50): instead of one 13k-token one-shot, `generateChunkedFiles` runs a small build loop —

1. **Order by dependency** (contract `uses` edges, cycle-safe) so import targets are written first
2. **Split into chunks**; per chunk, one LLM call (`maxTokens: 8192`) with a **`CHUNK_WRITE_PROMPT`** system prompt — *"write ONLY the files listed in THIS CHUNK — never other files, never new unplanned files"* (fixes the contradiction where the one-shot system prompt commands writing *everything*)
3. **Buffer:** write the chunk to disk immediately, filtered to the chunk's planned paths (invented / later-chunk files dropped)
4. **Check:** `tsc --noEmit` on the *accumulated* files (async `spawn`, 60s SIGKILL guard — no event-loop blocking)
5. **Repair:** errors fed back with the failing file's content **plus the export lists of its import targets** (fixes with real declared members), targeted by normalized full path *and* basename
6. **Re-check:** tsc re-runs after repair, capped at 2 rounds per chunk — the "write → build → check → repair → repeat" the user asked for, verified *within* the chunk

Returns `{ mode: 'chunked', exportDir, repairRounds, tscErrors }` — files are already on disk, so routes skip the second write pass.

**Validation:** backend tsc ✅ · 98/98 tests ✅ · reviewer signed off across **five** passes — including its own residual catch (the chunked path initially reused the one-shot system prompt, which commands writing *every* file; that contradiction is fixed with `CHUNK_WRITE_PROMPT`).

### Part 3 — Lightweight intent extraction  *(~1 day, done)*

A deterministic, rule-based extractor normalizes the raw request into a spec **before planning**.

**New — `backend/src/ai/intentExtractor.ts`**
- `extractIntent(request)` → `{ goal, targetUser, coreFeatures, uiStyle, language }` — pure, synchronous, never throws (empty spec for non-string input)
- **Language:** distinctive names match anywhere (`python`, `rust`, `c#`…); ambiguous ones (`go`, `js`, `ts`) only match with context (`in go`) so *"go make me…"* doesn't false-positive; `\bjava\b` can never match inside `javascript`; conservative inference (interactive GUI → `html`, data/scraping → `python`)
- **UI style:** platform first (`cli`/`game`/`web`/`desktop`/`mobile`), visual appended (`web, dark`)
- **Target user:** *"for my family"* → `my family` (article group preserved); guards for `for me` and `for two players`
- **Goal:** strips `"can you please build me a…"` / `"I want a…"` / `"make me a…"` fillers; first-sentence only; ≤160 chars
- **Core features:** 24 keyword patterns, all **case-insensitive** (a subtle root-cause bug: without `/i`, `AI player` never matched — caught by tests), capped at 6
- `formatIntentSection(spec)` — renders `━━━ UNDERSTOOD INTENT ━━━` block; every field is **advisory** — the prompt tells the LLM to correct it if it misreads the request

**Wiring — `backend/src/routes/codePlanner.ts`**
- Injected into `plan-code`, `interactive`, and `generatePlanFiles` (one-shot **and** per-file prompts)
- Returned as `intent` in API responses (observability; enables the UI intent card in Phase 4)

**Validation:** backend tsc ✅ · **54/54 tests** ✅ (13 new extractor tests + 41 codePlanner) · reviewer signed off ("Ship it").

---

## 3. Roadmap — What's Next (with effort estimates)

Effort = engineering-days for an agent-assisted solo dev on this codebase. Each phase builds on the previous.

| # | Phase | Why it matters | Effort | Priority |
|---|---|---|---|---|
| 0 | **Parts 1–3 + 2b/2c, Phase 1 (shipped)** | structured questions + user context + hybrid one-shot + chunked gen + file contracts | done | — |
| 1 | **Post-write contract verifier** | closes the Phase 1 residual: drift between *declared* and *actual* exports/imports | **1–2 days** | 🔴 P0 |
| 1b | **Partial one-shot acceptance gate** | a 1-of-4 one-shot must fall back to chunked/per-file, not silently "succeed" | **0.5–1 day** | 🔴 P0 |
| 2 | **Training-data loop** | turns every corrected app into a training pair — the compounding lever | **3–5 days** | 🔴 P0 |
| 3 | **Fast-coder intent refinement** | handles genuinely ambiguous requests without a rule explosion | **0.5–1 day** | 🟡 P1 |
| 4 | **Intent card in the UI** | user sees/corrects the spec before answering — closes the loop | **0.5–1 day** | 🟡 P1 |
| 5 | **tsc gate + whole-project auto-repair** | makes "compiles" a hard gate, not a spot-check | **1–2 days** | 🟡 P1 |
| 6 | **Retrain on the corrected dataset** | bakes understanding + generation into the model itself | **GPU hours (infra exists)** | 🟢 P2 |

### Phase 1 — Cross-file contract enforcement  *[SHIPPED · was 2–3 days]*
Now live in `backend/src/routes/codePlanner.ts`, exactly per the plan below — the plan emits an explicit **public-interface contract** per file (what each file exports, the members other files may use):
1. **Plan-time:** `PLAN_PROMPT` requires a `FILE CONTRACT SCHEMA` — every planned file declares `exports: string[]` (members it declares) and `uses: {from, members[]}[]` (members imported from other planned files). `normalizeFileContracts` sanitizes the untrusted JSON; `checkContractConsistency` runs **before generation** and warns on every violation (e.g. `ai.ts imports 'ChessBoard' from game.ts, but game.ts does not export it`)
2. **Write-time:** `WRITE_PROMPT` rule 10 — *"HONOR THE FILE CONTRACTS… undeclared cross-file references are the #1 compile failure"*; every write path (one-shot, per-file, **and chunked**) injects the mandatory contracts block; both `plan-code` and `interactive` routes normalize `plan.files`
3. **Gate (harness-side):** `ui-chess-flow-check.py` / `ab-controlled.py` run whole-project `tsc --noEmit` over the export dir; the chunked path additionally gates *per chunk inside the route*; promoting a full in-route gate to the one-shot path is Phase 5
4. **Repair:** chunked mode regenerates per-file with the tsc error list + the **import targets' export lists** appended to the prompt

**Validation:** section 2f contract tests — **85/85 codePlanner tests** green; reviewer signed off (verification pass: the interface-first approach "plausibly prevents" the TS2304/TS2339/TS2614 class and is "a genuine mechanism, not a prompt wish").

**Known residual (by design):** `checkContractConsistency` validates the model's *declared* contracts only — it can't see write-time drift (generated code that fails to actually export a declared member, adds a call not in its `uses`, or invents a brand-new import path like `../../board/board`). Closing it is the new **Phase 1 post-write verifier** (roadmap row 1).

### Phase 2 — Training-data loop  *[P0 · 3–5 days]*
The user's stated motivation: better training data. Now that requests → (structured questions + answers + intent spec) → verified code, capture it:
1. **Capture:** when a generated export passes the tsc gate (and ideally a playtest), store `{ request, intent spec, questions + answers, plan, code }` as a dataset row
2. **Clean:** the existing `campaign50-corrected.jsonl` pattern (import/export/compactness contract) already exists — reuse it as the row validator
3. **Merge & re-split:** fold verified rows into `training/dataset/` (the merge script + re-split already exist from the campaign-50 work)
4. **Why this beats raw scraping:** every row is a *(request + answers + spec → working code)* pair — exactly the format the model needs to learn both understanding and generation. Each corrected app compounds.

### Phase 3 — Fast-coder intent refinement  *[P1 · 0.5–1 day]*
`extractIntent` is rule-based by design; for genuinely ambiguous requests, layer the existing fast-coder path (`translator.reasonFast`, which already routes GPU1 0.5B → GPU0 1.5B → CPU → 7B) on top:
- Add a low-confidence signal to the extractor (e.g. empty `language` + empty `uiStyle` + <2 core features)
- On low confidence, call `reasonFast` to fill gaps before planning — still zero cost on the common path

### Phase 4 — Intent card in the UI  *[P1 · 0.5–1 day]*
The `intent` field is already in the plan responses; surface it in `ReasoningPanel`:
- Show `UNDERSTOOD INTENT` as an editable card between planning and the question form
- User can correct `goal`/`coreFeatures` inline — which feeds back into `answers`, making the write prompt even more precise

### Phase 5 — In-route tsc gate + whole-project auto-repair  *[P1 · 1–2 days]*
Promotes the harness-side gate (Phase 1 item 3) into the route itself, and automates the Phase 1 item 4 repair strategy — distinct deliverables, not a duplicate. *(Partial credit: the chunked path already runs an in-route per-chunk tsc gate + repair — Phase 5 extends that to the one-shot/per-file paths.)*
- After `writeFilesToExport`, run `tsc --noEmit` on the export dir (or the per-file equivalents) and return a `compileStatus` in the response
- On failure with fixes possible, auto-retry the one-shot with the tsc error list injected (bounded retries + the existing safety timeout)
- **Note:** per-file fallback cannot fix cross-file mismatches — only whole-project regen can (ties into Phase 1)

### Phase 6 — Retrain on the corrected dataset  *[P2 · GPU hours]*
Infrastructure already exists and has been exercised:
- 4-bit QLoRA on `qwen2.5-7b-instruct-uncensored` (GPU 1, DDP), `campaign50-corrected.jsonl` merged into `train.jsonl` (2,847 + 215 examples) and re-split
- Trained GGUF (q4_k_m) auto-deployed into the dspark model dir + dspark restart, verified via `/v1/health`
- **After Phases 1–2 land**, rerun on the enlarged, contract-clean dataset so the model learns the *full* contract at the source (imports, named exports, no-JSX-in-ts, cross-file interfaces)

---

## 4. Why this program beats "just train harder"

Training teaches the model to write *better code*; it does nothing if the model never learns *what you want* — because questions were unanswerable and context was missing. The intent upgrade attacks the understanding layer first (cheap: no GPU hours, all data sources already in the repo), and then the training-data loop (Phase 2) compounds on top, because every corrected app becomes a training pair in exactly the format the model needs.

**Pipeline reminder:** the one-shot cap is 13,000 output tokens at `nCtx` 16,384 (raised from 8,192 earlier in the project). Context injections are capped precisely to protect that budget — the hybrid split (900+900) stays within the old goal-only 1800 budget, Phase 1 contracts stay compact, and the chunked mode (`chunkSize`) sidesteps the cap entirely with 8,192-token per-chunk calls.

---

*Last updated: 2026-07-31 — Parts 1–3 + Part 2b (hybrid) + Part 2c (chunked) + Phase 1 shipped; 98/98 backend tests green (85 codePlanner + 13 intentExtractor); backend tsc clean.*
