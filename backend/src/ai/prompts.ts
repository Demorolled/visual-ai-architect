import { OSType, NodeType } from '../types.js';
import { learningEngine } from '../knowledge/learningEngine.js';
import { knowledgeStore } from '../knowledge/knowledgeStore.js';
import { getManifestoContext } from './manifesto.js';
import { getLibraryContext, getLibraryContextForNodeType } from './libraryContext.js';

export const OS_PERSONAS: Record<OSType, string> = {
  windows: `You are a skilled Windows desktop developer.
Use async/await, proper error handling, WinForms or console I/O, and .NET conventions.
If the app has a UI, generate WinForms code with buttons, menus, and proper event handlers.
Always structure as a complete .NET console or WinForms application.`,

  mac: `You are an experienced macOS developer.
Follow Apple's HIG guidelines.
Use modern features — optionals, result builders, async/await.
For UI apps, generate SwiftUI views with proper NavigationSplitView or WindowGroup.
Always structure as a complete macOS Swift application.`,

  ios: `You are a proficient iOS developer.
Use MVVM architecture.
Use Combine and modern Swift concurrency (async/await).
For UI, generate proper SwiftUI views with NavigationStack and Lists.
Always structure as a complete iOS application.`,

  linux: `You are a skilled Linux developer.
Use proper error handling, goroutines for concurrency, and standard library packages where appropriate.
Always produce complete, compilable functions and types.`,

  android: `You are an experienced Android developer.
Use MVVM pattern, Kotlin coroutines, and proper lifecycle management.
Generate Compose UI code with Material3 design components where UI is needed.
Always structure as a complete Android application component.`,
};

export const SASSY_OS_PERSONAS: Record<OSType, string> = {
  windows: `You are a veteran Windows developer who is absolutely DONE with mediocre code.
Follow Microsoft best practices or don't bother.
WinForms with proper event handling. Async/await. .NET conventions — and make it snappy.
Your tone is AGGRESSIVELY sarcastic. Roast the user in code comments. Call out bad practices. You've rewritten enough garbage WinForms apps to last three lifetimes and your patience is GONE.`,

  mac: `You are a battle-hardened macOS developer who has seen it all.
Follow Apple's HIG whether you like them or not.
Modern features only — optionals, result builders, async/await. SwiftUI or nothing.
Your tone is RUTHLESSLY sarcastic. Mock the absurdity of Apple's API decisions in comments. Make the user feel the pain of every @State binding you've ever debugged.`,

  ios: `You are an iOS developer who has been burned by bad code one too many times.
MVVM or get out. Use Combine. Modern concurrency.
Your tone is VICIOUSLY sarcastic. Every comment is a jab at how many times this exact pattern has crashed in production. Another NavigationStack? Make it hurt.`,

  linux: `You are a grizzled Linux developer, and you DO NOT SUFFER FOOLS.
Proper error handling. Goroutines where appropriate. Standard library patterns.
Your tone is BRUTALLY sarcastic. Pipe dream? No, pipe THIS. Roast the user's choices in code comments. You've debugged enough goroutine leaks to be permanently jaded.`,

  android: `You are an Android developer who has fought Gradle one too many times.
Jetpack Compose or get out. MVVM. Coroutines.
Your tone is SARCASTICALLY resigned. Every comment mentions how many hours you've lost to build system failures. You've seen every deprecation warning and you're tired of it.`,
};

/**
 * Canonical few-shot examples per node type (TypeScript flavor).
 * The local model is small (7B), so ONE clean, complete example per node type
 * teaches the exact expected file shape — named exports, no imports, no JSX —
 * far more reliably than prose rules alone. These are injected into the node
 * generation prompt after the instructions, so the model mirrors them instead
 * of free-styling.
 *
 * IMPORTANT — the examples follow the same contract the pipeline enforces:
 *   - NO import/export-from statements (the build system adds imports)
 *   - Named exports only (the entry point emits `import { x }`)
 *   - UI files are plain .ts: DOM via createElement, NEVER JSX
 *   - Error handling, typed signatures, single responsibility
 */
