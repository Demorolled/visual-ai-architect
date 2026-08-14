# Code Lesson: Repair Rounds — Fixing Compile Errors Without Touching Earlier Rounds
> Purpose: Training data source teaching the VACA model how to run a REPAIR
> round: after a generation round produces files that fail to compile, feed
> the compiler errors back and regenerate ONLY the failing files — keeping the
> same exported symbol names, never re-emitting or editing files that already
> pass, and never touching earlier rounds. This is the third step of
> round-based generation (after blueprint-to-files walkthroughs), and it
> mirrors the live compile-check-retry loop in the generator: generate → run
> `tsc --noEmit` → feed errors back → regenerate failing files → repeat (up to
> `maxRounds`).

---

## When a repair round happens

You generated round 4 of a 33-file program. `tsc --noEmit` (or `go build`, or
`gofmt -e`) reports that 3 of the 6 files you just wrote fail to compile.

A repair round is:
1. **Diagnose** — read every compiler error, one by one.
2. **Fix ONLY the failing files** — regenerate each one, feeding its exact
   errors back as guidance.
3. **Never touch passing files** — a file that compiles is DONE, even if it
   lives next to a broken one.
4. **Never touch earlier rounds** — rounds 1–3 compiled; re-emitting them
   would create churn, duplicates, and regressions.
5. **Repeat** until clean or `maxRounds` is hit.

---

## The repair loop (as the generator runs it)

```
for round in 1..maxRounds:
    errors = compileCheck(allFiles)          # tsc --noEmit / go build
    if no errors: return DONE
    for (file, errs) in errors:
        regenerate(file, feedback=errs)      # ONLY failing files
    # passing files are never re-emitted
```

Key facts from the real implementation:

- **Only the failing files are regenerated** — the loop iterates over
  `errorsByLabel`, and for each failing label it re-runs generation with the
  compiler errors injected into the prompt.
- **Passing files are left untouched** — files not in the error set are never
  re-emitted. Their sandbox/validation results stand.
- **Rounds are capped** (`maxRounds = 2` by default) — if a file still fails
  after the cap, generation stops rather than looping forever.
- **The repair prompt keeps the contract**: "Keep the SAME exported symbol
  names (other files import them)." Renaming an export during a repair breaks
  every importer in later rounds.

---

## The #1 repair rule: KEEP THE SAME EXPORTED SYMBOL NAMES

When a file fails to compile and you regenerate it, the temptation is to
rewrite it "better" — rename a function, restructure the types, change the
signature. DON'T. Other files (later rounds, earlier rounds, tests) import
those exact names. The compiler error is usually in the BODY, not the API:

| Wrong repair move | Why it breaks |
|-------------------|---------------|
| Rename `OrderService` → `OrderServiceV2` | Importers in later rounds reference `OrderService` → TS2304 / undefined |
| Change `NewOrderService(repo)` to require a config arg | Callers pass one arg → arity error |
| Rename `Save` → `Persist` | Repo importers and tests break |
| Add a new export nobody asked for | Unexpected API surface; contract checker flags it |
| Delete the file "and rewrite it fresh" | Its importers in earlier-accumulated rounds dangle |

Fix the code, keep the surface. If a rename is genuinely needed, it's a PLAN
change — update the plan (and every importer) first, then regenerate.

---

## Diagnosing the error classes

| Compiler error | Likely cause | Fix |
|----------------|--------------|-----|
| `TS2304: Cannot find name 'X'` | Referenced a `uses` member without the build adding its import, or the member doesn't exist in the target file | Check the target file's exports; use only listed members |
| `TS2307: Cannot find module './y'` | Imported a module not yet written or not in `uses` | Write the dependency first (dependency order), or remove the import |
| `TS2345: Argument of type A is not assignable to B` | Signature mismatch with a `uses` member | Match the target's actual signature, not a guessed one |
| `TS2554: Expected N arguments, but got M` | Constructor/call arity wrong | Look at the constructor you injected; fix the call site in THIS file only |
| `TS2322: Type 'X' is not assignable to type 'Y'` | Wrong type in a field/param | Use the type the plan/models define |
| `gofmt: expected '}', found ...` | Unbalanced braces from truncation | Re-emit THIS file only, complete and balanced |
| `undefined: X` (Go) | Referenced a name not defined/imported | Check exports of the `uses` module; add to uses if genuinely needed |

