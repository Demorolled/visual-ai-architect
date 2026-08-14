# Code Lessons — Go Curriculum
> Generated: 2026-08-04
> Purpose: Deep per-language curriculum for teaching VACA to generate
> idiomatic, robust, compile-safe Go. Complements `data/code-lessons.md`
> (language-neutral rules) and `data/code-lessons/typescript.md`, `python.md`,
> `csharp.md`. Injected into Go code generation via the knowledge store.

---

## 1. Per-file architecture rules (compile-safe Go in VACA)

Every Go file is generated as its own package in its own directory:

- Package name comes from the sanitized node label (`order_handler` → package
  `orderhandler`; hyphens and spaces removed).
- **NEVER `package main`** for a node file — only the real entry point uses it.
- **NEVER write `import` statements** — the build system adds them
  automatically from the planned dependency graph.
- **NEVER write `func main()`** — only the entry-point node does.
- Start directly with `package <name>`, then types/consts/functions.
- A file that other files import MUST export its members (capitalized names).

## 2. Idioms & style

- Export = capitalized; unexported = lowercase. Only export what other files
  need (3–10 symbols per file).
- Return `(value, error)` for anything that can fail; check the error inline.
- Prefer small interfaces — define the interface where it is USED.
- Use `fmt.Errorf("...: %w", err)` to wrap with context; unwrap with
  `errors.Is` / `errors.As` (Go 1.13+).
- Zero-value structs are valid: `var cfg Config` then fill; never hand-roll
  constructors that duplicate zero values.
- Prefer explicit types over `any` — `any` only for true polymorphism.
- Table-driven style for logic that varies by input set.
- `defer` for resource cleanup (files, locks, HTTP bodies) — close immediately
  after acquiring.
- Never use `panic` for control flow; `recover` only at the top boundary.

## 3. Error handling (the Go way)

- `if err != nil { return ... }` — handle immediately, never stash for later.
- Sentinel errors: `var ErrNotFound = errors.New("user not found")`, compare
  with `errors.Is`. Wrap sentinels with context when crossing layers.
- Don't swallow errors: `if err != nil { return }` with no return value or log
  is a defect — log with context (`log.Printf("load order %d: %v", id, err)`)
  or return the error.
- Map expected failures to typed errors so handlers can translate to HTTP 404
  vs 400 vs 500.
- `errors.As` for typed payloads (e.g. a `ValidationError{Field, Message}`).
- I/O boundaries (HTTP handlers, goroutine entry points) are where you log;
  services return errors, handlers decide status codes.

## 4. Types & data

- Define domain types in `models`-style files; keep them free of logic.
- `struct` tags for JSON (`json:"order_id"`), DB (`db:"col"`), and validation.
- Custom types with methods for invariants:
  ```go
  type Currency string
  func (c Currency) Valid() bool { ... }
  ```
- Use `time.Time` (never strings) for timestamps; `context.Context` first
  parameter for anything cancellable/time-bounded.
- Prefer immutable-by-convention: return copies, don't mutate receivers.

## 5. Concurrency (Go-specific rules)

- Share memory by communicating: channels pass ownership; mutexes guard
  genuinely shared state (caches, counters).
- `sync.WaitGroup` for fan-out; `errgroup.Group` for fail-fast parallel work.
- Bounded queues: `chan Job` with a buffer, or a `chan struct{}` semaphore —
  never an unbounded producer/consumer in a long-lived service.
- Context with timeout everywhere network/DB work happens:
  `context.WithTimeout(ctx, 5*time.Second)`.
- A goroutine reading/writing shared state without `sync.Mutex`/`RWMutex` (or
  `sync.Map`) is a data race — a defect.
- Close channels you own, once; `defer close(ch)` immediately after creation.
- Never `select {}` idle loops without a context exit path (goroutine leak).

## 6. Project layout & naming

- `cmd/<app>/main.go` entry (thin), `internal/<domain>/...` for app code —
  but in VACA's per-file model, each node is its own package dir; keep the
  package name derived from the node label.
- Feature slices: `<feature>_repo.go`, `<feature>_service.go`,
  `<feature>_handler.go` — one responsibility each.
- Name files for what they hold: `user_repo.go`, not `utils.go` with everything.

## 7. Testing

- `package <name>_test` (black-box) or same package for internals.
- `func TestXxx(t *testing.T)`, `t.Run` subtests, table-driven cases.
- Always `t.Helper()` in test helpers; report with `t.Fatalf`/`t.Errorf`.
- Test error paths too — at least one test that the function FAILS cleanly.
- Never `os.Exit` or panic in tests; use `t.Cleanup` for teardown.

## 8. Security specifics

- SQL: always parameterized via `database/sql` placeholders (`?` / `$1`) —
  never `fmt.Sprintf("... WHERE id=%s", id)`.
- HTML: use `html/template` (auto-escaped), never `fmt.Sprintf` into HTML.
- Passwords: `golang.org/x/crypto/bcrypt` (or argon2) — never store plaintext.
- Secrets: `os.Getenv` + fail-fast; never literals in source.
- Paths: `filepath.Join` and reject `..` from user input.
- HTTP: `http.Error` for failures, never write raw user data into responses
  unescaped; set `Content-Type` explicitly.

## 9. Compile gotchas that break per-file builds

- Unused imports and unused variables are COMPILE ERRORS in Go — a file with
  an unused import from the auto-added set fails the whole build. Keep code
  minimal and self-consistent.
- `:=` redeclaration and variable shadowing — prefer distinct names.
- Wrong package name vs directory — the build imports by directory.
- Exporting a symbol two files also export → duplicate symbol errors.
- JSON tags must match the exact field names the handlers/schema expect.

## Anti-patterns (never)

- `package main` in a node file; `func main()` in a library file.
- `panic(err)` for expected failures; empty `if err != nil { return }`.
- `fmt.Sprintf` building SQL or HTML with user data.
- Hardcoded secrets; `interface{}` instead of `any`; 500-line single files.
- Unlocked shared state in goroutines; goroutine leaks without context exit.