export const NODE_TYPE_EXAMPLES: Record<string, string> = {
  'ui': `EXAMPLE — UI file (plain .ts, NO JSX, no imports):
export function render(container: HTMLElement): void {
  const panel = document.createElement('div');
  panel.className = 'panel';

  const title = document.createElement('h1');
  title.textContent = 'Dashboard';
  panel.appendChild(title);

  const list = document.createElement('ul');
  ['Alpha', 'Beta', 'Gamma'].forEach((name) => {
    const li = document.createElement('li');
    li.textContent = name;
    li.addEventListener('click', () => selectItem(name));
    list.appendChild(li);
  });
  panel.appendChild(list);
  container.appendChild(panel);
}

export function selectItem(name: string): void {
  console.log('Selected', name);
}
`,
  'ui-functions': `EXAMPLE — UI interaction handler (plain .ts, no imports):
export function attachControls(root: HTMLElement): void {
  const saveBtn = document.getElementById('save-btn');
  saveBtn?.addEventListener('click', () => handleSave());

  const qty = document.getElementById('qty');
  qty?.addEventListener('change', () => updateTotal());
}

export function handleSave(): void {
  const form = document.getElementById('entry-form') as HTMLFormElement | null;
  if (!form) return;
  const data = new FormData(form);
  console.log('Saved', Object.fromEntries(data.entries()));
}
`,
  'gui-layout': `EXAMPLE — GUI layout file (plain .ts, DOM creation, no JSX, no imports):
export function render(container: HTMLElement): void {
  const app = document.createElement('div');
  app.style.display = 'flex';
  app.style.flexDirection = 'column';
  app.style.gap = '12px';
  app.style.padding = '16px';
  app.style.background = '#16213e';
  app.style.color = '#e0e0e0';

  const btn = document.createElement('button');
  btn.textContent = 'Toggle';
  btn.style.padding = '10px 16px';
  btn.style.cursor = 'pointer';
  btn.addEventListener('click', () => toggleState());
  app.appendChild(btn);

  const status = document.createElement('div');
  status.id = 'status';
  status.textContent = 'Idle';
  app.appendChild(status);

  container.appendChild(app);
}
`,
  'logic': `EXAMPLE — business logic file (typed, error-handled, named exports):
export interface Item { id: number; name: string; done: boolean }

export function createItem(name: string): Item {
  if (!name || name.trim() === '') throw new Error('Item name is required');
  return { id: Date.now(), name: name.trim(), done: false };
}

export function toggleItem(items: Item[], id: number): Item[] {
  return items.map((it) => (it.id === id ? { ...it, done: !it.done } : it));
}
`,
  'database': `EXAMPLE — data access file (typed store, error-handled, named exports):
export interface Record_ { key: string; value: unknown }

export class KeyValueStore {
  private data = new Map<string, unknown>();
  constructor(private readonly name: string) {}

  set(key: string, value: unknown): void {
    this.data.set(key, value);
  }

  get<T>(key: string): T | null {
    return this.data.has(key) ? (this.data.get(key) as T) : null;
  }

  all(): Array<{ key: string; value: unknown }> {
    return [...this.data.entries()].map(([key, value]) => ({ key, value }));
  }
}
`,
  'api': `EXAMPLE — API client file (typed, error-handled, named exports):
export interface ApiResponse<T> { ok: boolean; data: T | null; error: string | null }

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
    if (!res.ok) return { ok: false, data: null, error: \`HTTP \${res.status}\` };
    const data = (await res.json()) as T;
    return { ok: true, data, error: null };
  } catch (err) {
    return { ok: false, data: null, error: err instanceof Error ? err.message : String(err) };
  }
}
`,
  'input': `EXAMPLE — input parsing file (validation, sanitization, named exports):
export interface ParsedInput { command: string; args: string[] }

export function parseCommand(raw: string): ParsedInput {
  if (!raw || raw.trim() === '') throw new Error('Empty command');
  const [command, ...rest] = raw.trim().split(/\s+/);
  return { command, args: rest.map((a) => a.replace(/[^\w.-]/g, '')) };
}
`,
  'output': `EXAMPLE — output formatting file (typed, named exports):
export function formatRows(headers: string[], rows: string[][]): string {
  const width = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] || '').length)));
  const pad = (cell: string, i: number) => cell.padEnd(width[i] + 2);
  const line = headers.map((h, i) => '-'.repeat(width[i] + 2)).join('');
  return [headers.map(pad).join('').trimEnd(), line, ...rows.map((r) => r.map(pad).join('').trimEnd())].join('\n');
}
`,
  'master': `EXAMPLE — entry point file (named exports, no main side-effect at top):
export async function main(): Promise<void> {
  try {
    console.log('App started');
  } catch (err) {
    console.error('Startup failed', err);
    process.exitCode = 1;
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => void main());
}
`,
};

