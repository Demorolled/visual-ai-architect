# Code Lessons — Python Curriculum
> Generated: 2026-08-04
> Purpose: Deep per-language curriculum for teaching VACA to generate
> idiomatic, robust Python. Complements `data/code-lessons.md` and the
> sibling per-language docs (`go.md`, `typescript.md`, `csharp.md`).

---

## 1. Per-file architecture rules (compile-safe Python in VACA)

- Each node file is a Python module inside a package directory named after the
  node label (`order_repo.py` → package `order_repo`).
- The package's `__init__.py` re-exports your definitions via
  `from .<module> import *`.
- **NEVER write `import` / `from ... import` statements** — the build system
  adds them automatically.
- **NEVER `if __name__ == "__main__":`** — only the entry-point file uses it.
- **NEVER top-level module docstrings** — the `__init__.py` handles docs.
- Start directly with function/class/constant definitions. `__all__` is
  optional; if used, list every public symbol.

## 2. Idioms & style

- PEP 8: 4-space indent, snake_case functions/variables, PascalCase classes,
  UPPER_CASE constants.
- Type hints on every public function and method (`def load(user_id: int) -> User | None:`) — the model's contracts rely on them.
- `dataclasses` for data containers (with `frozen=True` for config/values).
- `pathlib.Path` for paths — never string concatenation of paths.
- Context managers (`with open(...)`, `with self.conn:`) for resources —
  always close/commit what you open.
- f-strings for formatting — never `%` or manual `+` for logs/errors.
- Prefer explicit `is None`/`== 0` checks over truthiness where `0`/`''` are
  meaningful values.

## 3. Error handling

- Raise SPECIFIC exceptions: `ValueError` for bad values, `KeyError`/`LookupError`
  for missing data, custom exceptions (`class OrderError(Exception)`) for
  domain failures.
- Catch at the boundary (API routes, entry points) — translate to the right
  HTTP status there, not deep in the logic.
- **Never bare `except:`** (swallows everything incl. KeyboardInterrupt) and
  never `except Exception: pass` — log with `logging.exception` or re-raise.
- `try/except` around I/O and parsing; validate inputs before risky operations.
- Return typed failures (`User | None`) or raise — pick one per function and be
  consistent; document which in the docstring.
- Never `raise NotImplementedError` for real logic; no stub bodies.

## 4. Async discipline

- `async def` + `await` for I/O-bound work; `asyncio.gather` for independent
  tasks (returns results) vs `asyncio.wait` for monitoring.
- Timeouts: `asyncio.wait_for(coro, timeout)` so calls can't hang.
- Never fire-and-forget `asyncio.create_task` without a reference that
  observes exceptions.
- Sync/async split: keep DB/network layers `async` end-to-end; don't mix
  blocking calls into event loops without `asyncio.to_thread`.

## 5. Data & persistence

- `dataclass`/`TypedDict` for row shapes; map DB rows to typed objects.
- Parameterized SQL ALWAYS: `cursor.execute("SELECT ... WHERE id=%s", (id,))` —
  never f-string/`%`/`+` with user values.
- Use `with self.conn:` (implicit transaction commit/rollback) for multi-step
  writes.
- Avoid N+1: fetch with a single `IN (...)` query built from bound parameters.
- Never `eval()` / `exec()` user input; `json.loads` with explicit schema
  validation after parse.

## 6. Testing

- pytest style: `def test_x():` + `assert`, `@pytest.mark.parametrize` for
  cases, fixtures for setup/teardown.
- One test file per module (`tests/test_order_repo.py`).
- Test failure paths (invalid input raises `ValueError`; missing row → None).
- `tmp_path` fixture for files; monkeypatch for env/network.

## 7. Security specifics

- Secrets from `os.environ.get("KEY")` with sensible defaults for
  non-secrets; fail fast when a REQUIRED secret is missing.
- Passwords: `bcrypt`/`argon2`; never store or log plaintext.
- HTML: escape output (framework auto-escaping or `html.escape`); never build
  markup from raw user strings.
- Uploads: whitelist extensions, cap size, randomize names, use
  `Path.resolve()` checks to block `..` traversal.
- Deserialize with validation (`pydantic` if available) — don't trust raw JSON.

## 8. Compile/import gotchas that break per-file builds

- Module name must match the planned path — `from .order_repo import *` in
  `__init__.py` fails if the file is named differently.
- Unused imports are tolerated by Python but clutter the auto-added imports —
  keep files minimal.
- Mutable default arguments (`def f(x=[])`) — a classic bug; use `None` +
  `if x is None: x = []`.
- Shadowing builtins (`list`, `dict`, `id`, `input`) — rename.
- Relative imports inside modules break when the package isn't importable
  standalone — let the build system wire them.
- Circular imports between modules — never import each other both ways.

## Anti-patterns (never)

- f-string/`%`-SQL with user data; `eval`/`exec` on input.
- Bare `except:` / `except: pass`; `raise NotImplementedError` stubs.
- `if __name__ == "__main__":` in non-entry files; top-level docstrings.
- Mutable default args; shadowed builtins; plaintext passwords/hardcoded
  secrets; `os.path` string joins when `pathlib` exists.
