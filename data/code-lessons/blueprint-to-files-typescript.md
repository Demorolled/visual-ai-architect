# Code Lesson: Blueprint to Files (TypeScript) — Round-Based Generation with src/ Layering
> Purpose: Training data source teaching the VACA model the FULL per-file
> generation step at program scale in a SECOND language: given a complete
> TypeScript blueprint plan (30+ files with exports/uses contracts), generate
> every file in DEPENDENCY-ORDERED ROUNDS so the whole program compiles at
> every intermediate step. Where the Go walkthrough used `internal/` layering
> (handlers), this one uses the TypeScript `src/` layering (routes) — the same
> round discipline, the same exports/uses contract, different idioms.

---

## TypeScript per-file conventions (recap)

The per-file generation lesson applies unchanged; the TS specifics are:

- **exports = `export` declarations** (`export interface`, `export class`,
  `export function`, `export const`, `export type`). Nothing else is public.
- The build system **strips `import`/`export` statements** but **keeps `export`
  declarations**, so files reference their `uses` members by name without
  writing imports — the build wires them.
- **Path → module**: `src/services/projectsService.ts` is imported as
  `./projectsService` from a sibling, `../repositories/projectsRepo` from
  services, etc. The `uses` `from` field is the module path.
- **Layering**: `main → router → routes → services → repositories → models`.
  Routes are the TS equivalent of Go handlers: thin HTTP mapping, business
  rules live in services, persistence lives in repositories.

---

## The plan at a glance (kanban-ts, 33 files)

Five features, each a vertical slice of 5 files (models, repo, service, routes,
test): `projects`, `boards`, `tasks`, `comments`, `activity`. Plus shared
layers: `config`, `middleware/auth`, `router`, `main`, and build files.

| Layer | Files | imports from |
|-------|-------|--------------|
| models | projects, boards, tasks, comments, activity | nothing |
| config | config | nothing |
| repositories | *Repo (5, one per feature) | models |
| services | *Service (5) | repositories + models |
| service tests | *Service.test (5) | their service |
| routes | *Routes (5) | services |
| middleware | auth (requireAuth) | nothing |
| router | router (buildRouter) | routes + middleware |
| entry | main | config + router |
| build | package.json, tsconfig.json, README.md, .env.example | nothing |

Dependency direction is strict and one-way:
**main → router → routes → services → repositories → models**, with config and
middleware imported by main/router and models importing nothing.

---

## Round 1 — models (5 files)

Why now: models are the leaf layer — `uses` is empty, so they have no
dependencies to wait for. Everything else depends on them.

Files: `src/models/projects.ts`, `boards.ts`, `tasks.ts`, `comments.ts`,
`activity.ts`.

`src/models/tasks.ts` (exports `Task`):

```ts
// Plan: src/models/tasks.ts — Task entity + status type.
// Exports: Task. Uses: none — models import nothing.

export interface Task {
  id: string;
  boardId: string;
  title: string;
  status: 'todo' | 'in_progress' | 'done';
  assigneeId?: string;
}
```

Contract check: exports exactly `Task` (the `status` union is a literal type,
not a separate export — nothing extra is public). No imports.

---

## Round 2 — config + repositories (6 files)

Why now: `src/config.ts` has no dependencies (exports `loadConfig`, `Config`)
and the entry point needs it, so write it early. The five repositories only
depend on models (round 1 done).

Files: `src/config.ts`, `src/repositories/projectsRepo.ts`, `boardsRepo.ts`,
`tasksRepo.ts`, `commentsRepo.ts`, `activityRepo.ts`.

`src/repositories/tasksRepo.ts` (exports `TaskRepo`; uses `src/models/tasks`
→ `Task`):

```ts
// Plan: src/repositories/tasksRepo.ts — Task persistence.
// Exports: TaskRepo. Uses: src/models/tasks → Task.
// import { Task } from '../models/tasks';  // added by the build

export class TaskRepo {
  private store = new Map<string, Task>();

  save(task: Task): void {
    this.store.set(task.id, task);
  }

  byId(id: string): Task | null {
    return this.store.get(id) ?? null;
  }
}
```

