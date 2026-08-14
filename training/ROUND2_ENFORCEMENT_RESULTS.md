# Round-2 Enforcement Layer — member-whitelist + static invented-member scan

Follow-up to `ROUND2_CONTRACT_FIDELITY_PLAN.md`. The LoRA round improved the
model but did not erase the 7B contract wall, so the complementary pipeline-side
enforcement was shipped and validated with 5 real chess blueprint builds.

## What was added (`backend/src/layers/fileGenerator.ts`)

1. **Member whitelist extraction** (`extractExports` → `FileExportInfo.members`):
   every top-level `class`/`interface` whose name is exported (via `export class`,
   `class X {…} export { X }`, `export default X`, or `export default class X`)
   gets a whitelist of its declared members. Previously only `export class` was
   scanned — `export { X }` / `export default` types (which the model used in
   real builds) silently had no whitelist.
2. **Prompt injection** (`describeExports`): dependents now see
   `GameRulesEngine { makeMove, evaluate, initPlayers }` / `default BoardState { … }`
   plus a MEMBER WHITELIST RULE ("never call a member not listed in braces;
   implement it locally with the whitelisted members").
3. **Static invented-member scan** (`findInventedMembers`, wired into the
   `compileCheckAndFix` loop): flags `var.member(` calls on variables typed as a
   whitelisted class AND `TypeName.member(` static calls, emits TS2339-style
   errors with the whitelist inline, and feeds them into the fix loop even when
   tsc misses them (loose typing). Scans a comment-stripped copy so JSDoc
   examples can't false-positive.
4. **Deterministic fix rounds**: `AITranslator.reason()` gained an optional
   `temperature` (default = unset, no behavior change for other callers);
   `fileGenerator` passes 0.2 for tsc-fix rounds so the model repairs instead of
   reimagining the file.

## Supporting fixes

- `backend/src/sandbox/dockerRunner.ts`: local TS sandbox no longer writes a
  tsconfig.json (config + explicit file args made tsc emit TS5112 and mark
  clean files as failing); all options now passed on the CLI
  (`--target ES2022 --module ESNext --moduleResolution bundler --esModuleInterop
  --skipLibCheck --allowImportingTsExtensions`).
- `backend/src/routes/codePlanner.ts` + `backend/src/training/verifiedGenerationCapture.ts`:
  filter TS5112 (config artifact) from tsc error counts.

## Validation — 5 chess blueprint builds (`POST /api/blueprint/build`, appType chess_game)

| build | change staged | errors | validated | invented-member scan | notes |
|---|---|---|---|---|---|
| 1 | enforcement v1 | 25 | 3/7 | 1 caught (MoveGenerator.generateMove → fixed) | coverage gap: `export {X}` / `export default` had no whitelist |
| 2 | whitelist all export styles + static-call scan | 50 | 1/7 | **15 caught** across MoveGenerator/GameRulesEngine/BoardState | aggressive detection; model thrash at hot server-default temp |
| 3 | + fix rounds @ temp 0.2 | 8 | 1/7 | 0 | 4 of 8 errors were TS5112 harness artifacts; **zero invented members**; all export contracts present; UI exports `render` |
| 4 | + TS5112 sandbox fix | 32 | 3/7 | 0 | no artifacts; residual = TS2304 undefined local names (completeness) |
| 5 | + review fixes (default-class bug, comment-strip, temp 0.3) | 79 | 1/7 | 0 | round-1 was cleanest ever (1 file failing) but 0.3 fix rounds drifted (1 → 6) |

## Findings

- **The enforcement works on its target class**: invented members on
  whitelisted dependency types are caught (builds 1–2) and no longer survive
  (builds 3–5: zero scan hits means zero whitelisted-type inventions). Export
  contracts now land reliably (`render`, `GameRulesEngine`, `AIEngine`,
  `ChessEngine`).
- **Round-1 quality improved**: build 5's first pass failed only 1 of 6 files.
- **The remaining wall is model completeness, not contract fidelity**: residual
  errors are TS2304 (undefined local names/helpers) and TS2339 on the model's
  *own local* types — no whitelist can cover a type the model never exported.
- **Fix-round temperature**: 0.2 produced the best build (4 real errors) and
  beats 0.3 (which caused fix-round drift). Default (server hot) temp thrashes.
- Sample variance is high (8–79 errors) at generation temp; a stronger model or
  a dedicated completeness check (require every referenced local name to be
  defined) is the next lever.