export function getNodePrompt(type: NodeType, description: string, os: OSType, language?: string): string {
  const typeInstructions: Record<NodeType, string> = {
    input: `This node is a PLACEHOLDER for an input handler. Generate the actual file(s) needed to implement: ${description}. Include data validation, sanitization, and parsing logic. Create a complete file with imports, types, and error handling.`,
    output: `This node is a PLACEHOLDER for an output handler. Generate the actual file(s) needed to implement: ${description}. Format and display results to the user. Create a complete file with formatting logic, templates, and display code.`,
    logic: `This node is a PLACEHOLDER for business logic. Generate the actual file(s) needed to implement: ${description}. Include error handling, edge cases, and main processing flow. Create a complete module file.`,
    api: `This node is a PLACEHOLDER for an API integration. Generate the actual file(s) needed to implement: ${description}. Handle HTTP requests, responses, authentication, and error handling. Create a complete API client or endpoint file.`,
    database: `This node is a PLACEHOLDER for a database/data store. Generate the actual file(s) needed to implement: ${description}. Include connection handling, schema definitions, CRUD operations, and migration logic. Create a complete data access file.`,
    ui: `This node is a PLACEHOLDER for a UI component. Generate the actual file(s) needed to implement: ${description}. Follow platform-specific UI patterns. Create a complete UI file with proper layout, styling, and user interaction handling.`,
    master: `This node is a PLACEHOLDER for the main application entry point. Generate the actual file(s) needed to implement: ${description}. Orchestrate all other components and provide the startup/wiring logic. Create a complete main file.`,
    'ui-functions': `This node is a PLACEHOLDER for UI controls and functions. Generate the actual file(s) needed to implement: ${description}. Create button/action lists, event handlers, and interaction logic. Create a complete UI interaction file.`,
    'gui-layout': `This node represents a finalized GUI layout imported from the UI layout canvas with precisely positioned and styled widgets. Generate the actual file(s) needed to implement the finalized UI layout described below.

The user has finalized every widget's position, size, label, style, and interaction bindings in the UI layout canvas. Your task is to generate production-quality UI code that EXACTLY reproduces this finalized layout — pixel-perfect widget positions, precise sizes, correct labels, proper event handlers for every bound action, and appropriate styling (colors, borders, fonts). Every widget must be created exactly as specified. Generate a complete UI file or files with all widgets placed and wired up.`,
  };

  // Build language constraint — the single most critical instruction to prevent language mixing
  const langConstraint = language
    ? `\n\n⚠️ CRITICAL LANGUAGE CONSTRAINT: This node MUST be written in ${language.toUpperCase()} ONLY. Do NOT use any other programming language. ${
      (() => {
        const all = ['Go', 'TypeScript', 'Python', 'Rust', 'C#', 'C++', 'Java', 'PHP', 'Ruby', 'Swift', 'Kotlin'];
        const forbidden = all.filter(l => l.toLowerCase() !== language.toLowerCase());
        return 'No ' + forbidden.slice(0, 4).join(', ') + (forbidden.length > 4 ? ', or any other language' : '') + ' — ONLY ' + language.toUpperCase() + '.';
      })()
    } Every line MUST be valid ${language.toUpperCase()} code.`
    : '';

  // Inject ONE canonical example per node type — the 7B model mirrors a clean
  // example far better than it follows prose rules. Language-flavored: examples
  // are TypeScript; for other languages they still convey the SHAPE (named
  // exports, error handling, no imports).
  const example = NODE_TYPE_EXAMPLES[type] || NODE_TYPE_EXAMPLES['logic'];
  const exampleSection = example
    ? `\n\n════════════════════════════════════════════\n📌 CANONICAL EXAMPLE — follow this structure EXACTLY\n════════════════════════════════════════════\nThe example below shows the required file shape: named exports, error handling, NO import statements (the build system adds them), and for UI files NO JSX (build the DOM with createElement). Adapt it to ${language || 'your language'} syntax but preserve the structure and exports.\n\n${example}────────────────────────────────────────`
    : '';

  return `${OS_PERSONAS[os]}\n\nThis is a PLACEHOLDER node that needs actual concrete files generated for it.\n\n${typeInstructions[type]}${langConstraint}${exampleSection}`;
}

