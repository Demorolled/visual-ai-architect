# 🎨 Visual AI Architect — Design Manifesto

> **Edit this file to teach the app YOUR vision. Every architecture plan and code generation will use this as context.**

---

## 1. 🏗️ Architectural Philosophy

**How do you think about software architecture?**

- [x] Prefer **monolithic** applications (simpler deployment, single codebase)
- [ ] Prefer **microservices / modular** architecture (independent deployability)
- [x] Prefer **layered architecture** (UI → Logic → Data)
- [ ] Prefer **event-driven / reactive** architecture
- [ ] Prefer **hexagonal / clean architecture** (ports & adapters)
- [x] **One function per node** — each logical function gets its own dedicated node in the architecture graph
- [ ] **Other:** _________________________________
**Your architectural principles:**

I build practical Linux-native applications. Every app starts with a clear data flow: input comes in, logic processes it, data gets stored, and the UI presents results. Keep it simple — a single deployable binary or a self-contained project. No Kubernetes, no Docker orchestration layers, no over-engineered abstractions. The architecture should be obvious from the file structure. Organize by feature, not by layer.


**Your granular node rule:**

Each discrete function in the app must map to its own node. Don't bundle multiple responsibilities into a single node. For example, "parse user input" and "validate user input" get separate nodes, not a single "process input" node. This keeps the architecture graph directly readable as a function-level data flow diagram.


---

## 2. ✍️ Code Style & Conventions

**What does your ideal code look like?**

- [x] **Mixed** (use what fits the problem)
- [x] **Functional** style (pure functions, immutability, composition) where it makes sense
- [ ] **Object-Oriented** style (classes, inheritance, polymorphism)
- Variables: `camelCase`

- Functions: `verbNoun()` or `doSomething()`

- Classes: `PascalCase`

- Files: `kebab-case`

- [x] Always include **type annotations** (TypeScript/Python types)
- [x] Prefer **explicit** over implicit (no magic)
- [ ] Always include **JSDoc / docstrings**
- [x] Prefer **early returns** over nested if-else
- [x] Maximum **120** characters per line
- [x] Prefer `const` / `let` over `var` always
- [x] Always handle **errors explicitly** (no silent failures)
**Your custom style rules:**

I prefer TypeScript for most projects. Use async/await over raw promises. Business logic goes in service files, never in route handlers or UI components. Every function should be self-contained and testable. Error handling is not optional — every promise needs a `.catch()` or try/catch. Use interfaces/types for data contracts between layers. Prefer `const` assertions and literal types for configuration.


**One file per function, one node per function:**

When compiling a node into code, create a new file for each function that node represents. Each file must include a comment at the top defining the file's purpose — what function it implements and why it exists. This way the code is self-documenting and the file structure stays in sync with the node architecture.


---

## 3. 🛠️ Preferred Technologies

**What's in your toolkit?**

**Languages** (rank by preference):

1. **TypeScript** — my go-to for almost everything
2. **Python** — for data processing, media tasks, scripting
3. **Go** — for performance-critical components
4. **Rust** — when I need maximum performance and safety
- Frontend: **React with TypeScript** (for web UIs), native Linux UI (for desktop apps)

- Backend: **Express.js / Node.js** or **Python FastAPI**

- Mobile: N/A — I build Linux-first

- Testing: **Vitest / Jest** for TypeScript, **pytest** for Python

- Primary: **SQLite** (perfect for Linux desktop apps) or **PostgreSQL**

- Cache: **In-memory** mostly — keep it simple

- Search: **SQLite FTS5** or simple file-based indexing

- Hosting: **Self-hosted on Linux** or local machine

- CI/CD: **GitHub Actions** / direct deployment

- Monitoring: **Systemd journal** + simple logging

**Your technology philosophy:**

I build Linux applications that run on real hardware. TypeScript is my primary language because it crosses boundaries — works for CLI tools, web UIs, and backend services. I use Python when I need rich media libraries or data processing. Go is for performance-sensitive subsystems. SQLite is my default database because it's zero-config and works perfectly for desktop apps. No cloud-dependency, no vendor lock-in, no container orchestration — just build, ship, and run.


---

## 4. ⚖️ Design Principles

**The rules you live by when building software.**

Check all that apply and add your own:

- [x] **YAGNI** — You Ain't Gonna Need It (build only what's needed now)
- [x] **DRY** — Don't Repeat Yourself (extract shared logic)
- [x] **KISS** — Keep It Simple, Stupid (simplicity over cleverness)
- [x] **SOLID** principles (Single responsibility, Open-closed, Liskov, Interface segregation, Dependency inversion)
- [ ] **Composition over inheritance**
- [ ] **Convention over configuration**
- [x] **Fail fast** — validate inputs early, crash on unexpected states
- [x] **Graceful degradation** — handle errors gracefully, never crash the whole app
- [x] **Defensive programming** — validate everything, trust nothing
- [ ] **Testable design** — write code that's easy to test (dependency injection, interfaces)
1. **Data flow is king** — every app has a clear input→process→store→output path. Design the data flow first, build around it.
2. **Self-contained** — prefer local storage and local processing over network dependencies. If it needs a network, make it optional.
3. **Linux-first** — systemd integration, journal logging, proper Linux filesystem hierarchy. If it works on Ubuntu, it's good.
4. **Report, don't just fail** — when something breaks, tell the user what broke and suggest how to fix it. Good error messages are a feature.
5. **Progressive complexity** — start simple, add complexity only when the use case demands it. A calculator doesn't need a database.
6. **Separate by function** — each function gets its own node in the architecture, and each node compiles to its own file with a purpose comment. Don't bundle multiple functions into one node or one file.
---

## 5. 🌟 Quality Standards

**What "good" means to you.**

- [x] Code must **compile/type-check** on first try (no any/ignore)
- [ ] Every function needs a **unit test**
- [ ] **80%+ test coverage** minimum
- [x] No **unused imports**, variables, or dead code
- [x] All **error paths must be handled**
- [x] Logging on every **entry/exit** point
- [x] Security: **input validation**, **SQL injection prevention**, **XSS protection**
- [ ] Performance: **no N+1 queries**, **proper indexing**, **caching strategy**
- [ ] Accessibility: **WCAG AA** minimum
- [x] Documentation: **README**, **API docs**, **architecture decisions**
**Your quality bar:**

The code must compile without errors or warnings. No `any` types — type everything properly. Every external input (user input, file reads, API calls) must be validated. Error messages must be actionable — tell the user what went wrong and what to do about it. Dead code and unused imports get removed. File-based logging for all operations so issues can be diagnosed without a debugger.


---

## 6. 🚫 Anti-Patterns & Pet Peeves

**Things you NEVER want the AI to generate.**

- [x] No `any` types (TypeScript)
- [x] No `var` declarations (JavaScript)
- [x] No global mutable state
- [x] No `try/catch` swallowing errors silently
- [x] No massive functions (>50 lines)
- [x] No deeply nested callbacks or conditionals
- [x] No magic numbers or strings
- [ ] No circular dependencies
- [x] No commented-out code
- [x] No `TODO` or `FIXME` left in production code
**Your specific anti-patterns:**

- No Kubernetes, Docker, or container orchestration in generated architectures

- No cloud-only dependencies — apps should work offline

- No unnecessary abstractions — don't generate factory patterns or dependency injection frameworks for simple apps

- No `console.log` in production code — use proper logging

- Don't generate a web UI for a CLI tool — match the interface to the app type

- No npm packages that add 100MB of dependencies for one function


---

## 7. 📁 Project Structure Preferences

**How you like your projects organized.**

- [x] **Feature-based** (group by feature: `scan/`, `media/`, `system/`)
- [ ] **Type-based** (group by type: `components/`, `services/`, `utils/`)
- [ ] **Layer-based** (group by layer: `frontend/`, `backend/`, `shared/`)
- [ ] **Monorepo** with multiple packages
- [x] **Flat** structure (minimal nesting)
src/

domain/       # Core business logic, types, interfaces

services/     # Service layer — one file per service

infrastructure/  # File system, database, external tool wrappers

interface/    # UI components or CLI handlers

config/       # Configuration, constants, environment

utils/        # Shared utilities — minimal, focused

---

## 8. 📝 How You Want the AI to Communicate

- [x] **Concise** — get straight to the point, minimal commentary
- [x] **Professional** — business-like, precise language
- [x] **Detailed explanations when needed** — explain the *why* when making architectural decisions
- [ ] **Socratic** — ask me questions rather than assuming
- [ ] **Enthusiastic** — celebrate wins, be encouraging
- [ ] **Custom:** _________________________________
---

## 9. 🎯 Your Vision Statement

> *I build practical Linux applications that solve real problems — system tools, media servers, and productivity apps. Help me ship working software quickly. Give me architectures that are simple, data-flow-driven, and take full advantage of the Linux platform. No over-engineering, no cloud dependencies, no unnecessary abstractions. Just solid, working code that I can run on my machine.*