Contract check: exports only `TaskRepo`; the class API is the only public
surface; persistence only.

---

## Round 3 — services (5 files)

Why now: services depend on repositories + models, both of which exist after
rounds 1–2. They never depend on routes or each other's internals.

Files: `src/services/projectsService.ts`, `boardsService.ts`,
`tasksService.ts`, `commentsService.ts`, `activityService.ts`.

`src/services/tasksService.ts` (exports `TaskService`; uses
`src/repositories/tasksRepo` → `TaskRepo`; `src/models/tasks` → `Task`):

```ts
// Plan: src/services/tasksService.ts — Task business rules.
// Exports: TaskService. Uses: tasksRepo → TaskRepo; models/tasks → Task.
// import { TaskRepo } from '../repositories/tasksRepo';  // added by build
// import type { Task } from '../models/tasks';           // added by build

export class TaskService {
  constructor(private readonly repo: TaskRepo) {}

  create(input: { boardId: string; title: string }): Task {
    if (!input.title.trim()) {
      throw new Error('task title cannot be empty');
    }
    const task: Task = {
      id: crypto.randomUUID(),
      boardId: input.boardId,
      title: input.title,
      status: 'todo',
    };
    this.repo.save(task);
    return task;
  }
}
```

Contract check: exports exactly `TaskService`; uses only repositories and
models — never routes. Business rules live here.

---

## Round 4 — service tests (5 files)

Why now: each service test depends only on the service it tests (round 3
done). TypeScript has no separate health-handler in this plan, so this round
is just the five tests — the smallest round.

Files: `src/services/projectsService.test.ts`, `boardsService.test.ts`,
`tasksService.test.ts`, `commentsService.test.ts`, `activityService.test.ts`.

```ts
// Plan: src/services/tasksService.test.ts — Task service tests.
// Exports: none. Uses: src/services/tasksService → TaskService.
// import { describe, it, expect } from 'vitest';  // added by build
// import { TaskRepo } from '../repositories/tasksRepo';  // added by build

describe('TaskService', () => {
  it('rejects an empty title', () => {
    const svc = new TaskService(new TaskRepo());
    expect(() => svc.create({ boardId: 'b1', title: '   ' })).toThrow();
  });
});
```

Contract check: tests import their service and exercise error paths. Test
files follow the same rule as every generated file — no `import` statements
written by hand; the build adds them (including the vitest dev-dependency
imports) from the uses contract.

---

## Round 5 — routes + middleware (6 files)

Why now: routes depend on services (round 3 done) and models (round 1).
`src/middleware/auth.ts` has no dependencies but is consumed by the router, so
it lands here before the router round.

Files: `src/routes/projectsRoutes.ts`, `boardsRoutes.ts`, `tasksRoutes.ts`,
`commentsRoutes.ts`, `activityRoutes.ts`, `src/middleware/auth.ts`.

`src/routes/tasksRoutes.ts` (exports `tasksRoutes`; uses
`src/services/tasksService` → `TaskService`):

```ts
// Plan: src/routes/tasksRoutes.ts — HTTP endpoints for tasks.
// Exports: tasksRoutes. Uses: tasksService → TaskService.
// import { TaskService } from '../services/tasksService';  // added by build
// import { Router } from 'express';                         // added by build

export function tasksRoutes(svc: TaskService): Router {
  const r = Router();
  r.post('/tasks', (req, res) => {
    // thin: validate body → svc.create → res.json. No business rules here.
  });
  return r;
}
```

`src/middleware/auth.ts` (exports `requireAuth`):

```ts
// Plan: src/middleware/auth.ts — auth middleware.
// Exports: requireAuth. Uses: none.

export function requireAuth(req: unknown, res: unknown, next: () => void): void {
  // verify token, then next()
}
```

Contract check: routes import ONLY services — never repositories directly.
Framework types (express `Router`) resolve from build-added imports like
anything else; repository access belongs to services.

---

## Round 6 — router + entry + build files (6 files)

