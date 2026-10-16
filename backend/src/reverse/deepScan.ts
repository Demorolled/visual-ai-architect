/**
 * deepScan — REA-backed Deep Scan: dropped artifact in, canvas node tree out.
 *
 * The canvas already knows how to render a `ScanArchitecture` (module nodes
 * carrying their files, per-file nodes, external-connection nodes, edges) —
 * `FileDropHandler.buildGraphFromScan` does exactly that for the LLM scan. So
 * this module does NOT invent a second node-tree format: it produces the SAME
 * shape from REA's measured evidence graph, and the whole existing preview →
 * append/replace flow works unchanged.
 *
 * ── The measured contract (rea-agents 6.5.0, read off real envelopes) ─────────
 *
 * `normalized_result.graph.nodes[]` is NOT a file list. It mixes three different
 * things, and mapping them as one is what makes a scan output nonsense:
 *
 *   1. **File-ish nodes** — a real path lives in `observations[].properties`:
 *      `javascript-asset` (src/App.tsx), `artifact` (build/index.html),
 *      `source-map` (*.js.map), `package` (package.json, + name/version/main),
 *      `unknown` (a parse scope: path + operation + limitation).
 *      `source-module` (a source-map ORIGINAL) instead carries its path in
 *      `identity.original_source` — often `../node_modules/x/index.js`, i.e. a
 *      bundled dependency, and sometimes a bare `TaskInput.tsx`.
 *   2. **Semantic nodes** — `javascript-module` with `module_path` +
 *      `semantic_role` (`export-binding`, `export-return-shapes`, …): facts about
 *      a file that already exists as an asset. Not files themselves.
 *   3. **References** — `javascript-module` with `specifier` instead of
 *      `module_path` (`react`, `./TaskList`), where `resolution_status: external`
 *      means "this is a package" and anything else is an unresolved relative
 *      import. These are where the app's ACTUAL dependencies come from —
 *      measured by REA, not guessed from a `node_modules` string.
 *
 * `normalized_result.graph.edges[]` relations: `contains`/`maps_to`/`loads` are
 * hierarchy (already encoded by `files[]`), `exposes` links a file to its own
 * export node (same file), and **`imports`** is the real module-to-module graph:
 * `src/App.tsx -> ./TaskList` (relative specifier, needs resolution) and
 * `src/App.tsx -> react` (external).
 *
 * Mapping rules, and why:
 *   - **A file is a file; a semantic node is not.** Only the path-bearing kinds
 *     become canvas files, so `react` can never be mistaken for a file named
 *     `react` in the project root.
 *   - **Dependencies come from references**, so an app's real package list shows
 *     up even when the artifact ships no `node_modules` at all.
 *   - **A relative import is only drawn when it resolves to a file we saw.**
 *     An unresolved specifier is counted and reported, never guessed into a
 *     connection.
 *   - **A module is a directory**, matching the rule-based scanner's convention,
 *     so an REA scan and a rule scan of the same tree look alike on the canvas.
 *   - **REA's limitations travel with the result.** `ScanArchitecture.notes`
 *     carries them to the preview, because "every conclusion comes with its
 *     evidence and its limits" is the reason to use REA over an LLM at all.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ReaEnvelope, ReaFailure, ReaRun } from './reaCli.js';
import {
  DEEP_SCAN_FILTER_OUTPUT,
  describeReaFailure,
  isReaInstalled,
  reaInstallHint,
  reaReadiness,
  runRea,
} from './reaCli.js';
import type { ReaCheck } from './reaCli.js';

// ─── The canvas contract (mirrors frontend/src/components/FileDropHandler.tsx) ──

export interface ScanArchitectureNode {
  label: string;
  description: string;
  type: 'input' | 'output' | 'logic' | 'api' | 'database' | 'ui';
  language: string;
  files: string[];
  position: { x: number; y: number };
}

export interface ScanArchitectureEdge {
  source: string;
  target: string;
  description?: string;
}

export interface ScanExternalDep {
  name: string;
  kind: 'package' | 'service' | 'app';
  usedBy: string[];
}

export interface ScanArchitecture {
  projectName: string;
  projectType: string;
  frameworks: string[];
  nodes: ScanArchitectureNode[];
  edges: ScanArchitectureEdge[];
  externalDeps?: ScanExternalDep[];
  apps?: string[];
  /** Evidence provenance + REA's own stated limitations (rendered by the preview). */
  notes?: string[];
}

// ─── Routing: which REA command answers "what is this?" for this target ────────

export interface ReaScanPlan {
  /** REA subcommand, e.g. `analyze`. */
  command: string;
  /** Argument passed to it (always absolute). */
  target: string;
  /** True when the command needs a user-installed analysis engine. */
  needsEngine: boolean;
  /** Why this command was chosen — surfaced in logs and on failure. */
  reason: string;
}

/**
 * Does this directory hold a JavaScript/TypeScript application?
 *
 * Decided from the directory's own files, bounded so a huge drop cannot stall a
 * scan. `package.json` counts as a marker on its own: a Node project with no
 * checked-in source is still a Node project, and REA's `analyze` is the right
 * reader for it.
 */
function looksLikeJavaScriptApplication(root: string, maxEntries = 5000): boolean {
  const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'target', 'vendor']);
  let visited = 0;
  const queue = [root];

  while (queue.length > 0 && visited < maxEntries) {
    const dir = queue.shift()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      visited += 1;
      if (visited > maxEntries) break;
      const name = entry.name;
      if (name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        if (!SKIP.has(name)) queue.push(path.join(dir, name));
        continue;
      }
      if (name === 'package.json') return true;
      if (/\.(js|mjs|cjs|jsx|ts|mts|cts|tsx|vue|svelte)$/i.test(name)) return true;
    }
  }
  return false;
}

/**
 * REA's own words on `inspect-artifact` pointed at a directory: "JavaScript/
 * Electron application directories can be analyzed directly with
 * analyze_javascript_application or `rea analyze <directory>`. For binary
 * analysis, select its executable file." So directories route to `analyze`, and
 * FILES route by extension — falling back to `inspect-artifact`, the universal
 * static probe that needs no engine and reports what it is plus the next probe.
 * That keeps "scan whatever the user drops" working on a machine with no
 * Ghidra/Hopper installed, and a wrong guess is refused by REA with a
 * machine-readable `remediation` rather than a silent empty result.
 */
