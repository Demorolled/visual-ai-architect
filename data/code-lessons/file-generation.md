# Code Lesson: Per-File Generation — Honoring the Blueprint Contract
> Purpose: Training data source teaching the VACA model the per-file generation
> step: given a large-program blueprint plan (a JSON list of planned files with
> `path`, `summary`, `language`, `exports`, and `uses` contracts), how to write
> EACH file so the whole program compiles by construction. This is the step
> between "plan 30 files" and "generate them all" — and the #1 source of
> compile failures in large builds.
>
> The examples derived from this doc are machine-verified: every sample's real
> public API and imports are checked against its plan entry's exports/uses by
> `scripts/check-file-generation-contracts.py` (run automatically by the
> generator, which aborts the merge on any violation).

---

## What the plan gives you

A blueprint plan is a list of file entries. Every entry declares:

```json
{
  "path": "internal/service/order_service.go",
  "summary": "Order business rules: creation, totals, status flow",
  "language": "go",
  "exports": ["OrderService", "NewOrderService"],
  "uses": [
    { "from": "internal/repository", "members": ["OrderRepo"] },
    { "from": "internal/models", "members": ["Order", "OrderStatus"] }
  ]
}
```

When generating a single file, the contract is the LAW:

1. **`exports` = the ONLY public API the file may define.** Every listed member
   must exist in the generated file. Anything not listed must be private
   (lowercase / not exported / not in `__all__` / `internal`). Never invent
   extra public exports — other files' `uses` entries don't know about them.
2. **`uses` = the ONLY imports allowed.** You may import ONLY the `from`
   modules listed, and ONLY the `members` listed. A file that imports a module
   not in its `uses` (or a member not listed) can compile alone but breaks the
   program: the target file may not export it, or the dependency direction
   (ui → services → repo → models) gets violated.
3. **`summary` = the file's one responsibility.** If your code does more than
   the summary describes, split it into another planned file.
