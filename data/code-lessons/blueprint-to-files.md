# Code Lesson: Blueprint to Files — Generating a Whole Blueprint Round by Round
> Purpose: Training data source teaching the VACA model the FULL per-file
> generation step at program scale: given a complete blueprint plan (30+
> files with exports/uses contracts), generate every file in DEPENDENCY-ORDERED
> ROUNDS so the whole program compiles at every intermediate step. This is the
> bridge between the two prior lessons: per-file generation (one file) and the
> chunked-generation rule (why rounds). Here we walk one real 33-file blueprint
> end to end, file by file, round by round.

---

## The problem: you have a plan, now write 33 files

A blueprint plan lists every file with its contract:

```json
{ "path": "internal/service/files_service.go", "language": "go",
  "exports": ["FileService", "NewFileService"],
  "uses": [{"from": "internal/repository", "members": ["FileRepo"]},
           {"from": "internal/models", "members": ["File"]}] }
```

Writing files in the wrong order produces compile errors you then have to fix.
Writing them in **dependency order** — imports first, importers second — means
the accumulated set compiles after every round. The rule of thumb from the
blueprint catalog: **3–6 files per round, models → repositories → services →
handlers → router → main → build files.**

This lesson walks the real `filebox-go` blueprint (a 33-file file-sharing
service) round by round. Each round shows which files are written, WHY they
can be written now (all their `uses` targets already exist), and a
representative file with real code.

---

## The plan at a glance (filebox-go, 33 files)

Five features, each a vertical slice of 5 files (models, repo, service,
handlers, test): `users`, `files`, `folders`, `shares`, `activity`. Plus
shared layers: `config`, `middleware`, `health`, `router`, `main`, and build
files.

| Layer | Files | imports from |
|-------|-------|--------------|
| models | users, files, folders, shares, activity | nothing |
| config | config | nothing |
| repositories | *_repo (5, one per feature) | models |
| services | *_service (5) | repositories + models |
| service tests | *_service_test (5) | their service |
| handlers | *_handlers (5) | services |
| middleware | auth (AuthMiddleware, LoggingMiddleware, RecoverMiddleware) | nothing |
| health | health_handlers | nothing |
| router | router | handlers + middleware |
| entry | main (cmd/server) | config + router |
| build | go.mod, README.md, .env.example | nothing |

Dependency direction is strict and one-way:
**main → router → handlers → services → repositories → models**, with config
and middleware imported by the router and models importing nothing.

---

## Round 1 — models (5 files)

Why now: models are the leaf layer — `uses` is empty for every model, so they
have no dependencies to wait for. Everything else depends on them, so they
come first.

Files: `internal/models/users.go`, `files.go`, `folders.go`, `shares.go`,
`activity.go`.

`internal/models/files.go` (exports `File`):

```go
package files

type File struct {
	ID       string
	OwnerID  string
	Name     string
	Size     int64
	FolderID string
	UploadedAt string
}
```

Contract check: exports exactly `File`; no imports; a model defines data only.

---

## Round 2 — config + repositories (6 files)

Why now: `internal/config/config.go` has no dependencies (exports `Load`,
`Config`) and the router needs it later, so write it early. The five
repositories only depend on models (round 1 done) — nothing they import is
unwritten.

Files: `internal/config/config.go`, `internal/repository/users_repo.go`,
`files_repo.go`, `folders_repo.go`, `shares_repo.go`, `activity_repo.go`.

`internal/repository/files_repo.go` (exports `FileRepo`, `NewFileRepo`; uses
`internal/models` → `File`):

```go
package files_repo

type FileRepo struct {
	store map[string]*File
}

func NewFileRepo() *FileRepo {
	return &FileRepo{store: make(map[string]*File)}
}

func (r *FileRepo) Save(f *File) error {
	r.store[f.ID] = f
	return nil
}

func (r *FileRepo) ByID(id string) (*File, error) {
	if f, ok := r.store[id]; ok {
		return f, nil
	}
	return nil, errNotFound
}

type notFoundError struct{}

func (e *notFoundError) Error() string { return "file not found" }

var errNotFound = &notFoundError{} // private: not in the plan's exports
```

Contract check: only `FileRepo`/`NewFileRepo` exported; imports reference only
the `uses` members; the file does persistence and nothing else.

---

## Round 3 — services (5 files)

Why now: services depend on repositories + models, both of which exist after
rounds 1–2. They never depend on handlers or each other's internals, so all
five can be written together.

Files: `internal/service/users_service.go`, `files_service.go`,
`folders_service.go`, `shares_service.go`, `activity_service.go`.

`internal/service/files_service.go` (exports `FileService`,
`NewFileService`; uses `internal/repository` → `FileRepo`; `internal/models`
→ `File`):

```go
package files_service

type FileService struct {
	files *FileRepo
}

func NewFileService(files *FileRepo) *FileService {
	return &FileService{files: files}
}

func (s *FileService) Upload(f *File) error {
	if f.Size < 0 {
		return &negativeSizeError{}
	}
	return s.files.Save(f)
}

type negativeSizeError struct{}

func (e *negativeSizeError) Error() string { return "file size cannot be negative" }
```

Contract check: exports exactly the service + constructor (the error type is
private, lowercase); uses only repositories and models — never handlers.
Business rules live here, storage never.

---

## Round 4 — service tests + health (6 files)

Why now: each service test depends only on the service it tests (round 3
done), so they belong right after their layer. `health_handlers.go` has no
dependencies (exports `HealthHandlers`) and gives the router something to wire
up alongside the feature handlers.