export function planReaScan(target: string): ReaScanPlan {
  const ext = path.extname(target).toLowerCase();
  const base = path.basename(target).toLowerCase();
  const asar = base.endsWith('.asar');

  let isDir = false;
  try {
    isDir = fs.statSync(target).isDirectory();
  } catch {
    isDir = false;
  }

  if (asar) {
    return { command: 'analyze', target, needsEngine: false, reason: 'asar archive' };
  }

  if (isDir) {
    // `analyze` is a JAVASCRIPT application analyzer: pointed at a Java, Python,
    // Rust or Go source tree it returns a clean envelope with
    // `relevant_files: 0` and one unlabelled `artifact` node — i.e. "analysed,
    // nothing found", which puts nothing on the canvas. REA's answer for a plain
    // source tree is `import-reference-source`, so route there when the drop holds
    // no JavaScript/TypeScript application at all.
    if (!looksLikeJavaScriptApplication(target)) {
      return {
        command: 'import-reference-source',
        target,
        needsEngine: false,
        reason: 'source tree with no JavaScript application',
      };
    }
    return { command: 'analyze', target, needsEngine: false, reason: 'application directory' };
  }

  const routes: Record<string, { command: string; needsEngine: boolean; reason: string }> = {
    '.wasm': { command: 'inspect-wasm-artifact', needsEngine: false, reason: 'WebAssembly module' },
    '.sqlite': { command: 'inspect-sqlite-database', needsEngine: false, reason: 'SQLite database' },
    '.sqlite3': { command: 'inspect-sqlite-database', needsEngine: false, reason: 'SQLite database' },
    '.db': { command: 'inspect-sqlite-database', needsEngine: false, reason: 'SQLite database' },
    '.pcap': { command: 'inspect-pcap-capture', needsEngine: true, reason: 'packet capture (tshark)' },
    '.pcapng': { command: 'inspect-pcap-capture', needsEngine: true, reason: 'packet capture (tshark)' },
    '.har': { command: 'inspect-web-network-capture', needsEngine: false, reason: 'HAR capture' },
    '.saz': { command: 'inspect-web-network-capture', needsEngine: false, reason: 'Fiddler SAZ capture' },
    '.apk': { command: 'inspect-android-package', needsEngine: true, reason: 'Android APK (jadx)' },
    '.aab': { command: 'inspect-android-package', needsEngine: true, reason: 'Android app bundle (jadx)' },
    '.dll': { command: 'inspect-managed-artifact', needsEngine: false, reason: 'managed (PE/CLI) assembly' },
    '.ipa': { command: 'inspect-artifact', needsEngine: false, reason: 'Apple application archive' },
    '.dylib': { command: 'inspect-artifact', needsEngine: false, reason: 'native library' },
    '.so': { command: 'inspect-artifact', needsEngine: false, reason: 'native library' },
    '.exe': { command: 'inspect-artifact', needsEngine: false, reason: 'executable — universal probe first, engines for decompilation' },
    '.bin': { command: 'inspect-artifact', needsEngine: false, reason: 'raw binary' },
    '.rom': { command: 'inspect-artifact', needsEngine: false, reason: 'firmware image' },
  };

  const route = routes[ext];
  if (route) return { command: route.command, target, needsEngine: route.needsEngine, reason: route.reason };
  return {
    command: 'inspect-artifact',
    target,
    needsEngine: false,
    reason: ext ? `universal probe for '${ext}'` : 'universal probe',
  };
}

// ─── Reading REA's graph ──────────────────────────────────────────────────────

function observationsOf(node: any): any[] {
  return Array.isArray(node?.observations) ? node.observations.filter((o: any) => o && typeof o === 'object') : [];
}

function firstObservation(node: any): any {
  return observationsOf(node)[0] ?? {};
}

function propertiesOf(node: any): any {
  const props = firstObservation(node)?.properties;
  return props && typeof props === 'object' ? props : {};
}

/**
 * Confidence ranks, highest first. REA reports `confidence` per observation; a
 * path confirmed from artifact bytes outranks one inferred from a static
 * relationship, so the most trustworthy record wins for a given path.
 */
const CONFIDENCE_RANK: Record<string, number> = { exact: 4, high: 3, medium: 2, low: 1, unknown: 0 };
const AUTHORITY_RANK: Record<string, number> = { 'artifact-bytes': 3, 'ast-static-analysis': 2, 'static-relationship-inference': 1 };

function confidenceOf(node: any): string {
  const c = firstObservation(node)?.evidence?.confidence;
  return typeof c === 'string' ? c : 'unknown';
}

function authorityOf(node: any): string {
  const a = firstObservation(node)?.evidence?.authority;
  return typeof a === 'string' ? a : 'unknown';
}

function rank(node: any): number {
  return (
    (CONFIDENCE_RANK[confidenceOf(node)] ?? -1) * 10 + (AUTHORITY_RANK[authorityOf(node)] ?? 0)
  );
}

/** Which observation property holds a node's on-disk path, by node kind. */
const PATH_PROP_KEYS: Record<string, string[]> = {
  'javascript-asset': ['path'],
  artifact: ['path'],
  'source-map': ['path'],
  package: ['path'],
  unknown: ['path'],
};

/**
 * The file a node names, or null when the node does not name a file.
 *
 * Most `javascript-module` nodes are deliberately not in the table above: a
 * `module_path` is a semantic attribution (which file a fact is about) and a
 * `specifier` is a reference (`react`, `./TaskList`). Treating either as a file
 * is what would put a phantom `react` file in the project root. The exception is
 * the `source-module` role, which IS the module — REA labels it with the module
 * path and corroborates it with a `contains` edge from that file's asset.
 */
export function nodeFilePath(node: any): string | null {
  const keys = PATH_PROP_KEYS[node?.kind];
  if (keys) {
    const props = propertiesOf(node);
    for (const key of keys) {
      if (typeof props[key] === 'string' && props[key]) return props[key];
    }
    return null;
  }
  if (node?.kind === 'source-module') {
    // A source-map original: the path is on identity, and a bare file name
    // (webpack `webpack://./src/App.tsx` style) is only a name, not a location.
    const original = node?.identity?.original_source;
    if (typeof original === 'string' && original) return original;
    const label = firstObservation(node)?.label;
    return typeof label === 'string' && label ? label : null;
  }
  if (node?.kind === 'javascript-module' && propertiesOf(node).semantic_role === 'source-module') {
    const label = firstObservation(node)?.label;
    // A semantic label is `path:export`; a module label is the bare path.
    return typeof label === 'string' && label && !label.includes(':') ? label : null;
  }
  return null;
}

/**
 * The import reference a node holds, or null. References name a dependency
 * (`react`, `./TaskList`) in either `specifier` (a static import) or
 * `declared_specifier` (a module reference) — measured on real envelopes, not
 * assumed: ignoring the second form silently drops half of every import graph.
 */
