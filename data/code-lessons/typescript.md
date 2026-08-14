# Code Lessons — TypeScript Curriculum
> Generated: 2026-08-04
> Purpose: Deep per-language curriculum for teaching VACA to generate
> idiomatic, robust, type-safe TypeScript. Complements `data/code-lessons.md`
> and the sibling per-language docs (`go.md`, `python.md`, `csharp.md`).

---

## 1. Per-file architecture rules (compile-safe TS in VACA)

- Plain `.ts` files (NOT `.tsx`) for most nodes — no JSX syntax.
- **UI files**: export ONE function named `render` (or `init`) that accepts a
  container `HTMLElement` and renders into it. The preview wrapper calls it
  with `'#app-container'`.
- **NEVER write `import`/`export ... from` statements** — the build system adds
  imports from the planned dependency graph. Export declarations
  (`export function`, `export const`, `export interface`) are fine.
- Strict mode is ON: every variable, parameter, and return has a type; no
  implicit `any` leaking across files.
- Node files export 3–10 typed symbols; keep each file focused.

## 2. Idioms & style

- `interface` for object shapes, `type` for unions/aliases.
- Null-safety: `?.`, `??`, and definite checks — never random `||` fallbacks
  that treat `0`/`''` as missing.
- `as const` for literal/option types; `readonly` on shared config arrays.
- Explicit function return types on public API — self-documenting and
  catch-break safe.
- Prefer small pure functions over classes for logic; classes only when state
  + identity matter.
- `unknown` over `any` when validating external data; narrow with guards.
- Use `Number.isFinite`/`Array.isArray`/`typeof` guards before use.

## 3. Error handling

- Throw typed errors (`class ApiError extends Error { status }`) that callers
  can catch discriminately.
- Catch at boundaries: top-level handlers/timers wrap `try/catch` — never an
  unhandled promise rejection.
- Validate before throwing: input guards at the edge return error objects or
  throw typed errors with clear messages.
- `Promise.allSettled` when a partial failure is acceptable; `Promise.all` only
  when all must succeed.
- Never `catch {}` — log or rethrow with context (`catch (err) { console.error('render failed', err); throw err; }`).
- No `// TODO` stubs, `throw new Error('not implemented')`, or `return null`
  placeholder bodies.

## 4. Async discipline

- `async`/`await` with `try/catch` around await points; propagate errors up.
- Independent work in `Promise.all`; batch work in
  `Promise.allSettled` + filter rejected.
- Cancellation: `AbortController` passed to fetches; respect the signal.
- Never fire-and-forget an async function without a `.catch()`.
- Timeouts for external calls (`AbortSignal.timeout(ms)`) so the app can't
  hang forever.

## 5. DOM & UI safety (the #1 TS-specific rule)

- **NEVER `element.innerHTML = userInput`**, `document.write(userInput)`, or
  string-concatenated HTML with user data — XSS hole.
- Build DOM with `document.createElement`, set `.textContent` for user values,
  `.className`, `.appendChild()`.
- Static markup via `innerHTML` is acceptable ONLY when it contains no user
  data; escape anything dynamic.
- Event listeners: remove them when the widget unmounts (cleanup function).
- Don't read `location.hash`/query into `innerHTML`; treat every URL param as
  hostile.

## 6. Testing

- `describe`/`it`/`expect` (vitest style); one test file per module
  (`*.test.ts` beside the code).
- Test happy path AND failure paths (invalid input returns error).
- `vi.fn()` mocks for external calls; fake timers for time logic.
- Assert types matter: use `.toBeTypeOf`, `.toThrow`, `as const` expectations.

## 7. Security specifics

- Validate all external input: runtime guards, not just types (types are
  compile-time only).
- Never `eval`, `new Function`, or dynamic `import(url)` from user input.
- Secrets from `process.env` with defaults; never bundle secrets.
- If rendering server-side or into templates, escape for the context (HTML,
  attribute, URL, JS).
- SQL/params: use bound parameters via the driver/ORM — never template-literal
  SQL with user values.

## 8. Compile gotchas that break per-file builds

- Unused variables/imports fail strict `tsc` — keep files self-consistent.
- JSX in a `.ts` file fails to parse — UI files without JSX use
  `createElement`; JSX requires `.tsx` (only if the pipeline emits it).
- Missing return types on exported functions break `noImplicitAny` style
  configs.
- `export default` on UI files breaks the named `render`/`init` contract.
- Importing a sibling that wasn't planned or doesn't export the symbol → the
  build's auto-import fails to resolve.

## Anti-patterns (never)

- `innerHTML`/`+`-HTML with user input; `document.write`.
- `any` leakage, `!` non-null assertions to silence errors, `==` loose equality.
- Unhandled rejections; fire-and-forget async.
- `export default` in UI render files; JSX inside `.ts`.
- Stubs/TODOs; swallowed catches; hardcoded secrets in source.