---

## Worked example: repairing round 5 of kanban-ts

Round 5 wrote `src/routes/tasksRoutes.ts`, `boardsRoutes.ts`,
`projectsRoutes.ts`, `commentsRoutes.ts`, `activityRoutes.ts` and
`src/middleware/auth.ts`. `tsc --noEmit` reports 2 failing files:

```
src/routes/tasksRoutes.ts(12,5): error TS2554: Expected 1 arguments, but got 2.
src/routes/tasksRoutes.ts(19,7): error TS2304: Cannot find name 'TaskRepo'.
```

Diagnosis:
- `TS2554` at line 12: the service's `create(input)` takes ONE argument, but
  the route called `svc.create(title, boardId)`. The route in THIS file is
  wrong — fix the call to pass one object: `svc.create({ boardId, title })`.
- `TS2304` at line 19: `TaskRepo` is referenced but the route's `uses` lists
  only `TaskService` — the build never adds a `TaskRepo` import, and routes
  must not use repositories anyway. Fix: remove the `TaskRepo` reference from
  THIS route (it belongs in the service, which already handles persistence).

Correct repair — only `tasksRoutes.ts` is regenerated, only its body changes,
its export name `tasksRoutes` and signature stay identical:

```ts
// before (broken):  r.post('/tasks', (req, res) => { svc.create(req.body.title, req.body.boardId) ... })
// after (fixed):    r.post('/tasks', (req, res) => { const task = svc.create({ boardId: req.body.boardId, title: req.body.title }); res.json(task) })
```

The other four routes and middleware compiled — they are NOT re-emitted. Rounds
1–4 are untouched. Next repair round, `tsc --noEmit` is clean.

## Worked example (Go): repairing a truncated file in round 3 of filebox-go

Round 3 wrote the five service files. `gofmt -e` reports one failure:

```
internal/service/files_service.go: expected '}', found 'EOF'
```

Diagnosis: the file was truncated mid-struct (a common output-limit failure),
not a logic error. Repair: re-emit ONLY `files_service.go`, complete and
balanced, keeping its exports `FileService`/`NewFileService` and the
constructor signature `NewFileService(files *FileRepo)` — the four other
services compiled and stay untouched, as do rounds 1–2.

```go
// before (truncated, broken):
type FileService struct {
	files *FileRepo

// after (complete, compiles):
type FileService struct {
	files *FileRepo
}

func NewFileService(files *FileRepo) *FileService {
	return &FileService{files: files}
}
```

Same discipline as the TS example: fix the failing file's body, keep its
API, leave everything else alone.

---

## Repair rounds never fix earlier rounds — by design

You might be tempted to "improve" a round-2 repository while repairing round 5.
Resist. Earlier rounds already compiled and other files were written against
them. Re-editing them:

- invalidates the accumulated-set invariant ("file written only when every
  uses target exists"),
- risks introducing new errors in files that were already validated,
- breaks the "3–6 files per round, compile-check each round" discipline.

If an earlier file genuinely needs a change, treat it as a NEW round: update
the plan entry, edit that one file, and re-check the whole accumulated set —
but do it deliberately, not as part of a routine repair.

---

## Repair discipline checklist

1. Read ALL errors before editing — 2 errors in one file may share one cause.
2. Regenerate only failing files; keep their exported names and signatures.
3. Never re-emit passing files; never touch earlier rounds.
4. Fix the body, keep the API. If the API must change, change the plan first.
5. After the repair round, re-run the compiler; stop when clean or at
   `maxRounds`.
6. If a file still fails after maxRounds, flag it for the next round rather
   than degrading its contract to make it pass.

---

## Anti-patterns (memorize these)

| Anti-pattern | Consequence |
|--------------|-------------|
| Rewriting a passing file "while I'm here" | Churn; new errors in validated code |
| Renaming exports during repair | Breaks importers in later rounds (TS2304) |
| Adding imports/`uses` not in the plan to fix a missing name | Contract violation; build won't add them |
| Deleting and rewriting a whole file for one bad line | Loses validated structure; new bug surface |
| Fixing round-2 code during a round-5 repair | Invalidates the accumulated-set invariant |
| Looping forever on one stubborn file | Output stalls; cap at maxRounds and move on |
| Changing a signature to "make it compile" | Callers in other files now mismatch |
