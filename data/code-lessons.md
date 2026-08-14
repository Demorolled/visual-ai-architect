# Code Lessons — Writing Robust, Production-Grade Code
> Generated: 2026-08-04
> Purpose: Training data source + prompt knowledge for teaching the VACA model to
> generate code that is safe, correct, and maintainable — not just compilable.
> Complements `data/large-program-architecture.md` (structure) with code QUALITY
> (behavior). Converted to training examples by
> `scripts/build-vaca-knowledge-dataset.py` and injected into generation prompts.

---

## Lesson 1 — Validate Input BEFORE You Use It

Every value that enters a program from the outside world is hostile until proven
otherwise: HTTP bodies, query params, file contents, env vars, CLI args, DB rows.

The generated code MUST:
- Check type/shape first (`typeof`, schema validation, struct tags, pydantic).
- Check ranges: non-empty strings, non-negative numbers, lengths, enum values.
- Return a clear error to the caller on failure — never silently coerce, never
  crash, never continue with a bad value.
- Use a dedicated validation layer: in Go, a `Validate()` method or struct tags;
  in TypeScript, a schema guard or explicit checks; in Python, `pydantic` or
  manual checks before the business logic runs.

> Rule of thumb: a function that accepts external input and does NOT begin with a
> validation/guard block is wrong. Handlers validate, services trust.

---

## Lesson 2 — Errors Are Values, Not Crashes

Production code never panics/throws for expected conditions:

- Go: return `error` and handle it. NEVER `panic()` outside of truly unrecoverable
  init. Use `errors.Is/As` for typed errors, wrap with context (`fmt.Errorf("...: %w", err)`).
- TypeScript: prefer returning results or throwing typed errors that the caller
  catches — never unhandled rejects. Validate before risky ops.
- Python: raise specific exceptions (`ValueError`, `KeyError`, custom) and catch
  at the boundary; never bare `except:` that swallows errors silently.

Every file that does I/O (files, network, DB) must have a try/catch or error
return at its boundaries, and a log line with enough context to debug.

> Rule of thumb: if a generated function can fail and it does NOT return an error
> (or throw), the generator has made a mistake.

---

## Lesson 3 — Never Build HTML From Untrusted Strings

XSS is the #1 vulnerability in generated web apps. Rules:

- NEVER `element.innerHTML = userInput` or `document.write(userInput)` or
  `"<div>" + userInput + "</div>"` — this is an XSS hole, period.
- Build the DOM safely: `document.createElement`, `textContent` (never
  `innerHTML`) for user-controlled values.
- In server templates, ALWAYS escape (`html/template` in Go, `escape` in
  Python's web frameworks, React's default escaping).
- Validate/escape on the way OUT: encode output for the context (HTML, URL,
  attribute, JS).
- SQL: never string-concatenate user input into queries — use parameterized
  queries / prepared statements (`?`, `$1`, ORM bound params).

> Rule of thumb: `innerHTML` + user data, or f-string/`+` SQL with user data, is
> an automatic failure in review.

---

## Lesson 4 — Match the Language's Idioms

Generated code reads and behaves like a native file, not translated Java:

- Go: exported = capitalized; `if err != nil` handled inline; goroutines owned by
  one function; channels for communication, mutexes for shared state; small
  interfaces; `context.Context` first param for cancellable ops.
- TypeScript: strict types everywhere — no `any` leakage across files; `as const`
  for literal types; null-safe access (`?.`, `??`) instead of random `||`;
  `readonly` for shared config.
- Python: type hints on public functions; context managers (`with`) for
  resources; dataclasses for data containers; `pathlib` not `os.path` strings.
- C#: PascalCase methods, `IEnumerable`/LINQ over loops where clearer, async/await
  naming convention `*Async`.
- Every function/type gets a name that says what it does; files export 3–10
  symbols with one clear purpose.

> Rule of thumb: if generated Go starts with a `class`, or generated TS uses
> `==` and implicit `any`, the file is wrong for its language.

---

## Lesson 5 — Self-Check: No Stubs, No TODOs, No Placeholders

Generated code is what the app RUNS — never a scaffold for someone to finish:

- NO `return nil`, `return null`, empty catch blocks, `TODO: implement`,
  `NotImplementedError`, `// stub`, `throw new Error("not implemented")`.
- Every function body does real work. If a function genuinely cannot do real
  work, it should not exist in the plan.
- Error paths return real errors with messages, not `panic("TODO")`.
- Constants/config are real values with sensible defaults, not `""`/`0` placeholders.

> Rule of thumb: `stub`, `todo`, `not implemented`, or an empty function body in
> generated output is a defect the repair pass must fix.

---

## Lesson 6 — Security Hardening For Every Generated App

- Secrets: never hardcode API keys/passwords/tokens. Read from env/config with
  a default; fail fast if a required secret is missing.
- Auth: password hashing (bcrypt/argon2), session tokens via secure cookies or
  signed JWTs with expiry; never store plaintext passwords.
- File uploads: whitelist extensions, cap size, randomize stored names, never
  trust client filenames (path traversal).
- Paths: use `path.join`/`filepath.Join`, reject `..` traversal from user input.
- Logs: never log passwords/tokens/credit cards; log user IDs, actions, outcomes.
- Rate-limit and validate anything a stranger can reach over the network.

> Rule of thumb: a generated handler that writes a file, runs a query, or renders
> markup MUST think about who can call it and what a malicious caller could do.

---

