# Large-Program Architecture — Scaling Multi-File Generation
> Generated: 2026-08-04
> Purpose: Training data source + prompt knowledge for teaching the VACA model to
> design and generate LARGE programs (20–60+ files) that stay compilable, layered,
> and production-grade. Converted to training examples by
> `scripts/build-vaca-knowledge-dataset.py` and injected into architect/planner
> prompts by the backend.

---

## Why "large" is different

A large program is NOT a small program with more code in each file. It is a
program with MORE FILES that each do ONE thing. The single most important rule:

> **One file = one responsibility. A 60-file program where every file is under
> 200 lines compiles and scales far better than a 10-file program with 1000-line
> monoliths.**

When the model plans a large app it must decompose by RESPONSIBILITY, not by
"put everything in main.go". Every layer gets its own folder, every feature its
own module, every type its own file.

---

## The Scale Ladder

The number of files is decided by the GOAL, never by laziness:

| Scale | File count | Example apps | Generation strategy |
|-------|-----------|--------------|---------------------|
| Tiny | 3–7 | hello CLI, config reader | one-shot |
| Small | 8–14 | calculator, todo, notes | one-shot |
| Medium | 15–24 | chat app, music player, CRUD dashboard | one-shot or chunked |
| Large | 25–45 | e-commerce, blog + CMS, analytics platform | **chunked** (files written in dependency-ordered batches, tsc-checked each round) |
| Enterprise | 45–90 | SaaS platform, multi-tenant CMS, trading system | **chunked** with per-file fallback + repair rounds |

**Determining scale from the request:** multi-user? persistence? auth? payments?
realtime? file uploads? → Large or Enterprise. A goal mentioning 3+ distinct
features (accounts, catalog, checkout, orders) is automatically Large.

---

## The 9 Mandatory Layers of a Large Program

Every large program MUST contain nodes/files for ALL of these, or it is not a
large program:

1. **Entry point** — `main.go` / `src/main.ts` / `app.py`: wires everything,
   starts the server, graceful shutdown. Should be THIN (under 100 lines).
2. **Config** — `config.go` / `config.ts` / `settings.py`: env vars, defaults,
   validation. Never hardcode secrets.
3. **Types/Models** — `models/` or `types/`: every data structure its own file
   or one `models.go` with ALL types. Shared everywhere.
4. **Data layer** — `repository.go` / `db/` / `storage.ts`: CRUD, migrations,
   connection handling. NOTHING else lives here.
5. **Business logic / Services** — `service.go` / `services/`: validation,
   rules, orchestration. The biggest layer in a large app — split by feature
   (`user_service.go`, `order_service.go`, `payment_service.go`).
6. **API / Handlers / Routes** — `handlers/` or `routes/`: HTTP in/out,
   JSON parsing, status codes. Thin — delegates to services.
7. **UI / Views** — `ui/` or `views/` or `web/`: presentation only.
8. **Tests** — `*_test.go` / `*.test.ts`: at least one test per service.
9. **Build/config files** — `go.mod`, `package.json`, `Makefile`, `README.md`,
   `.env.example`, CI config.

For a Large app the folder structure the model should plan is:

```
cmd/ or src/ or app/          → entry point + wiring
  config/                     → configuration
  models/ or types/           → shared data structures
  repository/ or data/ or db/ → persistence (one file per entity)
  services/ or logic/         → business rules (one file per feature)
  handlers/ or api/ or routes → HTTP layer (one file per resource)
  ui/ or views/ or web/       → presentation
tests/ or *_test files        → tests beside the code they test
docs/ or README.md            → usage + architecture notes
```

---

## Dependency Direction (The Golden Rule)

Edges/imports must flow ONE way:

```
ui / handlers  →  services  →  repository  →  models/types
                   ↑              ↑
                   └── config is imported by EVERYTHING, imports nothing app-specific
```

- A service may import models + repository + config. NEVER the other way around.
- Handlers may import services + models. NEVER repository directly.
- Models/types import NOTHING (or only stdlib). They are the bottom of the DAG.
- Config imports nothing app-specific.
- **Never create import cycles** — if A imports B and B imports A, the program
  cannot be generated in dependency order. When a cycle is detected, the model
  must merge the two files or move the shared type into models/.

---

## Per-File Contracts (exports/uses)

For large programs the plan declares EVERY file's public API surface:

- `exports`: every function/class/type/constant the file defines.
- `uses`: exactly which members it imports from which OTHER planned file.
- Generated code must HONOR the contracts: never reference a member the target
  file doesn't export. This is the #1 compile failure in large builds — a
  `handlers.go` calling `CreateOrder` that `service.go` never declared.

Rule of thumb per file: 3–10 exports, 0–8 uses. If a file needs 15+ uses it is
probably doing too much — split it.

---

## Feature Decomposition Pattern

For each FEATURE in the goal (e.g. "users", "products", "checkout"), the model
creates a vertical slice:

```
<feature>_models.go   → types for that feature
<feature>_repo.go     → persistence for that feature
<feature>_service.go  → business rules for that feature
<feature>_handlers.go → HTTP endpoints for that feature (large apps)
<feature>_test.go     → tests for that feature
```

4–5 files per feature × 5 features = 20–25 files, PLUS the shared layers
(entry, config, shared models, middleware, auth, UI). That is how a natural
"e-commerce" request becomes a 30–40 file program.

---

## Naming Conventions (keep the build compiling)

- Go: `main.go`, `config.go`, `models.go`, `user_repo.go`, `order_service.go`,
  `handlers.go` + `_test.go` siblings. Package `main` or a single shared package
  for small/medium; per-folder packages for large.
- TypeScript: `src/main.ts`, `src/config.ts`, `src/types/order.ts`,
  `src/services/orderService.ts`, `src/routes/orderRoutes.ts`, `*.test.ts`.
- Python: `main.py`, `config.py`, `models.py`, `repositories/`,
  `services/order_service.py`, `api/routes.py`, `tests/test_order.py`.
- Non-code files: `schema.sql`, `README.md`, `.env.example`, `Makefile`,
  `go.mod`, `package.json`.

Never name two files the same. Never generate a file named `utils.go` that
contains everything — split utilities by domain.

---

## Generation Strategy for Large Programs

The VACA pipeline generates large programs in **dependency-ordered chunks**:

1. Order files so imports come first (models → repository → services → handlers
   → main).
2. Write the first chunk (3–6 files), run tsc/compile check.
3. Feed errors back to the model as a repair round; rewrite only the failing
   files.
4. Repeat until every file is written and the accumulated set compiles.

The model should expect this: it is normal for a 40-file program to be written
in 8–12 rounds. Each round only writes ITS files — never re-emit earlier files,
never reference a file not yet written.

---

## Quality Gates (what "production-grade" means for large builds)

- Every service file has error handling — no `panic()` / `throw` at top level
  without a recover/catch boundary.
- Every handler validates input BEFORE calling services.
- Every repository uses transactions for multi-step writes (where the language
  supports it).
- Every config value is read from env with a default, never hardcoded.
- Every feature has at least one test.
- README explains how to run, configure, and test.
- No TODO/placeholder/stub files — "large" does not mean "skeleton".

---

## Anti-patterns the model must NEVER produce

- A single 1500-line `main.go` / `app.ts` containing every layer.
- Copy-pasted duplicate logic across feature services (extract to shared
  service or models).
- A file that imports from a file that is not yet planned.
- Two files exporting the same symbol name.
- Business logic inside handlers (thin handlers, fat services — always).
- SQL/HTML/config embedded in Go/TS code as giant strings (use files).