Why now: `src/routes/router.ts` wires every route and the middleware, so it
must wait until round 5. `src/main.ts` imports config + router. Build files
(package.json, tsconfig.json, README.md, .env.example) have no dependencies
and land last.

Files: `src/routes/router.ts`, `src/main.ts`, `package.json`, `tsconfig.json`,
`README.md`, `.env.example`.

`src/routes/router.ts` (exports `buildRouter`; uses `src/routes` →
`projectsRoutes`, `boardsRoutes`, `tasksRoutes`, `commentsRoutes`,
`activityRoutes`; `src/middleware` → `requireAuth`):

```ts
// Plan: src/routes/router.ts — assembles all routes behind middleware.
// Exports: buildRouter. Uses: routes ×5; middleware → requireAuth.

export function buildRouter(svcs: {
  projects: ProjectService;
  boards: BoardService;
  tasks: TaskService;
  comments: CommentService;
  activity: ActivityService;
}): Router {
  const r = Router();
  r.use(requireAuth);
  r.use(projectsRoutes(svcs.projects));
  r.use(boardsRoutes(svcs.boards));
  r.use(tasksRoutes(svcs.tasks));
  r.use(commentsRoutes(svcs.comments));
  r.use(activityRoutes(svcs.activity));
  return r;
}
```

`src/main.ts` (exports `main`; uses `src/config` → `loadConfig`, `Config`;
`src/routes` → `buildRouter`):

```ts
// Plan: src/main.ts — entry point. Exports: main. Uses: config, router.
// import { loadConfig } from './config';   // added by build
// import { buildRouter } from './routes/router';  // added by build

export function main(): void {
  const cfg = loadConfig();
  // build services, const router = buildRouter(svcs), then app.listen(cfg.port)
}
```

Contract check: thin wiring only — all logic lives in services.

---

## Why rounds work: the accumulated set compiles at every step

After round 1, models typecheck alone. After round 2, config + repositories
typecheck (their only imports are models). After round 3, services typecheck.
And so on. The invariant:

> **A file is written only when every module in its `uses` list already has a
> written file.** That single rule guarantees no dangling imports, no forward
> references, and no import cycles — the top-3 compile failures in large
> builds.

## Generating 3–6 files per round

Never dump 33 files in one pass — output limits truncate and the error surface
explodes. Instead:

1. Pick the next 3–6 files whose `uses` targets all exist.
2. Write them, honoring each file's exports/uses contract.
3. Typecheck the accumulated set (`tsc --noEmit`); feed errors back as a
   repair round that ONLY touches its own files — never re-emit earlier files,
   never reference a file not yet written.
4. Repeat. A 33-file program is written in 6 rounds like this one.

## Anti-patterns in round-based generation

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Writing routes before services | Routes reference unwritten services | Respect dependency order: models → repos → services → routes → router |
| Writing all 33 files at once | Truncated output, 20+ type errors at once | 3–6 files per round, typecheck each round |
| Re-emitting an earlier file in a repair round | Duplicate/mismatched definitions | Repair rounds only touch THEIR files |
| A route importing a repository directly | Bypasses the service layer | Move persistence calls into the service |
| `import type` referencing a module not yet written | TS2307 module not found | Write the dependency first, in an earlier round |

---

## The full round schedule for kanban-ts (33 files)

| Round | Files written | New dependency frontier |
|-------|---------------|-------------------------|
| 1 | src/models/{projects,boards,tasks,comments,activity}.ts (5) | models complete |
| 2 | src/config.ts + src/repositories/*Repo.ts (6) | config + repositories complete |
| 3 | src/services/*Service.ts (5) | services complete |
| 4 | src/services/*Service.test.ts (5) | services tested |
| 5 | src/routes/*Routes.ts (5) + src/middleware/auth.ts (6) | routes + middleware complete |
| 6 | src/routes/router.ts, src/main.ts, package.json, tsconfig.json, README.md, .env.example (6) | entire program complete |

Six rounds, each 4–6 files, each typechecking. The same discipline as the Go
walkthrough, with TS idioms: `src/` layering, routes instead of handlers,
`export` declarations as the contract surface, and `tsc --noEmit` as the
per-round check.