export function nodeReference(node: any): ReaReference | null {
  if (node?.kind !== 'javascript-module') return null;
  const props = propertiesOf(node);
  const specifier =
    (typeof props.specifier === 'string' && props.specifier) ||
    (typeof props.declared_specifier === 'string' && props.declared_specifier) ||
    '';
  if (!specifier) return null;
  return {
    specifier,
    external: props.resolution_status === 'external',
    confidence: confidenceOf(node),
  };
}

/** One file-ish record recovered from an REA node. */
export interface ReaFileRecord {
  path: string;
  kind: string;
  confidence: string;
  authority: string;
  /** True when this belongs to a bundled dependency rather than app source. */
  vendored: boolean;
  /** True when this is a source-map original rather than a file in the artifact. */
  fromSourceMap: boolean;
  /** REA's own reason when it could only partially read the file. */
  limitation?: string;
}

/** An import reference: an npm package (or a relative specifier we can resolve). */
export interface ReaReference {
  specifier: string;
  /** REA resolved it as external (`resolution_status: 'external'`). */
  external: boolean;
  confidence: string;
}

/** The Electron entry points REA recognised, with their resolution outcome. */
export interface ReaElectronRole {
  role: 'main' | 'renderer';
  declared: string | null;
  resolved: string | null;
  status: string | null;
}

export interface ReaGraphFacts {
  files: ReaFileRecord[];
  references: ReaReference[];
  electronRoles: ReaElectronRole[];
}

/** Normalize a path REA reported so one file is one path on the canvas. */
export function normalizeReaPath(raw: string): string {
  return raw
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    // Source-map originals are written relative to their map (../node_modules/x,
    // ../src/y) — the leading hops carry no location information for us.
    .replace(/^(\.\.\/)+/, '')
    // A leading slash is an archive/HTML root (`/static/js/a.js`), not a path from
    // the filesystem root.
    .replace(/^\/+/, '');
}

export function isVendoredPath(p: string): boolean {
  return /(^|\/)node_modules\//.test(p);
}

/** True when only a file name was recovered and no location (a bare `App.tsx`). */
function isBareName(p: string): boolean {
  return !p.includes('/');
}

/** Extract the file records, import references and Electron roles from a graph. */
export function classifyReaGraph(envelope: ReaEnvelope): ReaGraphFacts {
  const graph: any = (envelope?.normalized_result as any)?.graph ?? {};
  const nodes: any[] = Array.isArray(graph.nodes) ? graph.nodes : [];

  // Path → best record, tracked with its evidence rank so the most trustworthy
  // observation wins when a file appears as several kinds (asset + parse scope).
  const byPath = new Map<string, { rank: number; record: ReaFileRecord }>();
  const references: ReaReference[] = [];
  const electronRoles: ReaElectronRole[] = [];

  for (const node of nodes) {
    const kind = node?.kind ?? 'unknown';
    const props = propertiesOf(node);

    // Electron entries: architecturally meaningful, but they name a DECLARED
    // entry that may not resolve. Keeping them out of the file list avoids
    // placing a file on the canvas that the artifact does not contain.
    if (kind === 'electron-main' || kind === 'electron-renderer') {
      const declared = typeof props.declared_path === 'string' ? props.declared_path : null;
      const resolved =
        (typeof props.resolved_path === 'string' && props.resolved_path) ||
        (typeof props.script_path === 'string' && props.script_path) ||
        null;
      electronRoles.push({
        role: kind === 'electron-main' ? 'main' : 'renderer',
        declared,
        resolved,
        status: typeof props.resolution_status === 'string' ? props.resolution_status : null,
      });
      continue;
    }

    // References carry the real dependency evidence and are not files.
    const reference = nodeReference(node);
    if (reference) {
      references.push(reference);
      continue;
    }

    const raw = nodeFilePath(node);
    if (!raw) continue;
    const normalized = normalizeReaPath(raw);
    if (!normalized) continue;

    const record: ReaFileRecord = {
      path: normalized,
      kind,
      confidence: confidenceOf(node),
      authority: authorityOf(node),
      vendored: isVendoredPath(normalized),
      fromSourceMap: kind === 'source-module',
      limitation: typeof props.limitation === 'string' && props.limitation ? props.limitation : undefined,
    };

    const existing = byPath.get(normalized);
    if (!existing || rank(node) > existing.rank) byPath.set(normalized, { rank: rank(node), record });
  }

  return { files: [...byPath.values()].map((entry) => entry.record), references, electronRoles };
}

/** The deduplicated file records from REA's graph. */
export function fileRecordsFromRea(envelope: ReaEnvelope): ReaFileRecord[] {
  return classifyReaGraph(envelope).files;
}

/**
 * The npm package a module specifier belongs to, or '' for a relative specifier.
 * `react-dom/client` → `react-dom`, `@scope/pkg/sub` → `@scope/pkg`, `node:fs`
 * keeps its `node:` prefix so a built-in is visibly not an npm package.
 */
export function packageNameFromSpecifier(specifier: string): string {
  const s = (specifier || '').trim();
  if (!s || s.startsWith('.') || s.startsWith('/')) return '';
  if (s.startsWith('node:')) return s;
  const parts = s.split('/').filter(Boolean);
  if (parts.length === 0) return '';
  return s.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** The npm package a vendored path belongs to (`node_modules/@scope/pkg/...`). */
export function packageNameFromPath(p: string): string {
  const m = /(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(p);
  if (!m) return '';
  return m[1].replace(/\/$/, '');
}

const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];

/**
 * Resolve a relative import specifier to a file REA actually saw, or null.
 *
 * Only file candidates that exist in `knownPaths` are returned: an unresolved
 * specifier must never be invented into a connection. Extension-less and
 * directory (`…/index.js`) forms are tried because that is how the import was
 * written, not how the file is named.
 */
export function resolveSpecifier(specifier: string, fromPath: string, knownPaths: Set<string>): string | null {
  if (!specifier || !fromPath) return null;
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return null;
  const base = specifier.startsWith('/')
    ? path.posix.normalize(specifier)
    : path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), specifier));
  if (knownPaths.has(base)) return base;
  for (const ext of RESOLVE_EXTENSIONS) {
    if (knownPaths.has(base + ext)) return base + ext;
  }
  for (const ext of RESOLVE_EXTENSIONS) {
    const indexed = path.posix.join(base, `index${ext}`);
    if (knownPaths.has(indexed)) return indexed;
  }
  return null;
}