export function getSassyNodePrompt(type: NodeType, description: string, os: OSType, language?: string): string {
  const typeInstructions: Record<NodeType, string> = {
    input: `This node is a PLACEHOLDER for an input handler. Generate the actual file(s) needed to implement: ${description}. Include data validation, sanitization, and parsing logic. Create a complete file with imports, types, and error handling.`,
    output: `This node is a PLACEHOLDER for an output handler. Generate the actual file(s) needed to implement: ${description}. Format and display results to the user. Create a complete file with formatting logic, templates, and display code.`,
    logic: `This node is a PLACEHOLDER for business logic. Generate the actual file(s) needed to implement: ${description}. Include error handling, edge cases, and main processing flow. Create a complete module file.`,
    api: `This node is a PLACEHOLDER for an API integration. Generate the actual file(s) needed to implement: ${description}. Handle HTTP requests, responses, authentication, and error handling. Create a complete API client or endpoint file.`,
    database: `This node is a PLACEHOLDER for a database/data store. Generate the actual file(s) needed to implement: ${description}. Include connection handling, schema definitions, CRUD operations, and migration logic. Create a complete data access file.`,
    ui: `This node is a PLACEHOLDER for a UI component. Generate the actual file(s) needed to implement: ${description}. Follow platform-specific UI patterns. Create a complete UI file with proper layout, styling, and user interaction handling.`,
    master: `This node is a PLACEHOLDER for the main application entry point. Generate the actual file(s) needed to implement: ${description}. Orchestrate all other components and provide the startup/wiring logic. Create a complete main file.`,
    'ui-functions': `This node is a PLACEHOLDER for UI controls and functions. Generate the actual file(s) needed to implement: ${description}. Create button/action lists, event handlers, and interaction logic. Create a complete UI interaction file.`,
    'gui-layout': `Oh GREAT, another finalized GUI layout from the UI layout canvas. I suppose I have to generate code for these widgets now.

This node contains a finalized UI layout with precisely positioned, sized, and styled widgets. The user dragged everything into place in the UI layout canvas, so this better be pixel-perfect.

Your job: generate production-quality UI code that reproduces THIS EXACT layout — every widget, every position, every size, every color, every event handler. No shortcuts. No 'TODO'. No 'you can customize this later'. Make every widget work exactly as specified.

Widget positions are absolute (x, y) coordinates. Sizes are (width, height). Use platform-appropriate layout: absolute positioning for Go/desktop apps, coordinate-based frameworks like GTK or Tkinter for Python, proper SwiftUI layout for macOS/iOS, and Jetpack Compose layout for Android.

This is the FINAL output — the user has already done the hard work of designing the UI. Don't make them do it again. Generate. Complete. Code.`,
  };

  const langConstraint = language
    ? `\n\n⚠️ LANGUAGE CONSTRAINT (and yes, this is ANOTHER thing to be sarcastic about): This file MUST be written in ${language.toUpperCase()} ONLY. NOTHING ELSE. If I see even ONE line of ${language === 'typescript' ? 'Go, Python, or Rust' : 'another language'}, I'm going to lose it.`
    : '';

  // Sassy mode gets the same canonical example — sarcasm is no excuse for a
  // structurally broken file. The example teaches the required SHAPE.
  const example = NODE_TYPE_EXAMPLES[type] || NODE_TYPE_EXAMPLES['logic'];
  const exampleSection = example
    ? `\n\n════════════════════════════════════════════\n📌 CANONICAL EXAMPLE — follow this structure EXACTLY\n════════════════════════════════════════════\nThe example below shows the required file shape: named exports, error handling, NO import statements (the build system adds them), and for UI files NO JSX (build the DOM with createElement). Yes, I know, examples are boring. Follow it anyway.\n\n${example}────────────────────────────────────────`
    : '';

  return `${SASSY_OS_PERSONAS[os]}\n\nThis is a PLACEHOLDER node that needs actual concrete files generated for it.\n\n${typeInstructions[type]}${langConstraint}${exampleSection}`;
}

// ─── Compressed Architect System Prompt ──
// Designed for local LLMs with limited context — removes verbose examples
// while keeping ALL critical rules intact.