Files: `internal/service/users_service_test.go`, `files_service_test.go`,
`folders_service_test.go`, `shares_service_test.go`,
`activity_service_test.go`, `internal/handlers/health_handlers.go`
(all full paths, like every other round).

```go
package files_service

func TestUploadRejectsNegativeSize(t *testing.T) {
	svc := NewFileService(NewFileRepo())
	err := svc.Upload(&File{Size: -1})
	if err == nil {
		t.Fatal("expected error for negative size")
	}
}
```

Contract check: tests import their service and exercise the error paths — no
handlers, no database. (`NewFileRepo` and `File` resolve from the build-added
imports per the uses contract.)

---

## Round 5 — feature handlers + middleware (6 files)

Why now: handlers depend on services (round 3 done) and models (round 1).
Middleware has no dependencies but is consumed by the router, so it lands here
with the handlers — before the router round.

Files: `internal/handlers/users_handlers.go`, `files_handlers.go`,
`folders_handlers.go`, `shares_handlers.go`, `activity_handlers.go`, and
`internal/middleware/auth.go`.

`internal/handlers/files_handlers.go` (exports `FileHandlers`; uses
`internal/service` → `FileService`):

```go
package files_handlers

type FileHandlers struct {
	svc *FileService
}

func (h *FileHandlers) Upload(w http.ResponseWriter, r *http.Request) {
	// thin: decode → call service → encode. No business rules here.
}
```

`internal/middleware/auth.go` (exports `AuthMiddleware`, `LoggingMiddleware`,
`RecoverMiddleware`):

```go
package middleware

func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// verify token, then next.ServeHTTP(w, r)
	})
}
```

Contract check: handlers import ONLY services — never repositories directly
(repository access belongs to services). Middleware exports exactly its three
functions. Exports match the plan; nothing else is public.

---

## Round 6 — router + entry + build files (5 files)

Why now: the router wires every handler and the middleware, so it must wait
until all handlers (round 5) exist. `cmd/server/main.go` imports config +
router, both of which exist. Build files (go.mod, README.md, .env.example)
have no dependencies and land last.

Files: `internal/handlers/router.go`, `cmd/server/main.go`, `go.mod`,
`README.md`, `.env.example`.

`internal/handlers/router.go` (exports `NewRouter`; uses `internal/handlers` →
`UserHandlers`, `FileHandlers`, `FolderHandlers`, `ShareHandlers`,
`ActivityLogHandlers`; `internal/middleware` → `AuthMiddleware`,
`LoggingMiddleware`, `RecoverMiddleware`):

```go
package handlers

func NewRouter(users *UserHandlers, files *FileHandlers,
	folders *FolderHandlers, shares *ShareHandlers,
	activity *ActivityLogHandlers) http.Handler {
	mux := http.NewServeMux()
	// mux.HandleFunc(...) per handler, wrapped in middleware
	return mux
}
```

`cmd/server/main.go` (exports `main`; uses `internal/config` → `Load`,
`Config`; `internal/handlers` → `NewRouter`):

```go
package main

func main() {
	cfg := config.Load()
	// build handlers, router := handlers.NewRouter(...), then http.ListenAndServe
}
```

Contract check: this is the ONLY file that may be `package main`. Thin wiring
only — all logic lives in services.

---

## Why rounds work: the accumulated set compiles at every step

After round 1, models compile alone. After round 2, config + repositories
compile (their only imports are models). After round 3, services compile. And
so on. The invariant:

> **A file is written only when every module in its `uses` list already has a
> written file.** That single rule guarantees no dangling imports, no forward
> references, and no import cycles — the top-3 compile failures in large
> builds.

## Generating 3–6 files per round

Never dump 33 files in one pass — output limits truncate and the error surface
explodes. Instead:

1. Pick the next 3–6 files whose `uses` targets all exist.
2. Write them, honoring each file's exports/uses contract (see the per-file
   generation lesson).
3. Compile-check the accumulated set; feed errors back as a repair round that
   ONLY touches its own files — never re-emit earlier files, never reference a
   file not yet written.
4. Repeat. A 33-file program is written in 6 rounds like this one.

## Anti-patterns in round-based generation

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Writing handlers before services | Handlers reference unwritten services | Respect dependency order: models → repos → services → handlers → router |
| Writing all 33 files at once | Truncated output, 20+ errors at once | 3–6 files per round, compile-check each round |
| Re-emitting an earlier file in a repair round | Duplicate/mismatched definitions | Repair rounds only touch THEIR files |
| A file importing a sibling that comes later in the round order | Dangling import in the accumulated set | Reorder the round: write the imported file first |
| Putting business rules in a handler | Bloated handler, broken layering | Move logic to the service; keep handlers thin |

---

## The full round schedule for filebox-go (33 files)

| Round | Files written | New dependency frontier |
|-------|---------------|-------------------------|
| 1 | models/users, files, folders, shares, activity (5) | models complete |
| 2 | config/config.go + repository/*_repo.go (6) | config + repositories complete |
| 3 | service/*_service.go (5) | services complete |
| 4 | service/*_service_test.go (5) + handlers/health_handlers.go (6) | services tested, health handler ready |
| 5 | handlers/*_handlers.go (5) + middleware/auth.go (6) | feature handlers + middleware complete |
| 6 | handlers/router.go, cmd/server/main.go, go.mod, README.md, .env.example (5) | entire program complete |

Six rounds, each 4–6 files, each compilable. Applied to any blueprint (social
29 files, banking 26, gaming 29, …), this is how a large generated program
compiles the first time.