4. **`path` = the exact target.** Package name (Go), module path (Python),
   namespace (C#), import specifier (TS) must be derived from the path.

---

## Dependency order: models first, main last

Generate files in the order the `uses` graph allows:

1. **models / types** — import nothing (`exports` is the entity + related types)
2. **repositories** — `uses` only the models they persist
3. **services** — `uses` repositories + models
4. **handlers / routes / API / UI** — `uses` services (+ models for DTOs)
5. **entry point** — wires everything together

Rule of thumb: a file may only `use` modules whose files are EARLIER in this
list. If A imports B and B imports A, the plan is broken — merge them or move
the shared type into models.

---

## Per-language per-file conventions

### Go (`internal/...`)
- Package name = last segment of the path with hyphens/spaces removed
  (`internal/service/order_service.go` → `package order_service`).
- NEVER write `package main` in a node file (only the real `cmd/` entry may).
- NEVER write `import` statements — the build system adds them from `uses`.
  Just reference the used members directly.
- Exported = capital first letter. `exports` must all be capitalized.
- Constructor convention: `NewOrderService(repo *OrderRepo)` returning
  `*OrderService`.

### TypeScript (`src/...`)
- Model files: `export interface X { ... }` + `export function isX(v: unknown): v is X`.
- Service files: export the class/function; use constructor injection.
- The build system strips import/export *statements* but keeps `export`
  *declarations* (export class / export function / export interface / export
  const) so other files can import the members. The `uses` members themselves
  resolve at assembly time — you reference them by name without writing the
  import. (For a single-file syntax check, a private type stand-in matching
  the used member's shape is fine; it stays un-exported so it never pollutes
  the real API surface.)
- No JSX in `.ts` files; no `import x from 'react'` unless the plan says so.

### Python (`app/...`)
- Module path = path with `/` → `.` and `.py` dropped
  (`app/services/order_service.py` → `app.services.order_service`).
- Model files: dataclasses, no imports beyond stdlib.
- NEVER write `import` / `from ... import` statements — the build system adds
  them from `uses` automatically. Reference the used members by name.
- `__init__.py` re-exports the package's public surface.
- NEVER write `if __name__ == "__main__":` in a node file; no top-level
  docstrings; no imports from outside the planned `app` tree.

### C# (`.NET` solution: Api → Application → Domain → Infrastructure)
- Namespace = the project prefix + folder path
  (`App.Application.Orders` for `src/App.Application/Orders/OrderService.cs`).
- Exports = `public` types/members only; everything else `private`/`internal`.
- Use constructor DI (inject the repo interface), thin API layer. Command DTOs
  referenced by public methods live in the same namespace, declared
  `internal` (never `public` — that would add exports the plan doesn't list).
- Never generate `Program.cs` / `Main` in a node file.

---

## The generation loop for one file

1. Read the plan entry. Note `path`, `exports`, `uses`.
2. Write the model/repo/service/etc. body for that ONE responsibility.
3. Implement every `exports` member; keep everything else private.
4. Reference ONLY the `uses` members (no other imports, no guessing).
5. Sanity-check: does the file do more than `summary`? Split it.
6. Move to the next file in dependency order. Never edit earlier files.

---

## Contract violations that break builds (memorize these)

| Violation | Symptom | Fix |
|-----------|---------|-----|
| Importing a module not in `uses` | Missing import / unknown member | Remove the import; it's not part of the contract |
| Using a member the target doesn't export | `undefined` / compile error | Check the target's `exports`; use only what it lists |
| Adding a public export not in `exports` | Unexpected API surface | Make it private |
| Importing a module that itself is later in dependency order | Import cycle | Move the shared type into models |
| File doing two responsibilities | Bloated file, broken summary | Split into two planned files |
| Wrong package/namespace/import-path | Won't resolve at build time | Derive from `path`, not from memory |

---

## Worked example: one slice end to end

Plan entries for the "orders" feature (Go, ecommerce):

```json
[
  { "path": "internal/models/order.go", "summary": "Order entity + status types", "language": "go",
    "exports": ["Order", "OrderStatus"], "uses": [] },
  { "path": "internal/repository/order_repo.go", "summary": "Order persistence: CRUD + status updates", "language": "go",
    "exports": ["OrderRepo", "NewOrderRepo"], "uses": [{"from": "internal/models", "members": ["Order"]}] },
  { "path": "internal/service/order_service.go", "summary": "Order business rules: creation, totals, status flow", "language": "go",
    "exports": ["OrderService", "NewOrderService"], "uses": [{"from": "internal/repository", "members": ["OrderRepo"]}, {"from": "internal/models", "members": ["Order", "OrderStatus"]}] },
  { "path": "internal/handlers/order_handlers.go", "summary": "HTTP endpoints for orders", "language": "go",
    "exports": ["OrderHandlers"], "uses": [{"from": "internal/service", "members": ["OrderService"]}] }
]
```

- `order.go` imports nothing; exports only `Order` and `OrderStatus`.
- `order_repo.go` uses ONLY `internal/models`'s `Order` — never the service.
- `order_service.go` uses `OrderRepo` + `Order`/`OrderStatus` — never the
  handlers, never the models' private internals.
- `order_handlers.go` uses ONLY `OrderService` — never the repo directly
  (handlers never import repository).

Each file's imports point strictly backward along ui → services → repo →
models. No cycles, no dangling members, no surprises. This is how a 30-file
program compiles the first time.

---

## Anti-lesson: what contract-breaking generation looks like

The service file below VIOLATES the contract in four ways — never write this:

```go
package order_service

// BAD: imports a package not in uses; adds a public export not in exports;
// invents methods the plan doesn't declare.

// import "fmt"  // BAD: fmt is not in uses — and Go node files never write imports anyway

type OrderService struct {
    repo *OrderRepo        // BAD: field name shadows the uses member — keep it injected and obvious
}

func NewOrderService(repo *OrderRepo) *OrderService { return &OrderService{repo: repo} }

func (s *OrderService) CreateOrder(...) {}   // BAD: CreateOrder is not in exports
func (s *OrderService) DoTotals() {}         // BAD: second responsibility, not in summary
```

Why it breaks: the import of `fmt` isn't in `uses`; `CreateOrder` and
`DoTotals` are public methods the plan never declared, so other files written
against the contract don't know they exist and the file does more than its
summary. Correct: exactly `OrderService` + `NewOrderService`, repo injected as
`*OrderRepo` from `uses`, only the methods the summary implies.

---

## When the plan is missing or thin

If the user asks you to generate a file without a plan entry:
1. Infer the minimal contract: the file needs whatever it needs to do its job.
2. Follow the layering rules (models import nothing, services import
   repositories + models, handlers import services).
3. Keep one responsibility; prefer more small files over one big file.
4. If a dependency target doesn't exist yet, generate it FIRST (dependency
   order) rather than referencing it into existence.
