# Code Lessons — C# (.NET) Curriculum
> Generated: 2026-08-04
> Purpose: Deep per-language curriculum for teaching VACA to generate
> idiomatic, robust C# for the .NET stack (Windows-native in the OS ladder).
> Complements `data/code-lessons.md` and the sibling per-language docs
> (`go.md`, `typescript.md`, `python.md`).

---

## 1. Per-file architecture rules (compile-safe C# in VACA)

- One `.cs` file per node; filename matches the primary type it contains
  (`OrderService.cs` → `OrderService`).
- File-scoped namespaces (`namespace App.Services;`) — modern, one per file.
- **NEVER generate `Program.cs` / `Main` in a node file** — only the entry
  point wires the app.
- `using` directives: keep them MINIMAL and only for namespaces you are certain
  exist in the project. When unsure whether a `using` will resolve, use a
  fully-qualified name (`App.Domain.Orders.Order`) — a missing `using` is a
  compile error, so never guess imports the project may not have.
- Public types/methods that other files call are `public`; everything else is
  `internal`/`private`.
- One public type per file by default; 3–10 public members per file.

## 2. Idioms & style

- PascalCase for types and methods (`CreateOrderAsync`), camelCase for locals
  and parameters, `_camelCase` for private fields.
- **Nullable reference types ON** (`#nullable enable` / project default):
  `string?` for nullable, and handle null explicitly — never `!` to silence.
- `var` for obvious types; explicit types at API boundaries.
- Expression-bodied members for one-liners (`public int Count => _items.Count;`).
- LINQ (`Where`, `Select`, `FirstOrDefault`) over hand-rolled loops where
  clearer; `ToArray`/`ToList` once, not per iteration.
- `record` for immutable value carriers (DTOs); `readonly record struct` for
  hot paths; classes for mutable domain objects.
- Dependency injection: inject interfaces into constructors; never `new`
  services inside other services.

## 3. Error handling

- Exceptions for exceptional cases: `ArgumentException`/`ArgumentNullException`
  for bad inputs, `InvalidOperationException` for state violations, custom
  `Exception` subclasses for domain errors.
- `TryParse`/`TryXxx` patterns for expected parse failures — no exceptions for
  control flow.
- Catch at boundaries (controllers, hosted services): log with
  `ILogger.LogError` and translate to `BadRequest`/`NotFound`/`Problem`.
- `await` inside `try` — catches async exceptions properly; rethrow with
  `throw;` (never `throw ex;` which resets the stack).
- `using` / `await using` for `IDisposable`/`IAsyncDisposable` resources.
- Never empty `catch {}`; never `throw new NotImplementedException()` stubs.

## 4. Async discipline

- `async Task`/`Task<T>` with the `Async` suffix on methods that await.
- `Task.WhenAll` for independent parallel work; `Task.WhenAny` for timeouts;
  never `.Result`/`.Wait()` on async methods (deadlock risk).
- Thread-safe state: `lock`, `ConcurrentDictionary<TKey,TValue>`,
  `Interlocked`, `Channel<T>` for producer/consumer.
- `CancellationToken` threaded through long operations; respect
  `ThrowIfCancellationRequested()`.
- `ConfigureAwait(false)` in library code (not needed in app handlers).

## 5. Project layout & naming

- Layered .NET solution (matches the large-program curriculum):
  `App.Api` (controllers) → `App.Application` (services/DTOs) →
  `App.Domain` (entities, domain rules) → `App.Infrastructure`
  (EF Core/db, external calls).
- Controllers are THIN: parse/validate input, call a service, map to a DTO,
  return `IActionResult`. No business logic, no direct DbContext.
- One service per feature (`OrderService`, `PaymentService`).
- Namespaces mirror folders (`App.Api.Controllers`, `App.Domain.Entities`).

## 6. Testing

- xUnit: `[Fact]` for unit tests, `[Theory]` + `[InlineData]` for
  parameterized cases; NUnit `[Test]`/`[TestCase]` also acceptable.
- Mock dependencies (`NSubstitute`/`Moq`); one assertion focus per test.
- Test controllers via the service contract; test services with fakes.
- Name tests `MethodName_Scenario_ExpectedResult` (`CreateOrder_InvalidInput_ReturnsBadRequest`).
- `Assert.Throws<T>` for exception paths; verify async with `await`.

## 7. Security specifics

- SQL: parameterized via EF Core / Dapper / `SqlCommand` parameters — never
  string-interpolated SQL with user input.
- Razor/Blazor auto-escape; never `@Html.Raw(userInput)`.
- Secrets: `IConfiguration`/`IOptions<T>` from env — never literals in source.
- Passwords: ASP.NET Identity's password hasher or BCrypt.Net — never
  plaintext.
- Validate model state (`[Required]`, `[StringLength]`, `[Range]`) BEFORE
  calling services; `ModelState.IsValid` gate in controllers.
- Uploads: validate extension/size, randomize names, reject traversal via
  `Path.GetFullPath` containment checks.

## 8. Compile gotchas that break per-file builds

- Missing/extra `using`s — a referenced namespace that isn't imported fails
  compilation; prefer fully-qualified names when unsure.
- `null` warnings with NRTs enabled: assigning `null` to `string` fails
  warnings-as-errors builds; declare `string?`.
- Async void — only for event handlers; use `async Task` everywhere else.
- Two files declaring the same namespace-level type → duplicate definition.
- `record` vs `class` equality surprises in dictionaries — pick deliberately.
- Missing `public` on a type another file imports → inaccessible errors.

## Anti-patterns (never)

- Business logic in controllers; direct DbContext use in controllers.
- `.Result`/`.Wait()` on tasks; `async void` outside handlers.
- String-concatenated SQL; `@Html.Raw` on user data; hardcoded secrets.
- `throw ex;`; empty catches; `NotImplementedException` stubs.
- `Main`/`Program.cs` in node files; non-existent `using`s.