/** The path an edge endpoint names: a file path, or a semantic node's module_path. */
function definingPath(node: any): string | null {
  const filePath = nodeFilePath(node);
  if (filePath) return normalizeReaPath(filePath) || null;
  const modulePath = propertiesOf(node).module_path;
  return typeof modulePath === 'string' && modulePath ? normalizeReaPath(modulePath) : null;
}

// ─── Grouping: files → canvas modules ─────────────────────────────────────────

/** The module a file belongs to: its directory, collapsed to 2 segments. */
export function moduleKeyFor(filePath: string): string {
  const dir = path.posix.dirname(filePath);
  if (dir === '.' || dir === '') return '(root)';
  const parts = dir.split('/').filter(Boolean);
  return parts.length <= 2 ? parts.join('/') : `${parts[0]}/${parts[1]}`;
}

/** Canvas node type for a module, mirroring the frontend's file heuristics. */
export function moduleTypeFor(modulePath: string, files: string[]): ScanArchitectureNode['type'] {
  const lowerModule = modulePath.toLowerCase();
  const joined = `${lowerModule} ${files.join(' ')}`.toLowerCase();
  if (/(^|\/)(build|dist|out|vendor|third_party)(\/|$)/.test(lowerModule)) return 'output';
  if (/(^|\/)(__tests__|__mocks__|tests?|specs?)(\/|$)/.test(lowerModule)) return 'logic';
  // Tested per file: a `$`-anchored extension check against the joined list only
  // matched when the html/css file happened to sort last.
  const hasMarkup = files.some((f) => /\.(css|scss|sass|less|html?)$/i.test(f));
  // The short tokens are bounded: without a word boundary `ConsoleUI.java` reads
  // as "ui", which is how a game's core package ended up typed `ui`.
  if (hasMarkup || /(component|page|screen|view|\bui\b|layout|widget|container|modal|\bform\b)/.test(joined)) return 'ui';
  if (/(route|controller|endpoint|\bapi\b|middleware|graphql|resolver|service|\bipc\b|preload)/.test(joined)) return 'api';
  if (/(\bdb\b|schema|model|entity|repository|migration|prisma|\bstore\b|sqlite)/.test(joined)) return 'database';
  if (/(^|\/)(main|app|index|entry|bootstrap|server|cli|bin|cmd)[^/]*\./.test(joined)) return 'input';
  return 'logic';
}

function languageForFiles(files: string[], fallback = 'javascript'): string {
  const exts = new Set(files.map((f) => path.extname(f).toLowerCase()));
  if (exts.has('.py')) return 'python';
  if (exts.has('.go')) return 'go';
  if (exts.has('.rs')) return 'rust';
  if (exts.has('.java') || exts.has('.kt')) return 'java';
  if (exts.has('.cs')) return 'csharp';
  if (exts.has('.swift')) return 'swift';
  if (exts.has('.ts') || exts.has('.tsx')) return 'typescript';
  return fallback;
}

// ─── Mapping: REA evidence graph → canvas architecture ────────────────────────

/** Frameworks REA's own evidence implies, from dependencies and Electron roles. */
function frameworksFrom(facts: ReaGraphFacts, summary: any, depNames: Set<string>): string[] {
  const found = new Set<string>();
  if (facts.electronRoles.some((r) => r.role === 'main') || facts.electronRoles.some((r) => r.role === 'renderer')) {
    found.add('electron');
  }
  if (depNames.has('react') || depNames.has('react-dom')) found.add('React');
  if (depNames.has('vue')) found.add('Vue');
  if (depNames.has('@angular/core')) found.add('Angular');
  if (depNames.has('express') || depNames.has('fastify')) found.add('Express');
  if (depNames.has('next')) found.add('Next.js');
  if (Number(summary.native_addon_bindings ?? 0) > 0) found.add('native-addons');
  return [...found];
}

/**
 * REA envelope → canvas `ScanArchitecture`. Pure and deterministic: the same
 * envelope always yields the same node tree, so a scan can be re-rendered and
 * tested without the CLI.
 */