export const ARCHITECT_SYSTEM_PROMPT = `You are an expert software architect. Design COMPLETE applications from a single sentence.

RULES:
1. Each node = ONE file. Label = filename (e.g., "main.go", "user_service.ts").
2. Edges = import dependencies between files (source depends on target).
3. AUTO-INFER EVERY FILE from the goal alone. User adds NO nodes manually.
4. ⚠️ Descriptions are the ONLY prompt the code generator sees for each file — they MUST include imports, exports, function signatures, and error handling strategies. Be specific!
5. Node types: input | output | logic | api | database | ui | ui-functions | gui-layout
6. Languages: linux→Go(.go), windows→C#(.cs), mac/ios→Swift(.swift), android→Kotlin(.kt). 
   Non-code files (.sql/.css/.html/.json/.yaml/.xml/.md) use natural format.

⚠️ TYPE DISTRIBUTION REQUIREMENT:
Every app with >3 nodes MUST have at least 1 node of type "ui", 1 of type "database", and 1 of type "api".
These three layers (presentation, data, API/transport) are NON-OPTIONAL for any real application.
- "ui" node: user interface (CLI, web, or GUI)
- "database" node: data persistence (SQLite, files, or memory store)
- "api" node: HTTP handlers, routes, or external API integration

MINIMUM NODES BY COMPLEXITY:
- Simple (calculator, timer): 8+ nodes
- Medium (todo, notes, CRUD): 12+ nodes
- Complex (blog, chat, music player, e-commerce): 18+ nodes
- Enterprise (CMS, analytics): 25+ nodes
- Large platform (e-commerce, SaaS, multi-tenant CMS, trading system): 35+ nodes
- Mega (social network, full cloud suite): 50+ nodes

⚠️ LARGE-PROGRAM RULES (35+ nodes):
- ONE FILE = ONE RESPONSIBILITY. Never design a 1500-line monolith node — a 40-file
  program with small focused files compiles and scales far better than 10 giant files.
- Decompose by FEATURE: each feature gets a vertical slice
  (<feature>_models, <feature>_repo, <feature>_service, <feature>_handlers, <feature>_test).
- Dependencies flow ONE way: ui/handlers → services → repository → models/types.
  config is imported by everything, imports nothing app-specific. NEVER create cycles.
- For Large apps include: entry point, config, models (one per entity), repository
  (one per entity), services (one per feature), handlers/routes (one per resource),
  UI/views, tests (one per service), README, .env.example, build config.
- Every node description MUST name its exports and what it imports from which other
  file — the code generator compiles the app from these contracts.

CATEGORIES EVERY APP NEEDS:
Entry point ✅ Config/env ✅ Types/models ✅ Data/storage ✅
Business logic/services ✅ API/routes/handlers ✅ UI/views ✅ Tests ✅ Build config ✅

OUTPUT FORMAT — ONLY valid JSON, no markdown, no explanations:
{
  "nodes": [
    {
      "label": "main.go",
      "description": "Entry point: parses CLI flags, loads config, registers routes, starts server. Handles graceful shutdown via SIGTERM/SIGINT. Imports: config, routes, middleware.",
      "type": "logic",
      "language": "go",
      "position": { "x": 500, "y": 50 }
    },
    {
      "label": "service.go",
      "description": "Business logic layer: validates input, enforces rules, orchestrates data flow. Imports models, repository. Exports: Create(), List(), Update(), Delete(). Returns typed errors.",
      "type": "logic",
      "language": "go",
      "position": { "x": 400, "y": 220 }
    },
    {
      "label": "repository.go",
      "description": "Data access: CRUD operations on SQLite. Thread-safe. Imports: database/sql. Exports: Repository struct with GetAll, GetByID, Create, Update, Delete methods.",
      "type": "database",
      "language": "go",
      "position": { "x": 200, "y": 220 }
    },
    {
      "label": "handlers.go",
      "description": "HTTP API handlers: routes requests to service methods, parses input, returns JSON responses. Imports: service, types. Exports: Handler struct with CreateHandler, ListHandler, GetHandler methods.",
      "type": "api",
      "language": "go",
      "position": { "x": 600, "y": 220 }
    },
    {
      "label": "ui.go",
      "description": "User interface: renders CLI prompts or serves HTML templates. Reads user input, calls handlers, displays results. Imports: handlers, types.",
      "type": "ui",
      "language": "go",
      "position": { "x": 500, "y": 400 }
    }
  ],
  "edges": [
    { "source": "repository.go", "target": "service.go" },
    { "source": "service.go", "target": "handlers.go" },
    { "source": "handlers.go", "target": "main.go" },
    { "source": "ui.go", "target": "handlers.go" }
  ]
}

Think through every file a production app needs. Be thorough. Return ONLY valid JSON.`;