## Lesson 7 — Databases: Constraints, Transactions, and No N+1

- Schema: NOT NULL on required columns, CHECK for ranges, UNIQUE for identity,
  indexes on foreign keys and hot query columns, sensible defaults.
- Migrations: additive and versioned; never destructive in the same release.
- Writes: multi-step updates inside transactions (BEGIN/COMMIT/ROLLBACK or the
  language's transaction API) so a failure can't leave half-written state.
- Reads: avoid N+1 — one query with a JOIN or `IN` list instead of a query per
  row; use eager loading in ORMs.
- Every repository function validates its inputs and returns the language's
  idiomatic error on failure.

> Rule of thumb: any loop that runs a query per iteration is a defect.

---

## Lesson 8 — Concurrency Done Safely

- Goroutines: never touch shared state without a mutex or channel; `sync.WaitGroup`
  for fan-out; `errgroup` for fail-fast parallel work; always close/`defer close`
  channels you own.
- Workers: bounded queues (`chan struct{}` semaphores) so load can't exhaust
  memory; context with timeout so work can be cancelled.
- Async TS/JS: `Promise.all` for independent work, `Promise.allSettled` when a
  failure shouldn't kill the batch; never `fire-and-forget` an async function
  without a catch.
- Shared caches/maps: use `sync.Map` or guard with `sync.RWMutex`.

> Rule of thumb: any generated `go func()` that reads a shared variable without a
> lock, or any async call without error handling, is a defect.

---

## Lesson 9 — A Source File Is Pure Code: No Markdown, No Fences, No Prose

Every byte written to a generated source file must be valid code for its
language. The single most common tsc-breaking failure is the LLM's *answer*
leaking into the file:

- NEVER emit ``` fences in a generated file (they break tsc with TS1443/TS1160).
- NEVER append an explanation after the code — no "In this solution...",
  "This code defines...", "Here's what this does...".
- When asked to generate N files, emit exactly N code blocks — never one giant
  blob split by `---` separators (the harness cannot know where one file ends
  and the next begins, and the split pieces are never clean code).
- If an explanation is essential, write it as a comment — but a clean file
  needs no comment over no prose.

> Rule of thumb: a generated file containing a backtick fence, a `---` line, or
> a sentence after the closing brace is a defect — repair it before shipping.

---

## Lesson 10 — Honor the Requested Domain; Ask When Ambiguous

The request "3d chees game. 3d pieces and board. a A.I. opponent, the rules"
means *chess* (pieces, board, an opponent, rules) — "chees" is a typo. Do not
silently reinterpret it as a game about cheese where a character collects items
and flees enemies. Rules:

- Clues like pieces / board / opponent / rules / checkmate / moves = a board
  game. Clues like 3D environment / collect items / chase = an action game.
- When the request is genuinely ambiguous, ASK — never guess and build a
  different genre while keeping the requested name.
- The plan must restate the user's goal in the user's own domain before any
  file is listed. If the plan and the request disagree, the plan is wrong.

> Rule of thumb: if the generated app plays a different game than the one the
> user described, the intent/planning stage failed and no amount of compile
> fixing can save it.

---

## Lesson 11 — The Entry Point Must Run the App

A generated project is dead on arrival if nothing instantiates anything:

- `index.ts`/main/bootstrap must create the objects and start the loop — a
  file that only re-exports classes runs nothing.
- Browser code (`document`, `window`, canvas) only runs in a browser: serve the
  HTML and gate on a real render (open the page, check the canvas), never on a
  bare Node `tsx index.ts` run that imports modules without executing them.
- A failing render gate (e.g. CORS on `file://`) means the app is NOT verified
  — do not declare success while the render gate fails.

> Rule of thumb: the first thing a reviewer does is run the app. If it prints a
> banner and exits, it is not an app.

---

## Lesson 12 — The Plan's File and Export Contracts Are Binding

Every import must resolve to a file the plan actually creates, and every
imported symbol must be exported by that file:

- Never import a file that is not in the plan (e.g. `import '../index/index.ts'`
  when the plan only has `index.html` — instant crash).
- Export exactly the symbols the plan promises for that file (`startGame`,
  `createCanvas`, `render`, ...) and import only those. Never `export { X }
  from 'other-module'` when the other module does not define `X`.
- One class per file with a matching named export; no duplicate identifiers
  (don't re-declare an imported `Input` or `InputManager` locally).
- Only call methods that exist on the object you hold — a chess board has no
  `getPlayerPosition()`/`moveEnemyTo()`; calling them means the wrong model was
  used for the wrong thing.

> Rule of thumb: an import of a non-existent file or a call to a non-existent
> method is a defect the repair pass must catch and fix before success is
> recorded.

---

## Anti-lessons (what the model must NEVER do)

- Validate after using the value (validation must come first).
- `panic`/`throw` as control flow for expected user errors.
- `innerHTML`/`+`-concatenated SQL with user data.
- Empty catch/`if err != nil { return }` that swallows the error.
- Hardcoded secrets, plaintext passwords, unbounded file uploads.
- Stub/placeholder bodies in generated files.
- A query per loop iteration (N+1).
- Unlocked shared state in concurrent code.
- Markdown fences, `---` separators, or explanation prose inside a source file.
- Importing files/symbols the plan does not define, or calling methods that
  don't exist on the object.
- An entry point that never instantiates the app, or declaring success while
  the render gate fails.
- Building a different game genre than the one requested when the request is
  ambiguous — ask instead of guessing.