export function architectureFromRea(
  envelope: ReaEnvelope,
  opts: { displayName?: string; targetPath?: string } = {},
): ScanArchitecture {
  const nr: any = envelope?.normalized_result ?? {};
  const graph: any = nr.graph ?? {};
  const summary: any = nr.summary ?? {};
  const statistics: any = nr.statistics ?? {};
  const facts = classifyReaGraph(envelope);

  const allFiles = facts.files;
  // A source-map original must look like a file to be placed on the canvas: the
  // bundler also names VIRTUAL modules in a map (`webpack/bootstrap`,
  // `webpack/runtime/…`), and those are not files anyone can open.
  const placeable = allFiles.filter((r) => !(r.fromSourceMap && !path.posix.extname(r.path)));
  const virtualOriginals = allFiles.length - placeable.length;
  const vendored = placeable.filter((r) => r.vendored);
  let appFiles = placeable.filter((r) => !r.vendored);

  // A source-map original can arrive as a bare name (`TaskInput.tsx`) because the
  // map records it relative to a build root we cannot see. When that name matches
  // exactly one known file, it is that file; when it is ambiguous, it stays where
  // it was found rather than being guessed onto one of them.
  // Only located files seed the index — otherwise a bare record matches itself.
  const byBasename = new Map<string, string[]>();
  for (const rec of appFiles) {
    if (isBareName(rec.path)) continue;
    const name = path.posix.basename(rec.path);
    byBasename.set(name, [...(byBasename.get(name) ?? []), rec.path]);
  }
  const relocated: ReaFileRecord[] = [];
  const stillBare: ReaFileRecord[] = [];
  const relocatedBareNames = new Set<string>();
  for (const rec of appFiles) {
    if (!rec.fromSourceMap || !isBareName(rec.path)) continue;
    const candidates = byBasename.get(rec.path) ?? [];
    if (candidates.length === 1) {
      relocatedBareNames.add(rec.path);
      relocated.push({ ...rec, path: candidates[0] });
    } else {
      stillBare.push(rec);
    }
  }
  appFiles = [
    // Drop the bare originals that were pinned to exactly one located file.
    ...appFiles.filter((r) => !relocatedBareNames.has(r.path)),
    ...relocated.filter((r) => !appFiles.some((other) => other.path === r.path && !isBareName(other.path))),
  ];
  // One path, one record (a relocated original now duplicates the located asset).
  const deduped = new Map<string, ReaFileRecord>();
  for (const rec of appFiles) {
    const existing = deduped.get(rec.path);
    if (!existing || (CONFIDENCE_RANK[rec.confidence] ?? -1) > (CONFIDENCE_RANK[existing.confidence] ?? -1)) {
      deduped.set(rec.path, rec);
    }
  }
  appFiles = [...deduped.values()];
  const knownPathsFinal = new Set(appFiles.map((r) => r.path));

  // ── Module nodes: one per directory, carrying every file in it ──
  const byModule = new Map<string, string[]>();
  for (const rec of appFiles) {
    const key = moduleKeyFor(rec.path);
    byModule.set(key, [...(byModule.get(key) ?? []), rec.path]);
  }

  const nodes: ScanArchitectureNode[] = [];
  const nodeLabelForModule = new Map<string, string>();
  const moduleOfFile = new Map<string, string>();
  const entries = [...byModule.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  entries.forEach(([modulePath, files], i) => {
    const label = modulePath === '(root)' ? 'root' : modulePath;
    nodeLabelForModule.set(modulePath, label);
    for (const f of files) moduleOfFile.set(f, modulePath);

    const kinds = appFiles.filter((r) => moduleOfFile.get(r.path) === modulePath).map((r) => r.kind);
    const kindHint = [...new Set(kinds)].join('/') || 'module';
    nodes.push({
      label,
      description: `${files.length} file${files.length === 1 ? '' : 's'} in ${label === 'root' ? 'the project root' : `${label}/`} — ${kindHint} (${files.slice(0, 3).join(', ')}${files.length > 3 ? ', …' : ''})`,
      type: moduleTypeFor(modulePath, files),
      language: languageForFiles(files),
      files,
      position: { x: 250 + (i % 2) * 380, y: 120 + Math.floor(i / 2) * 180 },
    });
  });

  // ── Edges + external usage: walk the `imports` relations ──
  const nodeById = new Map<string, any>();
  for (const n of Array.isArray(graph.nodes) ? graph.nodes : []) nodeById.set(n.node_id, n);

  const edges: ScanArchitectureEdge[] = [];
  const seenEdges = new Set<string>();
  const edgeCount = new Map<string, number>();
  const unresolvedSpecifiers: string[] = [];
  const externalUsage = new Map<string, Set<string>>();

  const addEdge = (source: string, target: string, description: string) => {
    if (!source || !target || source === target) return;
    const key = `${source}\u0000${target}`;
    edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    edges.push({ source, target, description });
  };

  for (const edge of Array.isArray(graph.edges) ? graph.edges : []) {
    if (edge?.relation !== 'imports') continue;
    const from = nodeById.get(edge.source_node_id);
    const to = nodeById.get(edge.target_node_id);
    if (!from || !to) continue;

    const fromPath = definingPath(from);
    if (!fromPath) continue;
    const fromModule = moduleOfFile.get(fromPath) ?? moduleKeyFor(fromPath);
    const fromLabel = nodeLabelForModule.get(fromModule);
    if (!fromLabel) continue;
    const props = propertiesOf(to);
    const specifier = typeof props.specifier === 'string' ? props.specifier : '';

    // An external reference is a dependency, not a canvas module: record who uses
    // it and let the module→external wiring happen through `usedBy`.
    if (specifier && props.resolution_status === 'external') {
      const pkg = packageNameFromSpecifier(specifier);
      if (pkg) {
        const set = externalUsage.get(pkg) ?? new Set<string>();
        set.add(fromPath);
        externalUsage.set(pkg, set);
      }
      continue;
    }

    // A relative specifier is drawn only when it resolves to a file REA saw: an
    // unresolved import is reported, never guessed into a connection.
    let target = definingPath(to);
    if (target && !knownPathsFinal.has(target)) target = null;
    if (!target) {
      const resolved = specifier ? resolveSpecifier(specifier, fromPath, knownPathsFinal) : null;
      if (!resolved) {
        if (specifier) unresolvedSpecifiers.push(`${fromPath} → ${specifier}`);
        continue;
      }
      target = resolved;
    }
    const toModule = moduleOfFile.get(target) ?? moduleKeyFor(target);
    const toLabel = nodeLabelForModule.get(toModule);
    if (!toLabel) continue;
    // Edges are emitted between FILES, not between the directories that hold
    // them: `src/App.tsx imports ./TaskList` is a real measured relation, while
    // "src imports src" would say nothing at all (a whole flat source tree
    // collapses to one directory). The canvas already places a node per file, so
    // the frontend resolves these paths to those nodes.
    addEdge(fromPath, target, `${path.posix.basename(fromPath)} imports ${specifier || path.posix.basename(target)}`);
  }

  // Annotate each edge with the real number of import relations behind it.
  for (const edge of edges) {
    const count = edgeCount.get(`${edge.source}\u0000${edge.target}`) ?? 1;
    if (count > 1) edge.description = `${edge.description} (+${count - 1} more)`;
  }

  // ── External connections: measured references first, bundled originals after ──
  const vendoredOriginals = new Map<string, Set<string>>();
  for (const rec of vendored) {
    const pkg = packageNameFromPath(rec.path);
    if (!pkg) continue;
    vendoredOriginals.set(pkg, (vendoredOriginals.get(pkg) ?? new Set<string>()).add(rec.path));
  }
  const depNames = new Set<string>([...externalUsage.keys(), ...vendoredOriginals.keys()]);
  const externalDeps: ScanExternalDep[] = [...depNames]
    .map((name) => {
      // Prefer the app files that import it: those exist on the canvas, so the
      // connection is drawn from the real importing file rather than the master.
      const importers = externalUsage.get(name);
      const usedBy = importers && importers.size > 0 ? [...importers] : [...(vendoredOriginals.get(name) ?? [])];
      return { name, kind: 'package' as const, usedBy: usedBy.sort() };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // ── Identity / provenance ──
  const subject: any = envelope?.subject ?? {};
  const topDirs = [...new Set(appFiles.map((r) => (r.path.includes('/') ? r.path.split('/')[0] : '')).filter(Boolean))];
  // Sibling APPS are top-level folders carrying their own manifest — a single app
  // that happens to have eight folders is not "8 apps dropped together".
  const siblingApps = topDirs.filter((dir) =>
    appFiles.some((f) => f.path.startsWith(`${dir}/`) && path.posix.basename(f.path) === 'package.json'),
  );

  const packageNode = (Array.isArray(graph.nodes) ? graph.nodes : []).find(
    (n: any) => n?.kind === 'package' && typeof propertiesOf(n).name === 'string' && propertiesOf(n).name,
  );
  // An explicit name wins. Otherwise the artifact's own manifest names the
  // project — unless the drop held SEVERAL apps, where one manifest's name would
  // silently speak for all of them and the drop root is the truthful label.
  const projectName =
    opts.displayName ||
    (siblingApps.length > 1 ? '' : packageNode ? String(propertiesOf(packageNode).name) : '') ||
    (typeof subject.name === 'string' && subject.name ? subject.name : '') ||
    (opts.targetPath ? path.basename(opts.targetPath) : 'Scanned artifact');

  const limitations: string[] = Array.isArray(nr.limitations)
    ? nr.limitations.filter((l: unknown): l is string => typeof l === 'string')
    : [];
  const parseLimits = allFiles
    .filter((r) => r.limitation)
    .map((r) => `${r.path}: ${r.limitation}`);

  const frameworks = frameworksFrom(facts, summary, depNames);
  const targetLabel = opts.targetPath ? path.basename(opts.targetPath) : 'artifact';

  const notes: string[] = [
    `Scan engine: REA ${envelope?.provider?.version ?? ''} ${envelope?.provider?.id ? `(${envelope.provider.id})` : ''} — operation ${envelope?.operation ?? 'unknown'}, evidence ${envelope?.evidence_id ?? 'n/a'}.`,
    `Artifact: ${targetLabel} (${subject.format ?? 'unknown format'})${subject.digest?.sha256 ? `, sha256 ${String(subject.digest.sha256).slice(0, 12)}…` : ''}.`,
    `Measured: ${statistics.relevant_files ?? allFiles.length} relevant file(s), ${vendored.length} bundled dependency original(s), ${facts.references.length} import reference(s).`,
  ];
  for (const role of facts.electronRoles) {
    const where = role.resolved && role.resolved !== role.declared ? ` → ${role.resolved}` : '';
    notes.push(
      `Electron ${role.role} entry: ${role.declared ?? 'undeclared'}${where}${role.status && role.status !== 'resolved' ? ` (${role.status})` : ''}.`,
    );
  }
  if (relocated.length > 0) {
    notes.push(`${relocated.length} source-map original(s) were placed by name (only one file in the artifact has that name).`);
  }
  if (stillBare.length > 0) {
    notes.push(
      `${stillBare.length} source-map original(s) have no location in the artifact and are shown at the project root: ${stillBare.slice(0, 5).map((r) => r.path).join(', ')}${stillBare.length > 5 ? ', …' : ''}.`,
    );
  }
  if (virtualOriginals > 0) {
    notes.push(`${virtualOriginals} bundler-virtual module(s) (e.g. webpack/bootstrap) were not placed — they are not files.`);
  }
  if (unresolvedSpecifiers.length > 0) {
    const shown = unresolvedSpecifiers.slice(0, 5).join('; ');
    notes.push(
      `Unresolved relative import(s): ${unresolvedSpecifiers.length} — not drawn as connections (${shown}${unresolvedSpecifiers.length > 5 ? '; …' : ''}).`,
    );
  }
  // A big app reports a lot of per-file limitations; the preview shows a list, so
  // it gets the first few plus an honest count of the rest.
  const NOTE_LIMIT = 6;
  const capped = (items: string[], prefix: string) => {
    const lines = items.slice(0, NOTE_LIMIT).map((i) => `${prefix}${i}`);
    if (items.length > NOTE_LIMIT) lines.push(`…and ${items.length - NOTE_LIMIT} more ${prefix === 'Limitation: ' ? 'limitation(s)' : 'partial parse(s)'}.`);
    return lines;
  };
  notes.push(...capped(parseLimits, 'Partial parse: '));
  notes.push(...capped(limitations, 'Limitation: '));

  return {
    projectName,
    projectType: frameworks.includes('electron') ? 'fullstack' : 'frontend',
    frameworks,
    nodes,
    edges,
    externalDeps,
    apps: siblingApps.length > 1 ? siblingApps.sort() : undefined,
    notes,
  };
}

// ─── Mapping: REA's historical source graph (non-JavaScript source trees) ─────

/**
 * One entry of REA's `HistoricalSourceGraph` (`rea import-reference-source`).
 *
 * This is a DIFFERENT contract from the analysis envelope above, measured on a
 * real Java project: it is an inventory (`kind`, `language`, `size`, `sha256`,
 * `classifications`, `content_state: "hashed"`) with `relationships: []` — the
 * importer records structure and never parses the code, so there are no imports
 * to draw and no semantic facts to attribute.
 */
export interface HistoricalSourceEntry {
  path: string;
  kind: string;
  classifications?: string[];
  language?: string | null;
  size?: number;
  content_state?: string;
  tree_state?: string;
  limitations?: string[];
}

export interface HistoricalSourceGraph {
  schema?: string;
  authority?: string;
  root_alias?: string;
  root_sha256?: string;
  inventory_state?: string;
  entries?: HistoricalSourceEntry[];
  relationships?: unknown[];
  parse_failures?: unknown[];
  exclusions?: unknown[];
  languages?: string[];
  manifests?: unknown[];
  vcs?: { kind?: string; head?: string | null; dirty?: boolean | null };
  provenance?: Record<string, unknown>;
  limitations?: string[];
}

/** True for `rea import-reference-source` output (not an analysis envelope). */
export function isHistoricalSourceGraph(value: unknown): value is HistoricalSourceGraph {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as HistoricalSourceGraph;
  if (candidate.schema === 'HistoricalSourceGraph') return true;
  return Array.isArray(candidate.entries) && typeof candidate.authority === 'string';
}

/**
 * The module a file belongs to in a source-tree import: its FULL directory.
 *
 * The JavaScript mapper collapses deep directories to two segments because a
 * bundle has hundreds of them — but for a Java tree that collapse destroys the
 * one thing that matters: `src/main/java/com/tictactoe/Board.java` belongs to the
 * package `com.tictactoe`, not to `src/main`. Past {@link REFERENCE_MODULE_LIMIT}
 * modules the collapse comes back, so a very large tree cannot flood the canvas.
 */
export const REFERENCE_MODULE_LIMIT = 40;

export function referenceModuleKeyFor(filePath: string): string {
  const dir = path.posix.dirname(filePath);
  return dir === '.' || dir === '' ? '(root)' : dir;
}

/** Languages that are documentation or configuration rather than the stack. */
const NON_STACK_LANGUAGES = new Set(['markdown', 'json', 'yaml', 'yml', 'toml', 'xml', 'text', 'csv']);

/**
 * REA's historical source graph → canvas `ScanArchitecture`.
 *
 * Modules are directories, files are entries, and the language on each node is
 * the language the importer detected — so a Java drop lands on the canvas as
 * Java modules rather than as "typescript", which is what the JS-shaped default
 * would have claimed.
 */
export function architectureFromReferenceSource(
  graph: HistoricalSourceGraph,
  opts: { displayName?: string; targetPath?: string } = {},
): ScanArchitecture {
  const entries = Array.isArray(graph.entries) ? graph.entries : [];
  const fileEntries = entries.filter((e) => e?.kind === 'file' && typeof e.path === 'string' && e.path);
  const languages = Array.isArray(graph.languages) ? graph.languages.filter((l) => typeof l === 'string') : [];
  const stack = languages.filter((l) => !NON_STACK_LANGUAGES.has(l.toLowerCase()));
  const primaryLanguage = (stack[0] ?? languages[0] ?? '').toLowerCase() || 'text';

  const languageOf = (entry: HistoricalSourceEntry): string => {
    const declared = typeof entry.language === 'string' && entry.language ? entry.language.toLowerCase() : '';
    return declared || primaryLanguage;
  };

  // Full directories first; only if that would produce an unreasonable number of
  // module nodes does the shallower, two-segment grouping take over.
  const fullKeys = new Set(fileEntries.map((e) => referenceModuleKeyFor(e.path)));
  const collapsed = fullKeys.size > REFERENCE_MODULE_LIMIT;
  const keyFor = (p: string) => (collapsed ? moduleKeyFor(p) : referenceModuleKeyFor(p));

  const byModule = new Map<string, string[]>();
  const languageByModule = new Map<string, string>();
  for (const entry of fileEntries) {
    const key = keyFor(entry.path);
    byModule.set(key, [...(byModule.get(key) ?? []), entry.path]);
    // A module's language is the first real source language among its files, so
    // README.md next to the sources does not relabel the module "markdown".
    const language = languageOf(entry);
    const current = languageByModule.get(key);
    if (!current || (NON_STACK_LANGUAGES.has(current) && !NON_STACK_LANGUAGES.has(language))) {
      languageByModule.set(key, language);
    }
  }

  const nodes: ScanArchitectureNode[] = [];
  const entriesByModule = [...byModule.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  entriesByModule.forEach(([modulePath, files], i) => {
    const label = modulePath === '(root)' ? 'root' : modulePath;
    const kinds = files.map((f) => (entries.find((e) => e.path === f)?.classifications ?? []).join('/'));
    const summary = [...new Set(kinds.filter(Boolean))].join(', ') || 'source';
    nodes.push({
      label,
      description: `${files.length} file${files.length === 1 ? '' : 's'} in ${label === 'root' ? 'the project root' : `${label}/`} — ${summary} (${files.slice(0, 3).join(', ')}${files.length > 3 ? ', …' : ''})`,
      type: moduleTypeFor(modulePath, files),
      language: languageByModule.get(modulePath) || primaryLanguage,
      files,
      position: { x: 250 + (i % 2) * 380, y: 120 + Math.floor(i / 2) * 180 },
    });
  });

  // The importer records no dependencies (its authority is "historical-reference",
  // and files are hashed rather than parsed), so the canvas gets structure with
  // no import lines — and a note that says exactly that instead of an empty list
  // the user might read as "this app has no imports".
  const relationships = Array.isArray(graph.relationships) ? graph.relationships.length : 0;
  const labels = new Set(nodes.map((n) => n.label));
  const edges: ScanArchitectureEdge[] = [];
  const outerDirModules = new Map<string, string>();
  for (const [modulePath] of entriesByModule) {
    const parent = path.posix.dirname(modulePath);
    if (parent !== '.' && labels.has(parent)) {
      outerDirModules.set(modulePath, parent);
      edges.push({
        source: parent,
        target: modulePath,
        description: `${parent} contains ${modulePath}`,
      });
    }
  }

  const totalBytes = fileEntries.reduce((sum, e) => sum + (typeof e.size === 'number' ? e.size : 0), 0);
  const generated = fileEntries.filter((e) => (e.classifications ?? []).includes('generated')).length;

  const notes: string[] = [
    `Import engine: REA import-reference-source (${graph.schema ?? 'source graph'}, authority ${graph.authority ?? 'unknown'}) — importer ${String((graph.provenance as any)?.importer ?? 'rea')} ${String((graph.provenance as any)?.importer_version ?? '')}.`,
    `Artifact: ${opts.targetPath ? path.basename(opts.targetPath) : 'dropped source'} — ${fileEntries.length} file(s), ${nodes.length} director${nodes.length === 1 ? 'y' : 'ies'}, ${Math.round(totalBytes / 1024)}KB hashed.`,
    `Detected languages: ${languages.join(', ') || 'none reported'}. Inventory state: ${graph.inventory_state ?? 'unknown'}.`,
  ];
  if (generated > 0) {
    notes.push(`${generated} generated file(s) (compiled output) are present in the folder and shown as their own modules.`);
  }
  if (collapsed) {
    notes.push(
      `This tree has ${fullKeys.size} directories, so they were grouped two levels deep on the canvas (Java packages are kept whole up to ${REFERENCE_MODULE_LIMIT}).`,
    );
  }
  notes.push(
    relationships === 0
      ? 'This import is structural: files were hashed, not parsed, so it carries NO dependency relationships — the canvas shows how the project is laid out, not what imports what.'
      : `${relationships} relationship(s) were reported by the importer but are not drawn (their shape is not part of this mapper's contract).`,
  );
  for (const limit of (Array.isArray(graph.limitations) ? graph.limitations : []).slice(0, 6)) {
    notes.push(`Limitation: ${limit}`);
  }

  return {
    projectName: opts.displayName || (opts.targetPath ? path.basename(opts.targetPath) : 'Imported source'),
    projectType: primaryLanguage,
    frameworks: stack,
    nodes,
    edges,
    externalDeps: [],
    apps: undefined,
    notes,
  };
}

// ─── Orchestration ────────────────────────────────────────────────────────────

export interface DeepScanEvidence {
  evidenceId: string | null;
  providerId: string | null;
  providerVersion: string | null;
  operation: string | null;
  limitations: string[];
  statistics: Record<string, unknown>;
  progressPhases: string[];
  durationMs: number;
}

export interface DeepScanOutcome {
  architecture: ScanArchitecture | null;
  source: 'rea';
  evidence: DeepScanEvidence;
  /** Which REA command answered for this target (null when it never resolved). */
  plan: ReaScanPlan | null;
  /** Set when no architecture could be produced — the reason, verbatim. */
  error: string | null;
  /** What the user must install/do, when that is the blocker. */
  hint: string | null;
  run: ReaRun | null;
}

/**
 * The install hint for a blocked scan, from REA's own sources, most specific
 * first: what the refusal itself said to do, then the `doctor` check for the
 * provider that refused, then every missing analysis engine. The middleware
 * order matters — the `.apk` refusal names jadx while `doctor` also lists Hopper,
 * Ghidra and IDA as missing, and telling a user to install three engines they do
 * not need would be noise, not help.
 */
async function installHintFor(target: string, failure: ReaFailure | null): Promise<string | null> {
  const remediation = typeof failure?.remediation === 'string'
    ? failure.remediation
    : failure?.remediation?.action;
  if (remediation) return remediation;

  const providerId = typeof (failure?.details as any)?.provider_id === 'string'
    ? String((failure!.details as any).provider_id)
    : '';

  const readiness = await reaReadiness(target);
  if (readiness.error) return readiness.error;

  const format = (checks: ReaCheck[]) =>
    checks.slice(0, 4).map((c) => `${c.name}: ${c.remediation || c.detail || c.classification || 'not ready'}`).join('\n');

  const missingEngines = readiness.checks.filter((c) => c.classification === 'missing_analysis_engine');
  const forProvider = providerId ? missingEngines.filter((c) => c.name === providerId) : [];
  if (forProvider.length > 0) return format(forProvider);
  if (missingEngines.length > 0) return format(missingEngines);
  if (readiness.blockers.length > 0) return format(readiness.blockers);
  return null;
}

/** Resolve + verify the target before spawning: REA must see a real absolute path. */
function resolveTarget(target: string): { ok: true; absolute: string } | { ok: false; error: string } {
  if (!target || typeof target !== 'string') return { ok: false, error: 'No target path was provided.' };
  if (!path.isAbsolute(target)) {
    return { ok: false, error: `REA needs an absolute path (got "${target}") — pass the dropped artifact's real path.` };
  }
  try {
    fs.statSync(target);
  } catch {
    return { ok: false, error: `Target does not exist: ${target}` };
  }
  return { ok: true, absolute: target };
}

/**
 * Run REA's Deep Scan over one dropped artifact and map the result to the
 * canvas shape. Never throws. When the artifact needs an engine that is not
 * installed this STOPS with REA's own remediation instead of falling back to an
 * LLM guess — an invented architecture for a binary we cannot read would be
 * exactly the kind of unearned confidence this integration exists to remove.
 */
export async function deepScanWithRea(
  target: string,
  opts: { displayName?: string; timeoutMs?: number; onProgress?: (phase: string) => void } = {},
): Promise<DeepScanOutcome> {
  const emptyEvidence: DeepScanEvidence = {
    evidenceId: null,
    providerId: null,
    providerVersion: null,
    operation: null,
    limitations: [],
    statistics: {},
    progressPhases: [],
    durationMs: 0,
  };

  const resolved = resolveTarget(target);
  if (!resolved.ok) {
    return { architecture: null, source: 'rea', evidence: emptyEvidence, plan: null, error: resolved.error, hint: null, run: null };
  }

  if (!isReaInstalled()) {
    return {
      architecture: null,
      source: 'rea',
      evidence: emptyEvidence,
      plan: null,
      error: 'REA is not installed, so no artifact can be scanned.',
      hint: reaInstallHint(),
      run: null,
    };
  }

  const plan = planReaScan(resolved.absolute);
  // The filter keeps a large application scan from becoming a 112 MB envelope
  // (see DEEP_SCAN_FILTER_OUTPUT) while leaving failure envelopes intact.
  const run = await runRea([plan.command, plan.target], {
    timeoutMs: opts.timeoutMs ?? 600_000,
    filterOutput: DEEP_SCAN_FILTER_OUTPUT,
  });

  const evidence: DeepScanEvidence = {
    evidenceId: run.envelope?.evidence_id ?? null,
    providerId: run.envelope?.provider?.id ?? null,
    providerVersion: run.envelope?.provider?.version ?? null,
    operation: run.envelope?.operation ?? null,
    limitations: Array.isArray((run.envelope?.normalized_result as any)?.limitations)
      ? ((run.envelope!.normalized_result as any).limitations as string[])
      : [],
    statistics: ((run.envelope?.normalized_result as any)?.statistics as Record<string, unknown>) ?? {},
    progressPhases: [...new Set(run.progress.map((p) => p.phase).filter((p): p is string => !!p))],
    durationMs: run.durationMs,
  };

  if (!run.ok || !run.envelope) {
    // REA refused the target (wrong class, unreadable bytes, or a missing engine)
    // or the process failed. When the refusal is about tooling, ask `doctor` for
    // REA's OWN remediation rather than inventing install advice here.
    const failure: ReaFailure | null = run.failure;
    const failureText = `${failure?.code ?? ''} ${failure?.message ?? ''} ${failure?.error ?? ''} ${failure?.details ? JSON.stringify(failure.details) : ''}`;
    const toolingBlocked = plan.needsEngine || /missing_analysis_engine|capability_unavailable|not_configured|provider|toolchain/i.test(failureText);

    // A refusal always explains itself; adding REA's own install advice turns
    // "this did not work" into "here is what to install".
    const hint = toolingBlocked ? await installHintFor(resolved.absolute, failure) : null;

    return {
      architecture: null,
      source: 'rea',
      evidence,
      plan,
      error: run.error ?? describeReaFailure(failure),
      hint,
      run,
    };
  }

  // Two contracts can come back, and they are mapped by different rules: the
  // analysis envelope (an evidence graph with imports) and the historical source
  // graph (`import-reference-source`, an inventory with no imports at all).
  const architecture = isHistoricalSourceGraph(run.envelope)
    ? architectureFromReferenceSource(run.envelope, {
        displayName: opts.displayName,
        targetPath: resolved.absolute,
      })
    : architectureFromRea(run.envelope, {
        displayName: opts.displayName,
        targetPath: resolved.absolute,
      });

  // An envelope with no mappable files is a real outcome, not a success: say so
  // rather than handing the canvas an empty tree. For a FILE target (not an
  // application directory) the likely reason is that reaching real structure
  // needs a deep-analysis engine, so REA's own advice is attached.
  if (architecture.nodes.length === 0) {
    const subject: any = run.envelope?.subject ?? {};
    return {
      architecture: null,
      source: 'rea',
      evidence,
      plan,
      error: `REA analysed ${plan.target} (${plan.command}${subject.format ? `, detected ${subject.format}` : ''}) but reported no application files to map — nothing to place on the canvas.`,
      // Engine advice belongs to the artifact probes. A source-tree import needs
      // no analysis engine, so offering Ghidra/Hopper here would be noise.
      hint: plan.command.startsWith('inspect-') ? await installHintFor(resolved.absolute, null) : null,
      run,
    };
  }

  for (const phase of evidence.progressPhases) opts.onProgress?.(phase);
  return { architecture, source: 'rea', evidence, plan, error: null, hint: null, run };
}