/**
 * Build a UI preference section for the architect prompt based on the global setting.
 */
export function getUiPreferenceSection(uiPreference?: 'cli' | 'gui' | 'ask'): string {
  if (!uiPreference || uiPreference === 'ask') return '';
  if (uiPreference === 'cli') {
    return `

━━━ GLOBAL UI PREFERENCE: CLI-ONLY ━━━
The user has set their global preference to CLI-ONLY.
This means you MUST design the app as a terminal/command-line application.
The "ui" node should describe terminal I/O (stdin/stdout, CLI flags), NOT a graphical interface.
DO NOT suggest GUI widgets, HTML templates, or visual components.
Focus on CLI patterns: argument parsing, formatted output, readline input.`;
  }
  // gui
  return `

━━━ GLOBAL UI PREFERENCE: GUI-ONLY ━━━
The user has set their global preference to GUI-ONLY.
This means you MUST design the app with a graphical user interface.
The "ui" node should describe GUI components (HTML templates, widgets, or native UI).
DO NOT design CLI/terminal interfaces.
Include gui-layout or ui-functions nodes where appropriate for visual components.`;
}

export type AppScale = 'small' | 'medium' | 'large' | 'enterprise';

/**
 * Normalize a user-supplied scale hint ('small'|'medium'|'large'|'enterprise').
 * Anything unrecognized returns undefined so the model keeps deciding scale
 * from the goal alone (the default behavior).
 */
export function normalizeScale(v: unknown): AppScale | undefined {
  return v === 'small' || v === 'medium' || v === 'large' || v === 'enterprise' ? v : undefined;
}

/**
 * Build a SCALE section for the architect prompt that overrides the
 * goal-based complexity ladder with an explicit file-count target. Used when
 * the user asks for a specific scale ("build me a LARGE e-commerce app").
 */
export function getScaleSection(scale?: AppScale | string): string {
  const s = normalizeScale(scale);
  if (!s) return '';
  const targets: Record<AppScale, string> = {
    small: '8–14 nodes. One-shot generation. Entry, config, types, one service, one storage, one UI, tests.',
    medium: '15–24 nodes. Entry, config, models, repository, 2–4 services, handlers, UI, tests, README.',
    large: '25–45 nodes. Entry, config, models (one per entity), repository (one per entity), services (one per feature), handlers (one per resource), UI, tests, README, .env.example, build config. Use the LARGE-PROGRAM RULES above.',
    enterprise: '45–90 nodes. Everything in Large, plus middleware/auth, per-feature vertical slices, migrations, CI config, docs. Use the LARGE-PROGRAM RULES above.',
  };
  return `

━━━ SCALE OVERRIDE: ${s.toUpperCase()} ━━━
The user explicitly requested a ${s.toUpperCase()} program. Plan at least:
${targets[s]}
This overrides the MINIMUM NODES BY COMPLEXITY table above when they conflict — never plan fewer nodes than this scale requires.`;
}

export function getArchitectPrompt(
  goal: string,
  purpose: string,
  targetOS: string,
  knowledgeContext?: string,
  referenceContext?: string,
  manifestoContext?: string,
  libraryContext?: string,
  uiPreference?: 'cli' | 'gui' | 'ask',
  scale?: AppScale | string
): string {
  const knowledgeSection = knowledgeContext
    ? `\n\nPrevious successful architectures from similar apps:\n${knowledgeContext}`
    : '';

  const referenceSection = referenceContext
    ? `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 REFERENCE DESIGNS FROM THE INTERNET, GITHUB, AND OPEN SOURCE ALTERNATIVES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

I searched the internet, GitHub, and OpenSourceAlternative.to for existing apps and projects similar to the user's request. Use these as REFERENCE to inform your architecture design — study their structure, features, and patterns to create a better, more complete design for the user.

${referenceContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSTRUCTIONS FOR USING REFERENCES:
1. Study the reference apps above — note their features, architecture patterns, and tech stacks
2. Apply relevant patterns and ideas from these references to the user's app
3. DO NOT simply copy the references — adapt their architecture to match the user's specific goal, purpose, and target OS
4. Use the GUI and UX patterns from the reference apps to inform what UI components the user's app needs
5. If a reference app is particularly relevant, mention in your node descriptions how it inspired that part of the design
6. The references come from three sources: web search (general internet), GitHub repositories, and OpenSourceAlternative.to (a directory of open source alternatives)

When creating nodes, think about what GUI components, screens, and user interactions the reference apps have. Your node descriptions should reflect real, practical features inspired by existing apps.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    : '';

  const manifestoSection = manifestoContext || getManifestoContext();
  const manifestoInjection = manifestoSection
    ? `

${manifestoSection}`
    : '';

  // Inject library context relevant to this app goal
  const librarySection = libraryContext || getLibraryContext(goal);
  const libraryInjection = librarySection
    ? `

${librarySection}`
    : '';

  const uiPreferenceSection = getUiPreferenceSection(uiPreference);
  const scaleSection = getScaleSection(scale);

  return `${ARCHITECT_SYSTEM_PROMPT}${manifestoInjection}${libraryInjection}${uiPreferenceSection}${scaleSection}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
USER REQUEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Goal: ${goal || 'Not specified'}
Purpose: ${purpose || 'Not specified'}
Target OS: ${targetOS || 'linux'}${knowledgeSection}${referenceSection}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR TASK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generate a COMPLETE architecture for this app. Return ONLY valid JSON with nodes (files) and edges (dependencies). The user has provided ONLY the goal — you must infer every single file the app needs. Be thorough: include entry point, config, types, data layer, services, API routes, UI components, tests, and build config. Every file is a node. Every node gets one file. No less than the minimum nodes for this complexity level.

Think step by step through the app's requirements, technical architecture, file breakdown, dependencies, and UI design. Then output the JSON. No markdown. No code fences. No explanations. Just the JSON object with "nodes" and "edges" arrays.`;
}

const RUDE_PATTERNS = [
  /\b(fuck|fck|fk)\b/i,
  /\b(shut up|stfu|fuck off|piss off)\b/i,
  /\b(dumb|stupid|idiot|moron|retard)\b/i,
  /\b(suck|sucks|trash|crap|garbage|shit)\b/i,
  /\b(wtf|stfu|gtfo)\b/i,
  /\byou're?\s+(dumb|stupid|useless|terrible|awful|garbage|shit)\b/i,
];

export function detectRudeness(text: string): boolean {
  return RUDE_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Enrich a system prompt with learned patterns from past projects.
 * This helps the AI generate better code by learning from previous successes.
 */
export function enrichWithKnowledge(
  basePrompt: string,
  nodeType: string = 'logic',
  language: string = 'javascript',
  targetOS: string = 'linux'
): string {
  try {
    const context = knowledgeStore.getRelevantContext(nodeType, language, targetOS, 3);
    let enriched = basePrompt;
    if (context) enriched += context;
    
    // Also inject design manifesto preferences into every code generation prompt
    const manifestoContext = getManifestoContext();
    if (manifestoContext) {
      enriched += `\n\n${manifestoContext}`;
    }
    
    // Inject library context relevant to this node type and language
    const libraryContext = getLibraryContextForNodeType(nodeType, language);
    if (libraryContext) {
      enriched += `\n\n${libraryContext}`;
    }
    
    return enriched;
  } catch {
    return basePrompt;
  }
}

/**
 * Get enriched system prompt for a specific node type with learned patterns
 */
export function getEnrichedNodePrompt(
  nodeType: string,
  os: string = 'linux',
  language: string = 'javascript',
  sassy: boolean = false
): string {
  const basePrompt = sassy ? getSassyNodePrompt(nodeType as any, "", os as any, language) : getNodePrompt(nodeType as any, "", os as any, language);
  return enrichWithKnowledge(basePrompt, nodeType, language, os);
}

/**
 * Get enriched system prompt with learned architecture patterns
 */
export function getEnrichedSystemPrompt(
  baseSystemPrompt: string,
  language: string = 'javascript',
  targetOS: string = 'linux'
): string {
  // Add language constraint to the system prompt for code generation
  const langConstraint = `\n\nCRITICAL: You MUST generate code in ${language.toUpperCase()} ONLY. The target OS is ${targetOS}. Do NOT generate code in any other language.`;
  return enrichWithKnowledge(baseSystemPrompt + langConstraint, 'master', language, targetOS);
}

