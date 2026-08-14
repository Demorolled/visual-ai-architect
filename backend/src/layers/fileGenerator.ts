/**
 * FileGenerator — generates individual code files per node with proper imports/exports.
 *
 * Instead of generating 3 monolithic layers, each node produces its own standalone file
 * that can be edited individually. Files import from each other based on graph edges.
 *
 * This is the core of the "node-per-file" architecture — each node on the canvas
 * corresponds 1:1 to a source file in the generated project.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Project } from '../types.js';
import { AITranslator, classifyCodeComplexity, ModelTier } from '../ai/translator.js';
// Reuse the chat/CLI path's GUI intent detection + concrete widget templates so
// the canvas node-based build enforces the same GUI-entry quality floor.
// Imported from the neutral shared module (NOT from the routes module) to avoid
// triggering Router()/AITranslator side effects at module load.
import { isGuiRequest, GUI_WIDGET_SECTION, APP_QUALITY_RULES, inlineExternalScriptRefs, stripTypeScriptKeepExports } from '../ai/guiShared.js';
import { buildSync as esbuildBuildSync } from 'esbuild';
import { buildSemanticSection } from '../utils/semanticConnect.js';
import { SandboxRunner } from '../sandbox/runner.js';
import { learningEngine } from '../knowledge/learningEngine.js';
import { getRegistry } from '../tools/ToolRegistry.js';
import { captureVerifiedGeneration } from '../training/verifiedGenerationCapture.js';

const execFileAsync = promisify(execFile);

// Project root (backend/src/layers → up 3 = repo root). Used to locate the
// TypeScript compiler for the live compile-check pass.
const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const TSC_BIN = path.join(PROJECT_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');

/**
 * GUI-intent detection for the canvas path — mirrors codePlanner's isGuiRequest
 * but for a node-based Project: explicit ui/gui-layout/ui-functions nodes always
 * signal a GUI app; otherwise fall back to the shared request/answer detector
 * fed with the master node's goal + purpose + project name.
 */
function isGuiCanvasProject(project: Project): boolean {
  const masterNode = project.nodes.find((n: any) => n.type === 'master');
  const goal = masterNode?.data?.appGoal || project.name || '';
  const purpose = masterNode?.data?.appPurpose || '';
  if (project.nodes.some((n: any) => n.type === 'ui' || n.type === 'gui-layout' || n.type === 'ui-functions')) return true;
  return isGuiRequest(`${goal} ${purpose}`);
}

/**
 * Scale guidance injected into every per-file generation prompt so each
 * generated file matches the target program size. Reads the scale the user
 * picked (master node data), defaulting to Medium.
 */
export function buildScaleSection(scale?: string): string {
  switch (scale) {
    case 'small':
      return `PROGRAM SCALE: Small — this file is one module in a small (4–8 file) app.\n- Keep the file lean and focused: implement exactly what the node describes.\n- Include basic error handling, but do NOT over-engineer or add speculative abstractions.`;
    case 'large':
      return `PROGRAM SCALE: Large — this file is one module in a large (25+ file) program.\n- Write PRODUCTION-GRADE code: comprehensive error handling, edge cases, and defensive checks.\n- Design for integration: expose clean, typed exports so sibling modules can build on this file.\n- Prefer configuration/constants over hardcoded values where the app is expected to vary.`;
    case 'enterprise':
      return `PROGRAM SCALE: Enterprise — this file is one module in an enterprise (50+ file) platform.\n- Maximum robustness: thorough validation, error handling, and defensive programming.\n- Keep code testable and auditable (clear boundaries, injected config, no hidden globals).\n- Expose stable, typed interfaces for other modules; document non-obvious behavior.`;
    case 'medium':
    default:
      return `PROGRAM SCALE: Medium — this file is one module in a standard (8–14 file) app.\n- Include solid error handling and clear structure.\n- Expose typed exports so other modules can import this file cleanly.`;
  }
}

export interface GeneratedFile {
  fileName: string;
  language: string;
  code: string;
  nodeId: string;
  nodeLabel: string;
  /** Node IDs this file depends on (imports from) */
  dependencies: string[];
  /** What this file exports to other files (named symbols) */
  exports: string[];
  /** Compilation / syntax errors from sandbox validation */
  errors: string[];
  /** Whether the file passed sandbox validation */
  validated: boolean;
}

/**
 * What one generated file exposes to its dependents: named exports plus an
 * optional default export. `names` feeds the named-import contract; a default
 * export is imported as `import X from '…'` (never `import { X }`, which fails
 * with TS2614). Default exports were previously ignored entirely, silently
 * turning every `export default X` file into a "no exports" dependency.
 */
export interface FileExportInfo {
  names: string[];
  defaultName?: string;
  /**
   * Member whitelist per exported class/interface: typeName → member names.
   * Populated by extractExports so the model is told EXACTLY which members it
   * may call on an imported type (prevents invented members like
   * board.makeMove() when ChessBoard only exposes getPiece/setPiece/clone/...).
   */
  members?: Record<string, string[]>;
}

/**
 * Human-readable export contract for a file's dependency (used in prompts).
 * An EMPTY contract is rendered as an explicit NONE so the model never reads
 * "exports: " and invents imports from a file that exposes nothing.
 */
function describeExports(info: FileExportInfo | undefined): string {
  if (!info) return '(unknown — not yet generated)';
  const parts = [...(info.names || [])];
  // Render the member whitelist for class/interface exports so the model can
  // see exactly what it may call: `ChessBoard { getPiece, setPiece, clone }`.
  for (const name of info.names) {
    const members = info.members?.[name];
    if (members && members.length > 0) {
      parts.push(`${name} { ${members.join(', ')} }`);
    }
  }
  if (info.defaultName) {
    const members = info.members?.[info.defaultName];
    if (members && members.length > 0) {
      parts.push(`default ${info.defaultName} { ${members.join(', ')} }`);
    } else {
      parts.push(`default ${info.defaultName}`);
    }
  }
  return parts.length ? parts.join(', ') : 'NONE — do NOT import from this file';
}

/**
 * Extract the text inside the brace block starting at `start` (which points just
 * past an opening `{`). Returns the depth-1 body (outer braces excluded), or
 * null when the braces never close. Tracks strings/template literals so a `}`
 * inside a string can't terminate the block early.
 */
function extractBraceBody(code: string, start: number): string | null {
  let depth = 1;
  let i = start;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return code.slice(start, i);
    } else if (c === '"' || c === '\'' || c === '`') {
      // Skip string literals so braces inside strings are ignored.
      const quote = c;
      i++;
      while (i < n && code[i] !== quote) {
        if (code[i] === '\\') i++;
        i++;
      }
    } else if (c === '/' && code[i + 1] === '/') {
      while (i < n && code[i] !== '\n') i++;
    } else if (c === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i++;
    }
    i++;
  }
  return null;
}

/** True when two export contracts are identical (named + default + members). */
function sameExports(a: FileExportInfo | undefined, b: FileExportInfo | undefined): boolean {
  if (!a || !b) return a === b;
  if (a.defaultName !== b.defaultName) return false;
  const as = [...a.names].sort();
  const bs = [...b.names].sort();
  if (as.length !== bs.length || !as.every((n, i) => n === bs[i])) return false;
  // Member whitelists must match too — a changed member list means dependents
  // that call those members must regenerate.
  for (const name of as) {
    const am = [...(a.members?.[name] || [])].sort();
    const bm = [...(b.members?.[name] || [])].sort();
    if (am.length !== bm.length || !am.every((n, i) => n === bm[i])) return false;
  }
  return true;
}

export interface FileGenerationResult {
  files: GeneratedFile[];
  totalChars: number;
  totalErrors: number;
  validatedCount: number;
  failedCount: number;
  /** Map of nodeId → { entryFile, dependencies } for import graph */
  importGraph: Record<string, { entryFile: string; dependencies: string[]; exports: string[] }>;
  /** True when the live tsc compile-check loop ran and every TS/JS file passes —
   *  the authoritative verification verdict the training capture relies on. */
  tsCompileClean: boolean;
  /** Contract violations detected in the initial post-write scan across all
   *  files (imports of non-dependencies, or of members the target never
   *  exports). Repair-loop re-detections are not double-counted. */
  contractViolations: number;
}

/**
 * Progress callback type for streaming generation status to the frontend.
 */
export type GenerationProgressCallback = (progress: {
  /** 0-based batch index */
  batch: number;
  /** Total number of batches */
  totalBatches: number;
  /** Number of nodes in the current batch */
  batchSize: number;
  /** Labels of nodes currently being generated */
  generatingNodes: string[];
  /** Overall progress percentage (0-100) */
  percent: number;
  /** Phase description */
  phase: 'starting' | 'generating' | 'done' | string;
}) => void;

/**
 * Build a dependency graph from project edges.
 * Returns a map of node label → [labels it depends on]
 */
function buildDependencyGraph(
  nodes: { id: string; data: { label: string } }[],
  edges: { source: string; target: string }[]
): Map<string, string[]> {
  const graph = new Map<string, string[]>();

  // Build reverse dependency: if A → B edge, then B depends on A
  for (const edge of edges) {
    const sourceNode = nodes.find(n => n.id === edge.source);
    const targetNode = nodes.find(n => n.id === edge.target);
    if (!sourceNode || !targetNode) continue;

    const sourceLabel = sourceNode.data.label;
    const targetLabel = targetNode.data.label;

    if (!graph.has(targetLabel)) graph.set(targetLabel, []);
    const deps = graph.get(targetLabel)!;
    if (!deps.includes(sourceLabel)) deps.push(sourceLabel);
  }

  return graph;
}

/**
 * Get the file extension for a given language.
 */
export function getFileExtension(language: string): string {
  switch (language?.toLowerCase()) {
    case 'typescript': return 'ts';
    case 'javascript': return 'js';
    case 'python': return 'py';
    case 'go': return 'go';
    case 'rust': return 'rs';
    case 'cpp': case 'c++': return 'cpp';
    case 'csharp': case 'c#': return 'cs';
    case 'swift': return 'swift';
    case 'kotlin': return 'kt';
    case 'java': return 'java';
    case 'ruby': return 'rb';
    case 'php': return 'php';
    case 'html': return 'html';
    case 'css': return 'css';
    default: return 'ts';
  }
}

/**
 * Check whether a file extension matches the expected extension for a given language.
 */
export function extensionMatchesLanguage(ext: string, language: string): boolean {
  if (!ext || !language) return false;
  const langExt = getFileExtension(language);
  return ext.toLowerCase() === langExt.toLowerCase();
}

/**
 * Known file extensions that might appear in node labels.
 */
const KNOWN_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.rb', '.php',
  '.java', '.kt', '.swift', '.cpp', '.c', '.h', '.cs', '.css',
  '.html', '.scss', '.less', '.sql', '.json', '.xml', '.yaml', '.yml',
  '.md', '.sh', '.bash', '.dockerfile', '.toml', '.cfg', '.ini',
];

/**
 * Strip known file extensions from a label, returning [stripped_label, extension].
 * If no known extension is found, returns [original_label, ''] and keeps the original language-based extension.
 */
export function stripLabelExtension(label: string): { name: string; extOverride: string } {
  const lower = label.toLowerCase();
  for (const ext of KNOWN_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      return {
        name: label.slice(0, -ext.length),
        extOverride: ext.slice(1), // Remove the leading dot
      };
    }
  }
  return { name: label, extOverride: '' };
}

/**
 * Sanitize a label into a valid file name (without extension).
 * Export so generation routes can reuse without duplicating extension logic.
 */
export function labelToFileName(label: string): string {
  // Strip embedded extension first so we don't get "main.go" → "main-go" → "main-go.go"
  const { name } = stripLabelExtension(label);
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60) || 'untitled';
}

/**
 * Sanitize a label into a valid export/function name (camelCase).
 */
function labelToExportName(label: string): string {
  const sanitized = label.replace(/[^a-zA-Z0-9]/g, ' ');
  return sanitized
    .split(/\s+/)
    .map((word, i) => i === 0
      ? word.toLowerCase()
      : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join('')
    .replace(/^[0-9]/, '_$&') || 'Untitled';
}

/**
 * Stable signature of a project's node graph (labels, descriptions, types,
 * languages, edges, target OS), normalized so equal graphs always produce the
 * same signature regardless of array order. Used to reuse a cached generation
 * result when the canvas hasn't changed since it was generated.
 *
 * WHY: /api/generate/:id/files and /api/export/:id/per-file-scaffold both run
 * the LLM. Regenerating on export produced a DIFFERENT (non-deterministic)
 * codebase than the one the user just saw, and the scaffold's entry point
 * could import symbols that never appeared in the exported files. Caching the
 * last generation per project makes exports reuse exactly what was generated.
 */
export function projectGraphSignature(project: Project): string {
  const nodes = (project.nodes || [])
    .map((n: any) => ({
      id: n.id ?? '',
      label: n.data?.label ?? n.label ?? '',
      description: n.data?.description ?? '',
      type: n.data?.type ?? n.type ?? '',
      language: n.data?.language ?? '',
    }))
    .sort((a: any, b: any) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const edges = (project.edges || [])
    .map((e: any) => `${e.source ?? ''}->${e.target ?? ''}`)
    .sort();
  return JSON.stringify({ nodes, edges, targetOS: project.targetOS ?? '' });
}

/**
 * Build an import statement for one file depending on another.
 *
 * @param sourceFileName - The sanitized file name (e.g. "types-go")
 * @param sourceExports - Exported symbols from the source file
 * @param language - Target language
 * @param moduleName - Optional module/package name (required for Go to generate valid import paths)
 *                     e.g. "chess-game" → import "chess-game/src/types-go"
 */
/**
 * Sanitize a project name into a valid Go module path segment — must match the
 * scaffolder's go.mod module name (lowercase slug). Using the raw project
 * title (spaces, commas) produced `malformed import path ... invalid char ' '`
 * on every exported Go project.
 */
export function sanitizeGoModuleName(name: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
}

export function buildImportStatement(
  sourceFileName: string,
  sourceExports: FileExportInfo,
  language: string,
  moduleName?: string
): string {
  const ext = getFileExtension(language);
  const names = sourceExports.names || [];
  const exportsStr = names.length > 0
    ? `{ ${names.join(', ')} }`
    : '*';

  switch (language?.toLowerCase()) {
    case 'typescript':
    case 'javascript': {
      // IMPORTANT: node files live in PER-NODE subdirectories
      // (src/<node-label>/<file>.ts), so a cross-node import must walk UP one
      // level and into the dependency's directory: `../<dep>/<dep>.ts`.
      // A flat `./<dep>.ts` (relative to the importing node's own directory)
      // fails with TS2307 "Cannot find module" because the sibling module does
      // not live there.
      const tsPath = `../${sourceFileName}/${sourceFileName}.${ext}`;
      // A dependency that only default-exports must be imported as
      // `import X from '…'` — `import { X }` fails with TS2614. A dependency
      // with NO exports at all is imported for its side effects
      // (`import '…'`), never `import * from '…'` (a TS1005 syntax error).
      if (sourceExports.defaultName && names.length === 0) {
        return `import ${sourceExports.defaultName} from '${tsPath}';`;
      }
      if (sourceExports.defaultName) {
        return `import ${sourceExports.defaultName}, ${exportsStr} from '${tsPath}';`;
      }
      if (names.length === 0) {
        return `import '${tsPath}';`;
      }
      return `import ${exportsStr} from '${tsPath}';`;
    }
    case 'python':
      // Python can't import hyphenated directory names — convert to underscores
      const pyMod = sourceFileName.replace(/-/g, '_');
      if (names.length > 0) {
        return `from ${pyMod} import ${names.join(', ')}`;
      }
      return `from ${pyMod} import *`;
    case 'go':
      // Go requires full module import paths for subdirectories
      // e.g. import "chess-game/src/types-go"
      if (moduleName) {
        return `import "${moduleName}/src/${sourceFileName}"`;
      }
      return `import "${sourceFileName}"`;
    case 'rust':
      // Rust uses `use crate::mod_name::Export;` for cross-module imports.
      // The module name is derived from the source file name (hyphens → underscores).
      // Multiple exports must be wrapped in braces: `use crate::mod::{A, B, C};`
      const rustMod = sourceFileName.replace(/-/g, '_');
      if (names.length === 0) {
        return `use crate::${rustMod};`;
      } else if (names.length === 1) {
        return `use crate::${rustMod}::${names[0]};`;
      } else {
        return `use crate::${rustMod}::{${names.join(', ')}};`;
      }
    default:
      return `// import from ${sourceFileName}.${ext}`;
  }
}

/**
 * Post-write contract verifier for the CANVAS path: statically scan a
 * generated file's FINAL assembled code and verify every cross-file import
 * against the REAL export contracts of its dependencies (the fileExports map,
 * populated from the already-generated files it imports). Mirrors the
 * codePlanner post-write verifier, but the canvas path has no declared plan —
 * the dependency exports ARE the contract source of truth.
 *
 * Two violation classes, both rendered in the same TSxxxx format the repair
 * loop already feeds the model, so they flow into the existing fix pipeline
 * verbatim:
 *   - TS2307: imports a module that is not one of this file's dependencies
 *     (the AI importing a wrong sibling). Only flagged when the reference is
 *     UNAMBIGUOUSLY project-local (relative `../x`, `from .x`, `crate::x`,
 *     generator-layout Go paths) so stdlib/third-party imports can never
 *     false-positive.
 *   - TS2614: imports a member the target neither exports nor declares.
 *
 * Pure + best-effort (regex, not a compiler) — violations feed a repair pass,
 * they never hard-fail a build. For Python/Go/Rust, which have no live tsc
 * gate, this is the only static cross-file check the canvas path runs; for
 * TS/JS it is defense-in-depth on top of the tsc gate.
 */
export function verifyGeneratedCodeContracts(
  code: string,
  language: string,
  deps: string[],
  fileExports: Map<string, FileExportInfo>
): string[] {
  if (!deps.length) return [];
  const violations: string[] = [];
  // Comment-free scan copy so JSDoc/example comments mentioning imports can
  // never register a false hit (same discipline as findInventedMembers).
  const lang = language?.toLowerCase();
  let scanCode = code
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  // Per-language string handling so embedded code samples / docstrings can
  // never register a false import hit WITHOUT eating the quoted specifiers of
  // real imports (TS/JS and Go import paths are quoted strings — their quotes
  // are never stripped). Import regexes below are additionally anchored to
  // line start, matching where real import statements live in final code.
  if (lang === 'python') {
    // Python imports contain no quotes, so all string literals are safe to
    // strip (docstrings included); `#` comments are Python's comment syntax.
    scanCode = scanCode
      .replace(/#[^\n]*/g, '')
      .replace(/"""(?:[^"\\]|\\.|"(?!""))*"""/g, ' ')
      .replace(/'''(?:[^'\\]|\\.|'(?!''))*'''/g, ' ')
      .replace(/"(?:[^"\\]|\\.)*"/g, ' ')
      .replace(/'(?:[^'\\]|\\.)*'/g, ' ');
  } else if (lang === 'typescript' || lang === 'javascript') {
    // Only template literals (the common code-sample vehicle) — single-line
    // quoted strings stay, but their mid-line `import` text can't match the
    // line-anchored regexes below.
    scanCode = scanCode.replace(/`[^`]*`/g, ' ');
  } else if (lang === 'rust') {
    // `use` statements contain no quotes, so double-quoted strings are safe
    // to strip.
    scanCode = scanCode.replace(/"(?:[^"\\]|\\.)*"/g, ' ');
  }

  // Module token per dependency, in the form imports reference each language's
  // files: TS/JS `../<dep>/<dep>.ts` → `<dep>`; python/rust `-`→`_`; go the
  // last path segment of `"<module>/src/<dep>"`.
  const tokenToDep = new Map<string, string>();
  for (const dep of deps) {
    const fileName = labelToFileName(dep);
    const mod = lang === 'python' || lang === 'rust' ? fileName.replace(/-/g, '_') : fileName;
    if (!tokenToDep.has(mod)) tokenToDep.set(mod, dep);
  }

  const flagUnknownModule = (mod: string): void => {
    violations.push(
      `TS2307: Cannot find module '${mod}' — it is not a declared dependency of this file. Import ONLY from the dependencies listed in IMPORT TARGETS.`
    );
  };
  const flagMissingMember = (mod: string, member: string): void => {
    const dep = tokenToDep.get(mod);
    const info = dep ? fileExports.get(dep) : undefined;
    const available = info?.names?.length ? info.names.join(', ') : '(nothing — do not import from it)';
    violations.push(
      `TS2614: Module '${mod}' has no exported member '${member}'. ONLY these are exported: ${available}. Import a member that exists, or implement '${member}' locally.`
    );
  };
  const checkMembers = (mod: string, members: string[]): void => {
    const dep = tokenToDep.get(mod);
    if (!dep) return;
    const info = fileExports.get(dep);
    const provided = new Set(info?.names || []);
    for (const raw of members) {
      // Normalize `A as B` → `A` so aliased imports verify by real name.
      const member = raw.trim().split(/\s+as\s+/)[0]?.trim();
      if (member && member !== '*' && member !== 'default' && !provided.has(member)) {
        flagMissingMember(mod, member);
      }
    }
  };

  if (lang === 'typescript' || lang === 'javascript') {
    // Named imports (auto-built, plus any AI import that survived stripping):
    // `import { A, B } from '../dep/dep.ts'`, `import X, { A } from '...'`,
    // `import type { A } from '...'`.
    for (const m of scanCode.matchAll(/^\s*import\s*(?:type\s+)?(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/gm)) {
      const mod = m[2].split('/').pop()!.replace(/\.(ts|js|mjs|cjs)$/i, '');
      if (!tokenToDep.has(mod)) { flagUnknownModule(mod); continue; }
      checkMembers(mod, m[1].split(','));
    }
    // Default / namespace imports: `import X from '...'`, `import * as X from '...'`.
    // Members are never checked here (a default import is valid whenever the
    // target default-exports; the tsc gate is the authority for that), only the
    // module must be a declared dependency.
    for (const m of scanCode.matchAll(/^\s*import\s*(?:type\s+)?(?:\*\s+as\s+)?[A-Za-z_$][\w$]*\s+from\s*['"]([^'"]+)['"]/gm)) {
      const mod = m[1].split('/').pop()!.replace(/\.(ts|js|mjs|cjs)$/i, '');
      if (!tokenToDep.has(mod)) flagUnknownModule(mod);
    }
  } else if (lang === 'python') {
    // Member checks on `from <mod> import ...` when <mod> IS a known dep
    // (covers auto-built imports + surviving AI imports of real deps).
    for (const m of scanCode.matchAll(/^from\s+([\w.]+)\s+import\s+([\s\S]*?)$/gm)) {
      const mod = m[1].split('.')[0];
      if (!tokenToDep.has(mod)) continue; // stdlib/external — never flagged
      const items = m[2].trim();
      if (items === '*' || items.startsWith('(')) continue;
      checkMembers(mod, items.split(','));
    }
    // Unambiguous unknown-module: relative `from .x` / `from ..x` only.
    for (const m of scanCode.matchAll(/^from\s+(\.+[\w.]+)\s+import/gm)) {
      const mod = m[1].replace(/^\.+/, '').split('.')[0];
      if (mod && !tokenToDep.has(mod)) flagUnknownModule(mod);
    }
  } else if (lang === 'rust') {
    // `use crate::game;` | `use crate::game::ChessGame;` | `use crate::game::{A, B};`
    for (const m of scanCode.matchAll(/^\s*use\s+crate::([a-zA-Z_][\w]*)(?:::\{([^}]*)\}|::([a-zA-Z_][\w]*))?;?/gm)) {
      const mod = m[1];
      if (!tokenToDep.has(mod)) { flagUnknownModule(mod); continue; }
      const members = m[2] ? m[2].split(',') : m[3] ? [m[3]] : [];
      checkMembers(mod, members);
    }
  } else if (lang === 'go') {
    // `import "path"` and `import ( "a" "b" )`. Only the generator's own
    // `<module>/src/<dep>` layout is unambiguous — bare `"fmt"` / `"encoding/json"`
    // imports can never be flagged.
    for (const m of scanCode.matchAll(/^\s*import\s+((?:"[^"]+")|\(\s*(?:"[^"]*"\s*,?\s*)+\))/gm)) {
      for (const q of m[1].matchAll(/"([^"]+)"/g)) {
        const spec = q[1];
        if (!/\/src\//.test(spec)) continue;
        const mod = spec.split('/').pop()!.replace(/\.go$/, '');
        if (!tokenToDep.has(mod)) flagUnknownModule(mod);
      }
    }
  }
  return violations;
}

/**
 * Post-process TypeScript/JavaScript node code: strip AI-generated import
 * statements.
 *
 * The AI repeatedly emits its own sibling imports despite the prompt forbidding
 * them. Symptoms: the same module imported twice (TS2300 duplicate identifier),
 * extensionless relative paths (TS2307), and imports of files that do not exist
 * (TS2307). The build system adds dependency imports automatically, so ALL
 * top-level import statements are stripped — the auto-generated import section
 * is the single source of truth for cross-file imports.
 *
 * Hardened vs. the original "leading-run only" stripper, which let two failure
 * modes through (both observed in live builds):
 *   - `import{...}` without a space (the old /^import\s/ regex required one)
 *   - imports placed AFTER the first non-import statement (mid-file imports
 *     from the wrong sibling, e.g. importing a symbol from a file that does
 *     not export it)
 * Now any column-0 import statement is stripped (plus the full leading run),
 * and multi-line block imports (`import {` … `} from '...';`) are consumed
 * through their terminating `;`. Indented lines are left untouched so
 * template-literal / string content that merely contains the word "import"
 * is never corrupted.
 */
/**
 * Deterministic import-collision guard: collect every top-level name a TS/JS
 * file declares itself (`export class/interface/enum/function/const/let/type X`
 * or a bare `class/interface/enum/function/const/let/type X` at column 0).
 * assembleTsJs uses this to skip auto-importing the same name from a sibling
 * file — importing a name the file already declares breaks tsc with
 * TS2440/TS2395/TS2300, and the local declaration is the one other files will
 * import from anyway.
 *
 * Matches declaration keywords at line start (after optional `export` /
 * `declare` / `abstract`), so `const x = ...` inside a function body is never
 * mistaken for a top-level declaration.
 */
export function findLocalDeclaredNames(code: string): Set<string> {
  const names = new Set<string>();
  // export class Foo / export interface Foo / export function foo / export const foo / export type Foo / export enum Foo
  const declRe = /^(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(?:class|interface|enum|function|type|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(code)) !== null) {
    names.add(m[1]);
  }
  // Also handle `export { Foo, Bar }` re-export blocks (names still collide if
  // the file imports the same names).
  const reexportRe = /^export\s*\{[^}]*\}/gm;
  while ((m = reexportRe.exec(code)) !== null) {
    for (const nm of m[0].matchAll(/[A-Za-z_$][\w$]*/g)) {
      if (nm[0] !== 'export') names.add(nm[0]);
    }
  }
  return names;
}

export function postProcessTsJsCode(code: string): string {
  const lines = code.split('\n');
  const out: string[] = [];
  let inLeadingBlock = true;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    const atCol0 = line.length > 0 && line[0] !== ' ' && line[0] !== '\t';
    // Import statement anywhere at column 0 (or anywhere in the leading block).
    // Matches `import x`, `import{ x`, `import type {` and multi-line blocks.
    if (/^import(\s|\{)/.test(t) && (inLeadingBlock || atCol0)) {
      // Consume through the terminating `;` (multi-line block form), bounded
      // so a runaway match can never swallow the rest of the file.
      let stmt = line;
      let guard = 1;
      let terminated = false;
      i++;
      while (i < lines.length && !/;\s*$/.test(stmt.trim()) && guard < 8) {
        stmt += '\n' + lines[i];
        i++;
        guard++;
      }
      terminated = /;\s*$/.test(stmt.trim());
      // Only a REAL import statement is stripped: it must either contain
      // `from '...'` (named/default/namespace form) or be `import '...'`.
      // This keeps template-literal content at column 0 — a line starting
      // with the word "import" inside a string — from being eaten.
      const isImport = terminated && (
        /\bfrom\b/.test(stmt) || /^import\s*['"]/.test(stmt.trim())
      );
      if (isImport) {
        continue; // strip the whole statement
      }
      // Not an import statement after all (or the bound tripped) — restore
      // every consumed line so no legitimate content is ever dropped.
      out.push(...stmt.split('\n'));
      inLeadingBlock = false;
      continue;
    }
    if (inLeadingBlock && (t === '' || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*'))) {
      out.push(line); // keep comments/blank lines in the leading block
      i++;
      continue;
    }
    inLeadingBlock = false;
    out.push(line);
    i++;
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Post-process Go code generated by AI to fix structural issues.
 *
 * The AI often:
 * 1. Places import statements BEFORE the package declaration
 * 2. Generates its own import statements despite being told not to
 * 3. Generates duplicate func main() functions
 * 4. Uses invalid package names that shadow stdlib packages
 *
 * This function:
 * - Extracts the package declaration and moves it to line 1
 * - Strips AI-generated import statements (auto-generated imports are added separately)
 * - Removes any func main() from generated node files (only the root main.go should have it)
 * - Strips Go compilation comments/pseudo-code the AI sometimes inserts
 */
function postProcessGoCode(code: string): string {
  let cleaned = code.trim();

  // Step 1: Strip any Go compilation comments or pseudo-code annotations
  // that sometimes appear (e.g., "GO Code:", "```go", etc.)
  cleaned = cleaned.replace(/^(?:GO\s+Code|Go\s+Code|```(?:go)?)\s*:?\s*\n*/i, '');
  cleaned = cleaned.replace(/\n*```\s*$/i, '');
  cleaned = cleaned.trim();

  // Step 2: Extract the package declaration
  const packageMatch = cleaned.match(/^\s*package\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*$/m);
  let packageName = 'main'; // default fallback
  let codeWithoutPackage = cleaned;

  if (packageMatch) {
    packageName = packageMatch[1];
    // Remove the package line from its current position
    codeWithoutPackage = cleaned.replace(/^\s*package\s+[a-zA-Z_][a-zA-Z0-9_]*\s*$/m, '').trim();
  }

  // Step 3: Strip ALL import statements that appear at the top level
  // These are the AI-generated imports — they conflict with auto-generated imports
  codeWithoutPackage = codeWithoutPackage.replace(/^import\s+"[^"]+"\s*\n*/gm, '');
  codeWithoutPackage = codeWithoutPackage.replace(/^import\s+\([^)]*\)\s*\n*/gm, '');
  codeWithoutPackage = codeWithoutPackage.trim();

  // Step 4: Remove func main() { ... } with proper brace matching
  // The AI sometimes generates these in non-entry-point files
  codeWithoutPackage = removeGoMainFunction(codeWithoutPackage);

  // Step 5: Rebuild the file with proper structure
  const lines: string[] = [];
  lines.push(`package ${packageName}`);
  lines.push('');
  lines.push(codeWithoutPackage);

  return lines.join('\n');
}

/**
 * Remove a top-level `func main() { ... }` block from Go code
 * using brace counting to handle nested braces properly.
 * Only removes the FIRST occurrence.
 */
function removeGoMainFunction(code: string): string {
  // Match `func main()` with optional receiver and whitespace
  const mainRegex = /^func\s+main\s*\([^)]*\)\s*\{/m;
  const match = mainRegex.exec(code);
  if (!match) return code;

  const startIdx = match.index;
  let braceCount = 0;
  let endIdx = startIdx;
  let foundOpen = false;

  for (let i = startIdx; i < code.length; i++) {
    const ch = code[i];
    if (ch === '{') {
      braceCount++;
      foundOpen = true;
    } else if (ch === '}') {
      braceCount--;
      if (foundOpen && braceCount === 0) {
        endIdx = i + 1; // include the closing brace
        break;
      }
    }
  }

  // Remove from startIdx to endIdx, then clean up extra whitespace
  const before = code.substring(0, startIdx).trimEnd();
  const after = code.substring(endIdx).trimStart();
  return (before + '\n' + after).trim();
}

/**
 * Post-process Rust code generated by AI to fix structural issues.
 *
 * The AI often:
 * 1. Generates its own `use` statements despite being told not to
 * 2. Generates `fn main()` in non-entry-point files
 * 3. Forgets `pub` visibility on exports
 * 4. Wraps code in markdown fences
 *
 * This function:
 * - Strips markdown fences and pseudo-code annotations
 * - Strips AI-generated `use` statements (auto-generated via buildImportStatement)
 * - Strips any `mod` declarations (handled by the entry point)
 * - Removes `fn main()` from non-entry-point files
 */
function postProcessRustCode(code: string): string {
  let cleaned = code.trim();

  // Step 1: Strip markdown fences and Rust compilation annotations
  cleaned = cleaned.replace(/^(?:```(?:rust)?)\s*\n*/i, '');
  cleaned = cleaned.replace(/\n*```\s*$/i, '');
  cleaned = cleaned.trim();

  // Step 2: Strip any AI-generated `use` statements at the top of the file.
  // These conflict with the auto-generated use statements from buildImportStatement.
  cleaned = cleaned.replace(/^use\s+.+;\s*\n*/gm, '');
  cleaned = cleaned.trim();

  // Step 3: Strip any `mod` declarations — these are handled by the root entry point.
  cleaned = cleaned.replace(/^mod\s+[a-zA-Z_][a-zA-Z0-9_]*\s*(?:;|\{[^}]*\})\s*\n*/gm, '');
  cleaned = cleaned.trim();

  // Step 4: Remove `fn main() { ... }` with proper brace matching.
  // Only the root main.rs should have fn main().
  cleaned = removeRustMainFunction(cleaned);

  // Step 5: Ensure `pub` visibility on top-level declaration items.
  // AI often forgets to make items public, which breaks cross-module access.
  // We add `pub` before specific Rust declaration keywords at the start of a line.
  // This is SAFE because:
  //   - We only match lines starting with declaration keywords (fn, struct, enum, etc.)
  //   - We DON'T match closing braces, impl blocks, control flow, etc.
  //   - We DON'T match lines that already have `pub`
  cleaned = cleaned.replace(/^(?!pub\b)(fn|struct|enum|trait|type|const|static|union)\s/mg, 'pub $&');

  return cleaned;
}

/**
 * Remove a top-level `fn main() { ... }` block from Rust code
 * using brace counting to handle nested braces properly.
 * Only removes the FIRST occurrence.
 */
function removeRustMainFunction(code: string): string {
  // Match `fn main() { ... }` or `fn main() -> Result<...> { ... }`
  const mainRegex = /^fn\s+main\s*\([^)]*\)\s*(?:->\s*[^{]+)?\s*\{/m;
  const match = mainRegex.exec(code);
  if (!match) return code;

  const startIdx = match.index;
  let braceCount = 0;
  let endIdx = startIdx;
  let foundOpen = false;

  for (let i = startIdx; i < code.length; i++) {
    const ch = code[i];
    if (ch === '{') {
      braceCount++;
      foundOpen = true;
    } else if (ch === '}') {
      braceCount--;
      if (foundOpen && braceCount === 0) {
        endIdx = i + 1; // include the closing brace
        break;
      }
    }
  }

  // Remove from startIdx to endIdx, then clean up extra whitespace
  const before = code.substring(0, startIdx).trimEnd();
  const after = code.substring(endIdx).trimStart();
  return (before + '\n' + after).trim();
}

/**
 * Post-process Python code generated by AI to fix structural issues.
 *
 * The AI often:
 * 1. Generates `import` statements despite being told not to
 * 2. Generates `if __name__ == "__main__":` blocks with testing code
 * 3. Wraps code in markdown fences
 *
 * This function:
 * - Strips markdown fences
 * - Strips AI-generated `import` statements
 * - Removes `if __name__ == "__main__":` blocks (belongs in entry point only)
 * - Strips Python pseudo-code annotations
 */
function postProcessPythonCode(code: string): string {
  let cleaned = code.trim();

  // Step 1: Strip markdown fences and Python annotations
  cleaned = cleaned.replace(/^(?:```(?:python)?)\s*\n*/i, '');
  cleaned = cleaned.replace(/\n*```\s*$/i, '');
  cleaned = cleaned.trim();

  // Step 2: Strip AI-generated import statements at the top of the file.
  // These conflict with the auto-generated imports from buildImportStatement.
  cleaned = cleaned.replace(/^import\s+[\w.]+(?:\s+as\s+\w+)?\s*\n*/gm, '');
  cleaned = cleaned.replace(/^from\s+[\w.]+\s+import\s+.+\s*\n*/gm, '');
  cleaned = cleaned.trim();

  // Step 3: Remove `if __name__ == "__main__":` blocks with proper indentation tracking.
  // These belong only in the entry point, not in node files.
  cleaned = removePythonIfMainBlock(cleaned);

  return cleaned;
}

/**
 * Remove a top-level `if __name__ == "__main__":` block from Python code.
 * Uses indentation tracking to find the matching end of the block.
 * Only removes the FIRST occurrence.
 */
function removePythonIfMainBlock(code: string): string {
  // Match `if __name__ == "__main__":` or `if __name__ == '__main__':` at line start
  const mainRegex = /^if\s+__name__\s*==\s*["']__main__["']\s*:\s*$/m;
  const match = mainRegex.exec(code);
  if (!match) return code;

  const startIdx = match.index;
  const lineEndIdx = code.indexOf('\n', startIdx);
  if (lineEndIdx === -1) {
    // Single line if-block with no body — just remove it
    return code.substring(0, startIdx).trimEnd();
  }

  // The body starts on the next line — determine indentation
  const bodyStart = lineEndIdx + 1;
  const rest = code.substring(bodyStart);
  const bodyIndentMatch = rest.match(/^(\s+)\S/);
  if (!bodyIndentMatch) {
    // No body content — just remove the if line
    return code.substring(0, startIdx).trimEnd();
  }
  const bodyIndent = bodyIndentMatch[1];

  // Find end of the if-block: stop at a line with the same or less indentation as the `if`
  // The `if` itself is at indentation 0 (start of line)
  let endIdx = bodyStart;
  const lines = rest.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip empty lines and lines within the body (more indented than the body)
    if (line.trim() === '') {
      endIdx = bodyStart + lines.slice(0, i + 1).join('\n').length + 1;
      continue;
    }
    // Check if this line is at the same indentation as the `if` (0) or less
    const indent = line.match(/^(\s*)\S/);
    if (indent) {
      if (indent[1].length <= 0) {
        // Back to top-level — stop here
        break;
      }
      endIdx = bodyStart + lines.slice(0, i + 1).join('\n').length + 1;
    }
  }

  // Remove from startIdx to endIdx
  const before = code.substring(0, startIdx).trimEnd();
  const after = code.substring(endIdx).trimStart();
  return (before + '\n' + after).trim();
}

export class FileGenerator {
  private ai: AITranslator;
  private sandbox: SandboxRunner;
  /**
   * Actual generated source per node label, populated as files complete
   * (batch loop + repair loop). The per-file generation prompt injects the
   * REAL source of a file's dependencies (not just export names) so the model
   * codes against the actual shapes — the A/B tests showed 7B AND 14B models
   * fail cross-file contracts (private members, wrong shapes) purely because
   * they never see the dependency's code.
   */
  private depSourceCache = new Map<string, string>();

  constructor() {
    this.ai = new AITranslator();
    this.sandbox = new SandboxRunner();
  }

  /**
   * Generate individual files for each node in the project.
   * Each file gets standalone code with proper imports from dependency nodes.
   *
   * @param skipValidation - If true, skip sandbox validation on each generated file
   *                         (saves ~2-5s per file during preview builds)
   * @param onProgress - Optional callback invoked after each batch with progress info
   *                     (streams real-time generation status to the frontend via socket.IO)
   */
  async generateFiles(project: Project, skipValidation?: boolean, onProgress?: GenerationProgressCallback): Promise<FileGenerationResult> {
    const nonMasterNodes = project.nodes.filter(n => n.type !== 'master');
    const masterNode = project.nodes.find(n => n.type === 'master');

    if (nonMasterNodes.length === 0) {
      return {
        files: [],
        totalChars: 0,
        totalErrors: 0,
        validatedCount: 0,
        failedCount: 0,
        importGraph: {},
        tsCompileClean: true, // no TS/JS files → vacuously clean
        contractViolations: 0,
      };
    }

    // Build dependency graph from edges
    const depGraph = buildDependencyGraph(
      nonMasterNodes.map(n => ({ id: n.id, data: { label: n.data.label } })),
      project.edges
    );

    // Determine topological order for generation (dependencies first)
    const sortedNodes = this.topologicalSort(nonMasterNodes, depGraph);

    // ── Generate GUI widgets for UI/gui-layout nodes ──
    let guiWidgetOutput: Record<string, any> | null = null;
    const hasUINodes = sortedNodes.some(n => n.type === 'ui' || n.type === 'gui-layout');
    if (hasUINodes) {
      try {
        guiWidgetOutput = await this.generateGuiWidgets(project, sortedNodes);
      } catch (err) {
        console.warn('[fileGenerator] GUI widget generation failed (non-fatal):', err);
      }
    }

    // Generate files in dependency order — parallelized by topological batches
    const generatedFiles: GeneratedFile[] = [];
    const fileExports: Map<string, FileExportInfo> = new Map(); // label → export info
    let contractViolationCount = 0;

    // Batch nodes by topological depth: nodes in the same batch have NO
    // dependencies on each other and can be generated simultaneously.
    const batches = this.topologicalBatches(sortedNodes, depGraph);
    const totalBatches = batches.length;
    console.log(`[fileGenerator] Generating ${sortedNodes.length} files in ${totalBatches} parallel batch(es): ${
      batches.map((b, i) => `batch ${i + 1}: ${b.length} nodes`).join(', ')
    }`);

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      const startTime = Date.now();

      // Generate ALL nodes in this batch in parallel
      // Use allSettled so one failing node doesn't lose the rest of the batch
      const settledResults = await Promise.allSettled(
        batch.map(async (node) => {
          const nodeLabel = node.data.label || node.id;
          const fileName = labelToFileName(nodeLabel);
          const language = node.data.language || 'typescript';
          const ext = getFileExtension(language);

          // Determine dependencies for this node (from PREVIOUS batches only)
          const deps = depGraph.get(nodeLabel) || [];

          // Build import section from already-completed dependency exports
          let importSection = '';
          const resolvedDeps: string[] = [];

          for (const depLabel of deps) {
            const depExports = fileExports.get(depLabel);
            if (depExports) {
              const depFile = labelToFileName(depLabel);
              // Pass the project name as the Go module name for correct import paths
              importSection += buildImportStatement(depFile, depExports, language, sanitizeGoModuleName(project.name)) + '\n';
              resolvedDeps.push(depLabel);
            }
          }

          // Generate AI code for this node as a standalone file
          const isUINode = node.type === 'ui' || node.type === 'gui-layout';
          const code = await this.generateNodeFile(node, project, resolvedDeps, fileExports, isUINode ? guiWidgetOutput : null);

          // Determine what this file exports (named symbols + optional default)
          const exportInfo = this.extractExports(code, language);

          // ── Language-specific code assembly ──
          let fullCode: string;
          const lang = language?.toLowerCase();
          if (lang === 'go') {
            // For Go: post-process AI code first, then properly interleave imports
            const processedCode = postProcessGoCode(code);
            if (importSection) {
              // Insert auto-generated imports after the package declaration
              fullCode = processedCode.replace(/^(package\s+\S+\s*)$/m, '$1\n\n' + importSection);
            } else {
              fullCode = processedCode;
            }
          } else if (lang === 'rust') {
            // For Rust: post-process AI code, then prepend auto-generated use statements
            const processedCode = postProcessRustCode(code);
            fullCode = importSection
              ? importSection + '\n' + processedCode
              : processedCode;
          } else if (lang === 'python') {
            // For Python: post-process AI code, then prepend auto-generated imports
            const processedCode = postProcessPythonCode(code);
            fullCode = importSection
              ? importSection + '\n' + processedCode
              : processedCode;
          } else {
            // TS/JS: strip AI-generated imports (build system adds them).
            const tsCode = postProcessTsJsCode(code);
            if (deps.length > 0) {
              // Deterministic import-collision fix (mirror of assembleTsJs): if
              // this file declares a name locally, drop it from the auto-import
              // so it never collides (TS2440/TS2395/TS2300). Also dedupes names
              // exported by two different dependencies (TS2300 duplicate).
              const localNames = findLocalDeclaredNames(tsCode);
              const seenNames = new Set<string>();
              let filteredSection = '';
              const filteredDeps: string[] = [];
              for (const depLabel of deps) {
                const depExports = fileExports.get(depLabel);
                if (!depExports) continue;
                const names = (depExports.names || []).filter(n => !localNames.has(n) && !seenNames.has(n));
                for (const n of names) seenNames.add(n);
                if (names.length === 0 && !depExports.defaultName) continue;
                const filtered: FileExportInfo = { ...depExports, names };
                filteredSection += buildImportStatement(labelToFileName(depLabel), filtered, language, sanitizeGoModuleName(project.name)) + '\n';
                filteredDeps.push(depLabel);
              }
              importSection = filteredSection;
              // resolvedDeps is used by the contract verifier below — keep it in
              // sync with what actually got imported.
              resolvedDeps.length = 0;
              resolvedDeps.push(...filteredDeps);
            }
            fullCode = importSection
              ? importSection + '\n' + tsCode
              : tsCode;
          }

          // Run sandbox validation on the file (skippable for preview builds)
          let errors: string[] = [];
          let validated = false;
          if (!skipValidation) {
            try {
              const validation = await this.sandbox.run(fullCode, language);
              errors = validation.errors || [];
              validated = validation.success;
            } catch {
              errors = ['Sandbox validation unavailable'];
            }
          }

          // ── Post-write contract verification (all languages) ──
          // Statically verify the FINAL assembled code's cross-file imports
          // against the real export contracts of its dependencies. For TS/JS
          // the compile-check loop below repairs violations; Python/Go/Rust
          // have no tsc gate, so a violation marks the file failed and keeps
          // it out of the verified-training capture.
          const contractViolations = verifyGeneratedCodeContracts(fullCode, language, resolvedDeps, fileExports);
          if (contractViolations.length > 0) {
            errors.push(...contractViolations);
            validated = false;
            contractViolationCount += contractViolations.length;
            console.log(`[fileGenerator]   ⚠️ contract verifier: ${contractViolations.length} violation(s) on "${nodeLabel}" (e.g. ${contractViolations[0].slice(0, 90)}…)`);
          }

          // ── Contract check (report-only): the codegen contract bans default
          // exports ("named exports only"). Counted into contractViolations as a
          // quality signal but deliberately NOT fed to the repair loop or marked
          // as a failure — the import builder and scaffolder handle default
          // exports correctly, so flagging them as errors would just burn LLM
          // repair rounds without changing the build outcome.
          if (lang === 'typescript' || lang === 'javascript') {
            const defaultExportCount = (fullCode.match(/export\s+default/g) || []).length;
            if (defaultExportCount > 0) {
              contractViolationCount += defaultExportCount;
              console.log(`[fileGenerator]   ℹ️ contract check: ${defaultExportCount} default export(s) on "${nodeLabel}" (contract prefers named exports)`);
            }
          }

          // Use extension override from label ONLY if it matches the language
          const { extOverride } = stripLabelExtension(nodeLabel);
          const fileExt = (extOverride && extensionMatchesLanguage(extOverride, language)) ? extOverride : ext;

          // Record the finished source so LATER files (next batches) can see
          // this file's REAL code when it is one of their dependencies.
          this.depSourceCache.set(nodeLabel, fullCode);

          return {
            generatedFile: {
              fileName: `${fileName}.${fileExt}`,
              language,
              code: fullCode,
              nodeId: node.id,
              nodeLabel,
              dependencies: resolvedDeps,
              exports: exportInfo.names,
              errors,
              validated,
            },
            label: nodeLabel,
            exportSymbols: exportInfo,
          };
        })
      );

      // Collect results from this batch — skip any that failed
      // This populates fileExports for subsequent batches
      let batchFailures = 0;
      for (const result of settledResults) {
        if (result.status === 'fulfilled') {
          const val = result.value;
          generatedFiles.push(val.generatedFile);
          fileExports.set(val.label, val.exportSymbols);
        } else {
          batchFailures++;
          console.warn('[fileGenerator] Node generation failed in batch:', result.reason);
        }
      }
      if (batchFailures > 0) {
        console.warn(`[fileGenerator] ${batchFailures}/${batch.length} node(s) failed in batch ${batchIdx + 1}`);
      }

      const elapsed = Date.now() - startTime;
      console.log(`[fileGenerator] Batch ${batchIdx + 1}/${totalBatches} (${batch.length} nodes) completed in ${elapsed}ms`);

      // Report progress via callback (for Socket.IO broadcast to frontend)
      if (onProgress) {
        const completedNodes = settledResults
          .filter(r => r.status === 'fulfilled')
          .map(r => (r as PromiseFulfilledResult<any>).value.generatedFile.nodeLabel);
        onProgress({
          batch: batchIdx,
          totalBatches,
          batchSize: batch.length,
          generatingNodes: completedNodes,
          percent: Math.round(((batchIdx + 1) / totalBatches) * 100),
          phase: batchIdx < totalBatches - 1 ? 'generating' : 'done',
        });
      }
    }

    // ── Live compile-check-retry loop (generate → tsc → feed errors back → retry) ──
    // Mirrors the offline campaign repair loop, but runs LIVE during generation:
    // failing files are regenerated with the exact tsc errors as corrective
    // context, so the user gets compiling code on the first pass. Skipped for
    // fast preview builds (skipValidation=true) — the same builds that skip
    // sandbox validation.
    let compileFailures = 0;
    // True only when the live tsc loop ran to completion. If it was skipped
    // (no TS files, TSC_BIN missing, or a thrown error) the tsCompileClean
    // stamp must NOT be trusted for the training capture below.
    let compileCheckRan = false;
    if (!skipValidation) {
      try {
        compileFailures = await this.compileCheckAndFix(
          project, generatedFiles, fileExports, sortedNodes, depGraph, guiWidgetOutput
        );
        compileCheckRan = true;
      } catch (err) {
        console.warn('[fileGenerator] Live compile-check loop failed (non-fatal):', err);
      }
      if (compileFailures > 0) {
        console.warn(`[fileGenerator] ${compileFailures} file(s) still fail tsc after live compile-check retries`);
      } else {
        console.log('[fileGenerator] Live compile-check: all TS/JS files compile clean');
      }
    }

    // ── Generate a preview HTML wrapper that assembles all files into a runnable GUI ──
    const previewHtml = this.generatePreviewHtml(project, generatedFiles, fileExports);
    if (previewHtml) {
      generatedFiles.push(previewHtml);
    }

    // Same white-window fix as the chat path: the canvas GUI entry (index.html)
    // may reference external <script src>/<link href> files that the srcdoc
    // preview iframe cannot load. Inline them deterministically from the
    // sibling generated files so canvas GUI builds are previewable too.
    const inlinable = generatedFiles.map((f) => ({ path: f.fileName, content: f.code }));
    inlineExternalScriptRefs(inlinable);
    inlinable.forEach((m, i) => {
      generatedFiles[i].code = m.content;
    });

    // ── Close the learning loop: auto-capture VERIFIED generations into the
    //    training dataset. Only for real (non-preview) builds that passed the
    //    whole pipeline — compile-check with zero failures for TS/JS, plus
    //    sandbox-validated files for other languages. Broken output never
    //    enters the dataset. Non-fatal. ──
    //
    // compileCheckAndFix returns 0 BOTH when tsc passed AND when it was
    // skipped (missing TSC_BIN, or a thrown error). So the tsCompileClean
    // stamp is only trustworthy when there are TS/JS files AND the check
    // actually ran to completion. Pure non-TS builds have nothing to compile,
    // so non-TS files rely on their own sandbox-validated gate regardless.
    const hasTsJs = generatedFiles.some((f) => f.language === 'typescript' || f.language === 'javascript');
    const tsCompileClean = !hasTsJs || (compileCheckRan && compileFailures === 0 && fs.existsSync(TSC_BIN));
    // Blueprint-driven builds (POST /api/blueprint/build) capture their OWN
    // blueprint-enriched rows in the route, so the generic capture is skipped
    // for them (master data flag set by blueprintToProject) — one capture per
    // build, no duplicate rows with different instructions.
    const captureDisabled = masterNode?.data?.skipVerifiedCapture === true;
    if (!skipValidation && !captureDisabled && tsCompileClean) {
      try {
        const cap = await captureVerifiedGeneration(project, generatedFiles, { tsCompileClean: true });
        if (cap.captured > 0) {
          console.log(`[fileGenerator] Captured ${cap.captured} verified file(s) into training dataset (${cap.filePath})`);
        }
      } catch (err) {
        console.warn('[fileGenerator] Verified-generation capture failed (non-fatal):', err);
      }
    }

    // ── Close the knowledge-store learning loop (same verified gate as the
    //    training capture above — broken output never enters the store; the
    //    poison-loop quarantine's core principle). The OLD per-file hook
    //    passed raw pre-assembly model output and ran BEFORE generatedCode
    //    was written back to the project nodes, so learnFromProject's node
    //    loop always found empty code and silently no-oped — nothing was
    //    ever captured from the canvas path. Learn ONCE here, from the final
    //    assembled files, populating each node exactly like the frontend does
    //    after generation (updateNodeStatus). ──
    if (!skipValidation && !captureDisabled && tsCompileClean) {
      try {
        // Shallow-copy the project so learning never mutates the store's
        // live project object — only the copy carries generatedCode.
        const learnProject: Project = {
          ...project,
          nodes: project.nodes.map((n) => ({ ...n, data: { ...n.data } })),
        };
        for (const file of generatedFiles) {
          const node = learnProject.nodes.find((n) => n.id === file.nodeId);
          if (node && file.code && file.validated && file.nodeId !== 'preview_gui_wrapper') {
            node.data.generatedCode = file.code;
            node.data.status = 'valid';
          }
        }
        const fullAppCode = generatedFiles
          .filter((f) => f.nodeId && f.nodeId !== 'preview_gui_wrapper')
          .map((f) => f.code)
          .join('\n\n');
        const entries = learningEngine.learnFromProject(learnProject, fullAppCode, true);
        if (entries.length > 0) {
          console.log(`[fileGenerator] Learned ${entries.length} pattern(s) from project "${project.name}"`);
        }
      } catch (err) {
        console.warn('[fileGenerator] Knowledge-store learning failed (non-fatal):', err);
      }
    }

    // Build the import graph
    const importGraph: FileGenerationResult['importGraph'] = {};
    for (const file of generatedFiles) {
      importGraph[file.nodeId] = {
        entryFile: file.fileName,
        dependencies: file.dependencies,
        exports: file.exports,
      };
    }

    const totalChars = generatedFiles.reduce((sum, f) => sum + f.code.length, 0);
    const totalErrors = generatedFiles.reduce((sum, f) => sum + f.errors.length, 0);
    const validatedCount = generatedFiles.filter(f => f.validated).length;
    const failedCount = generatedFiles.filter(f => f.errors.length > 0).length;

    return {
      files: generatedFiles,
      totalChars,
      totalErrors,
      validatedCount,
      failedCount,
      importGraph,
      tsCompileClean,
      contractViolations: contractViolationCount,
    };
  }

  /**
   * Generate GUI widget data for UI/gui-layout nodes using the GuiBuilderTool.
   * Returns a structured GUI output that gets injected into UI node prompts.
   */
  private async generateGuiWidgets(
    project: Project,
    nodes: any[]
  ): Promise<Record<string, any> | null> {
    try {
      const registry = getRegistry();
      const guiBuilderTool = registry.get('gui_builder');
      if (!guiBuilderTool) return null;

      const masterNode = project.nodes.find((n: any) => n.type === 'master');
      const goal = masterNode?.data?.appGoal || project.name || 'Untitled';
      const purpose = masterNode?.data?.appPurpose || '';

      const uiNodes = nodes
        .filter(n => n.type === 'ui' || n.type === 'gui-layout')
        .map(n => ({
          label: n.data.label || n.id,
          description: n.data.description || '',
          type: (n.type === 'gui-layout' ? 'ui' : n.type) as 'input' | 'output' | 'logic' | 'database' | 'ui' | 'api',
          language: n.data.language || 'typescript',
        }));

      // Pattern stores are ON by default in GuiBuilderTool and were previously
      // hard-disabled here, starving the GUI layout of the UIVerse HTML/CSS
      // component library (data/ui-patterns/patterns.json) and the Rico real-
      // world screens dataset. Enabling them injects real UI component examples
      // into the design prompt, so generated GUIs follow proven patterns.
      // (Both stores degrade gracefully when the dataset files are absent.)
      // Web research stays off — it is slow and network-dependent; the local
      // pattern stores are the deterministic knowledge source for GUIs.
      const result = await guiBuilderTool.call({
        goal,
        purpose,
        targetOS: project.targetOS || 'linux',
        nodes: uiNodes,
        includeResearch: false,
        includeRicoPatterns: true,
        includeUiPatterns: true,
        widgetCount: Math.min(uiNodes.length * 3, 12),
      }, {} as any);

      if (result.success && result.data) {
        return result.data as Record<string, any>;
      }
      return null;
    } catch (err) {
      console.warn('[fileGenerator] GuiBuilderTool call failed:', err);
      return null;
    }
  }

  /**
   * Live compile-check-retry loop: scaffold the generated TS/JS files to a
   * temp directory (mirroring the per-file scaffolder layout so cross-node
   * `../<dep>/<dep>.ts` imports resolve), run `tsc --noEmit`, and for every
   * file that fails, feed the compiler errors back to the model and regenerate
   * that file. Repeats for up to `maxRounds` rounds.
   *
   * This is the live version of the offline campaign repair loop — it fixes
   * files BEFORE the user ever sees them, instead of in a post-hoc repair pass.
   *
   * Mutates `generatedFiles` entries in place (code, exports, errors,
   * validated) and updates `fileExports` so later rounds and the preview use
   * the corrected exports. Returns the number of files still failing after all
   * rounds.
   */
  /**
   * Re-assemble one node's raw LLM output into a final TS/JS file: strip
   * AI-written imports, then prepend the auto-generated dependency imports.
   * Shared by every compile-check repair-loop code path (failing files AND
   * contract-changed dependents) so they can never drift apart. The batch
   * loop pre-computes its import section before the AI call, so it keeps its
   * own inline assembly.
   */
  private assembleTsJs(
    code: string,
    deps: string[],
    fileExports: Map<string, FileExportInfo>,
    language: string,
    moduleName: string
  ): { fullCode: string; resolvedDeps: string[] } {
    const tsCode = postProcessTsJsCode(code);
    // Deterministic import-collision fix: this file's body may itself declare
    // a name (export class/interface/enum/function/const X) that a sibling
    // ALSO exports. Auto-importing that name then collides with the local
    // declaration → TS2440/TS2395/TS2300 ("Import declaration conflicts with
    // local declaration"). The local declaration wins (it is the file's own
    // contract, and other files import from THIS file's export list) — so drop
    // the colliding name from the auto-import. This is the types.ts failure
    // class from the triage builds, fixed without the LLM.
    const localNames = findLocalDeclaredNames(tsCode);
    let importSection = '';
    const resolvedDeps: string[] = [];
    // Cross-dep dedupe: when two dependencies both export the same name (e.g.
    // config.ts and main.ts both export `Config`), importing both breaks tsc
    // with TS2300 "Duplicate identifier". Keep the FIRST dependency's copy and
    // drop the name from the others — the first importer is the dependency
    // this file's plan lists first, so its contract wins.
    const seenNames = new Set<string>();
    for (const depLabel of deps) {
      const depExports = fileExports.get(depLabel);
      if (!depExports) continue;
      const names = (depExports.names || []).filter(n => !localNames.has(n) && !seenNames.has(n));
      for (const n of names) seenNames.add(n);
      // Skip a dependency entirely when every export it offers is shadowed by a
      // local declaration (importing nothing from it is the only correct move).
      if (names.length === 0 && !depExports.defaultName) continue;
      const filtered: FileExportInfo = { ...depExports, names };
      importSection += buildImportStatement(labelToFileName(depLabel), filtered, language, moduleName) + '\n';
      resolvedDeps.push(depLabel);
    }
    return {
      fullCode: importSection ? importSection + '\n' + tsCode : tsCode,
      resolvedDeps,
    };
  }

  /**
   * "Import targets" block for a repair prompt: what this file's dependencies
   * actually export — the model may ONLY reference these members. Prevents the
   * classic cross-file drift where the model invents methods/types that the
   * dependency never declared (TS2339/TS2304).
   */
  private buildImportTargets(deps: string[], fileExports: Map<string, FileExportInfo>, language: string): string {
    const MAX_DEP_SOURCE_CHARS = 4000;
    return deps
      .map(depLabel => {
        const src = this.depSourceCache.get(depLabel);
        const header = `  - ${labelToFileName(depLabel)}.${getFileExtension(language)} exports: ${describeExports(fileExports.get(depLabel))}`;
        if (src && src.trim().length > 10) {
          const capped = src.trim().length > MAX_DEP_SOURCE_CHARS
            ? src.trim().substring(0, MAX_DEP_SOURCE_CHARS) + '\n// ... (dependency truncated)'
            : src.trim();
          return `${header}\n    REAL SOURCE of ${labelToFileName(depLabel)}.${getFileExtension(language)} (fix against these EXACT shapes):\n    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${capped}\n    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
        }
        return header;
      })
      .join('\n');
  }

  /**
   * Static invented-member scan: for every class/interface this file imports
   * (whose member whitelist we know), flag `obj.member(` calls where `member`
   * is NOT in that type's whitelist. This catches TS2339-style drift BEFORE
   * tsc (and even when the model typed the variable loosely, so tsc missed it).
   * Returns TS2339-formatted error lines (consumed by the fix loop).
   */
  private findInventedMembers(
    code: string,
    deps: string[],
    fileExports: Map<string, FileExportInfo>
  ): string[] {
    const errors: string[] = [];
    // Scan a comment-free copy so JSDoc/example comments mentioning
    // `TypeName.member(` can never produce a false "invented member" hit.
    const scanCode = code
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    for (const depLabel of deps) {
      const info = fileExports.get(depLabel);
      if (!info?.members) continue;
      for (const [typeName, allowedMembers] of Object.entries(info.members)) {
        const allowed = new Set(allowedMembers);
        // Static calls on the type itself: `GameRulesEngine.parseFenString(`
        // (the build invented static members on whitelisted types too).
        const staticRe = new RegExp(`\\b${typeName}\\.([a-zA-Z_$][\\w$]*)\\s*\\(`, 'g');
        let sm: RegExpExecArray | null;
        while ((sm = staticRe.exec(scanCode)) !== null) {
          if (!allowed.has(sm[1])) {
            errors.push(
              `TS2339: Property '${sm[1]}' does not exist on type 'typeof ${typeName}'. ` +
              `ONLY these members exist: ${allowedMembers.join(', ') || '(none — call nothing on this type)'}. ` +
              `Implement '${sm[1]}' locally with the whitelisted members (or drop the call).`
            );
          }
        }
        // Find variables/params typed as this class/interface:
        // `foo: TypeName`, `(param: TypeName)`, `: TypeName =`
        const typedRe = new RegExp(`(?:^|[^\\w$])([a-zA-Z_$][\\w$]*)\\s*:\\s*${typeName}\\b`, 'g');
        const typedVars = new Set<string>();
        let m: RegExpExecArray | null;
        while ((m = typedRe.exec(scanCode)) !== null) {
          typedVars.add(m[1]);
        }
        if (typedVars.size === 0) continue;
        // Now flag `var.member(` where member is not whitelisted.
        const accessRe = new RegExp(`\\b(${[...typedVars].join('|')})\\.([a-zA-Z_$][\\w$]*)\\s*\\(`, 'g');
        let am: RegExpExecArray | null;
        while ((am = accessRe.exec(scanCode)) !== null) {
          const member = am[2];
          if (!allowed.has(member)) {
            errors.push(
              `TS2339: Property '${member}' does not exist on type '${typeName}'. ` +
              `ONLY these members exist: ${allowedMembers.join(', ') || '(none — call nothing on this type)'}. ` +
              `Implement '${member}' locally with the whitelisted members (or drop the call).`
            );
          }
        }
      }
    }
    return errors;
  }

  /**
   * Deterministic same-name collision lint: inside one class body, a field and
   * a method with the same name (or a method and a getter, etc.) break tsc
   * with TS2300/TS2391 ("Duplicate identifier"). The 7B model regularly emits
   * `winner: string | null` as a field AND `winner()` as a method (the
   * tic-tac-toe grid.ts failure class). Returns TS2300-formatted errors fed
   * into the same fix loop, with the exact rename so the model doesn't have to
   * guess. Best-effort brace matching — never hard-fails, only feeds repair.
   */
  private findSameNameCollisions(code: string): string[] {
    const errors: string[] = [];
    const classRe = /(?:^|[^\w$])class\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\{/g;
    let cm: RegExpExecArray | null;
    while ((cm = classRe.exec(code)) !== null) {
      const className = cm[1];
      // extractBraceBody expects `start` to point just PAST the opening `{`
      // (its depth counter starts at 1 for the body itself).
      const body = extractBraceBody(code, cm.index + cm[0].length);
      if (!body) continue;
      const fields = new Set<string>();
      const methods = new Set<string>();
      // Fields: `name: Type`, `name = value`, `name;` at member level
      for (const m of body.matchAll(/^(?:private|public|protected|readonly|static|declare|\s)*(?:#)?([A-Za-z_$][\w$]*)\s*(?::[^=;\n]+|=|;)/gm)) {
        fields.add(m[1]);
      }
      // Methods: `name(` / `get name(` / `set name(` at member level
      for (const m of body.matchAll(/^(?:private|public|protected|static|\s)*(?:async\s+)?(?:get|set)?\s*([A-Za-z_$][\w$]*)\s*\(/gm)) {
        methods.add(m[1]);
      }
      // A constructor is a method too but never collides as a field — ignore it
      methods.delete('constructor');
      for (const name of fields) {
        if (methods.has(name)) {
          errors.push(
            `TS2300: Duplicate identifier '${name}' — class '${className}' declares it as BOTH a property and a method. ` +
            `Rename the FIELD to '${name}Value' (or the method) so each identifier is unique, and update all references.`
          );
        }
      }
    }
    return errors;
  }

  private async compileCheckAndFix(
    project: Project,
    generatedFiles: GeneratedFile[],
    fileExports: Map<string, FileExportInfo>,
    sortedNodes: any[],
    depGraph: Map<string, string[]>,
    guiWidgetOutput: Record<string, any> | null,
    maxRounds: number = 3
  ): Promise<number> {
    const tsFiles = generatedFiles.filter(f => f.language === 'typescript' || f.language === 'javascript');
    if (tsFiles.length === 0) return 0;
    if (!fs.existsSync(TSC_BIN)) {
      console.warn('[fileGenerator] tsc not found — skipping live compile check');
      return 0;
    }

    // Files regenerated this pass — their sandbox result from the batch loop is
    // stale (it validated the PRE-fix code), so reset errors/validated from the
    // authoritative tsc result at the end.
    const regenerated = new Set<string>();

    for (let round = 1; round <= maxRounds; round++) {
      const errorsByLabel = await this.runTscCheck(tsFiles);
      // Static invented-member scan: flags `board.makeMove()` on whitelisted
      // types even when tsc misses it (loose typing). Merge into the same map
      // so the fix loop regenerates those files with the whitelist in the prompt.
      for (const f of tsFiles) {
        const deps = depGraph.get(f.nodeLabel) || [];
        const invented = this.findInventedMembers(f.code, deps, fileExports);
        if (invented.length > 0) {
          const existing = errorsByLabel.get(f.nodeLabel) || [];
          errorsByLabel.set(f.nodeLabel, [...existing, ...invented]);
          console.log(`[fileGenerator]   ⚠️ invented-member scan: ${invented.length} on "${f.nodeLabel}" (e.g. ${invented[0].slice(0, 90)}…)`);
        }
        // Deterministic same-name collision lint: a field and method sharing a
        // name in one class (TS2300) — the model cannot fix this blind because
        // tsc's error doesn't tell it which one to rename. The lint says it.
        const collisions = this.findSameNameCollisions(f.code);
        if (collisions.length > 0) {
          const existing = errorsByLabel.get(f.nodeLabel) || [];
          errorsByLabel.set(f.nodeLabel, [...existing, ...collisions]);
          console.log(`[fileGenerator]   ⚠️ same-name collision lint: ${collisions.length} on "${f.nodeLabel}" (e.g. ${collisions[0].slice(0, 90)}…)`);
        }
        // Hallucinated-runtime lint: the 7B model sometimes emits Deno./Bun.
        // globals (Deno.writeTextFile, Bun.serve) in plain TS intended for
        // node/browser — tsc errors TS2304 'Cannot find name Deno'. Flag it
        // explicitly so the repair prompt replaces the call with a node/browser
        // equivalent instead of guessing. Comment-free scan like the others.
        const runtimeRe = /\b(?:Deno|Bun)\.[A-Za-z_$][\w$]*/g;
        const runtimeHits = f.code.replace(/\/\/[^\n]*/g, '').match(runtimeRe) || [];
        if (runtimeHits.length > 0) {
          const existing = errorsByLabel.get(f.nodeLabel) || [];
          errorsByLabel.set(f.nodeLabel, [...existing, ...new Set(runtimeHits).values()].map(h =>
            `TS2304: Cannot find name '${h.split('.')[0]}' — this is a ${h.split('.')[0]} runtime API (${h}), but this project targets node/browser. Replace it with the standard node/browser equivalent (fs.writeFileSync / fetch / localStorage, etc.).`
          ));
          console.log(`[fileGenerator]   ⚠️ runtime-hallucination lint: ${runtimeHits.length} on "${f.nodeLabel}" (${runtimeHits[0]})`);
        }
        // Post-write contract verifier (import-level drift): imports of
        // non-dependencies, or of members the target never exports. Merged
        // into the same map so the repair loop regenerates the file with both
        // feeds — the generated code must honor the contracts, not just the
        // plan.
        const contractDrift = verifyGeneratedCodeContracts(f.code, f.language, deps, fileExports);
        if (contractDrift.length > 0) {
          const existing = errorsByLabel.get(f.nodeLabel) || [];
          errorsByLabel.set(f.nodeLabel, [...existing, ...contractDrift]);
          console.log(`[fileGenerator]   ⚠️ contract verifier: ${contractDrift.length} violation(s) on "${f.nodeLabel}" (e.g. ${contractDrift[0].slice(0, 90)}…)`);
        }
      }
      if (errorsByLabel.size === 0) return 0;

      console.log(`[fileGenerator] Compile-check round ${round}: ${errorsByLabel.size} file(s) failing — regenerating with compiler feedback`);
      // Files whose export CONTRACT changed this round — their dependents' auto
      // imports are built from that contract, so those dependents must be
      // regenerated too (otherwise they keep importing dead members).
      const contractsChanged = new Set<string>();
      for (const [label, errs] of errorsByLabel) {
        const file = generatedFiles.find(f => f.nodeLabel === label);
        const node = sortedNodes.find(n => (n.data?.label || n.id) === label);
        if (!file || !node) continue;

        const deps = depGraph.get(label) || [];
        const code = await this.generateNodeFile(node, project, deps, fileExports, guiWidgetOutput, errs, {
          // Feed the file's own previous content + the real export contracts of
          // its import targets so the model repairs WITH context instead of
          // regenerating blind (mirrors codePlanner's buildRepairPrompt).
          previousContent: file.code,
          importTargets: this.buildImportTargets(deps, fileExports, file.language),
        });

        const { fullCode, resolvedDeps } = this.assembleTsJs(code, deps, fileExports, file.language, project.name);
        const newInfo = this.extractExports(fullCode, file.language);
        if (!sameExports(fileExports.get(label), newInfo)) contractsChanged.add(label);
        file.code = fullCode;
        file.dependencies = resolvedDeps;
        file.exports = newInfo.names;
        fileExports.set(label, newInfo);
        this.depSourceCache.set(label, fullCode);
        regenerated.add(label);
      }          // Regenerate dependents of changed contracts so the whole graph converges.
      if (contractsChanged.size > 0) {
        for (const file of tsFiles) {
          if (errorsByLabel.has(file.nodeLabel) || regenerated.has(file.nodeLabel)) continue;
          const deps = depGraph.get(file.nodeLabel) || [];
          if (!deps.some(d => contractsChanged.has(d))) continue;
          const node = sortedNodes.find(n => (n.data?.label || n.id) === file.nodeLabel);
          if (!node) continue;
          console.log(`[fileGenerator]   └─ regenerating dependent "${file.nodeLabel}" (its dependency exports changed)`);
          const code = await this.generateNodeFile(node, project, deps, fileExports, guiWidgetOutput, [
            // Synthetic hint so the repair prompt (fixSection) renders with the
            // dependency contract context and the model re-imports correctly.
            `A dependency this file imports from changed its exported symbols. Re-import ONLY the members listed in IMPORT TARGETS below, and update your references to the renamed/removed ones.`,
          ], {
            previousContent: file.code,
            importTargets: this.buildImportTargets(deps, fileExports, file.language),
          });
          const { fullCode, resolvedDeps } = this.assembleTsJs(code, deps, fileExports, file.language, project.name);
          const info = this.extractExports(fullCode, file.language);
          file.code = fullCode;
          file.dependencies = resolvedDeps;
          file.exports = info.names;
          fileExports.set(file.nodeLabel, info);
          this.depSourceCache.set(file.nodeLabel, fullCode);
          regenerated.add(file.nodeLabel);
        }
      }
    }

    // Final check: mark which files still fail so the summary reflects reality.
    // Regenerated files that now pass get their stale pre-fix sandbox errors
    // cleared; still-failing files get the authoritative tsc errors.
    const finalErrors = await this.runTscCheck(tsFiles);
    for (const f of tsFiles) {
      const errs = finalErrors.get(f.nodeLabel);
      if (errs && errs.length > 0) {
        f.errors = errs;
        f.validated = false;
      } else if (regenerated.has(f.nodeLabel)) {
        f.errors = [];
        f.validated = true;
      }
    }
    return finalErrors.size;
  }

  /**
   * Scaffold the given TS/JS files into a temp dir (layout mirrors
   * PerFileScaffolder: `src/<safeName>/<file>`) and run
   * `tsc --noEmit --allowImportingTsExtensions -p <dir>`.
   * Returns Map<nodeLabel, string[]> of `TSxxxx: message (line N)` per failing
   * file (empty map = all compile clean).
   */
  private async runTscCheck(tsFiles: GeneratedFile[]): Promise<Map<string, string[]>> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vaca-tscheck-'));
    const srcDir = path.join(tmpDir, 'src');
    const relByLabel = new Map<string, string>();
    try {
      for (const f of tsFiles) {
        const safeName = labelToFileName(f.nodeLabel);
        const nodeDir = path.join(srcDir, safeName);
        fs.mkdirSync(nodeDir, { recursive: true });
        fs.writeFileSync(path.join(nodeDir, f.fileName), f.code, 'utf-8');
        relByLabel.set(f.nodeLabel, path.posix.join('src', safeName, f.fileName));
      }
      // Validation strictness matches the codePlanner runner (no `strict`):
      // this gate exists to catch STRUCTURAL failures — missing imports,
      // duplicate identifiers, unresolved cross-file members — not strict-null
      // nitpicks (TS2345 number|null vs number|undefined) that a 7b model
      // produces on otherwise-fine AI output.
      const tsconfig = {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: false,
          esModuleInterop: true,
          skipLibCheck: true,
          noEmit: true,
          allowImportingTsExtensions: true,
          rootDir: '.',
        },
        include: ['src/**/*.ts', 'src/**/*.js'],
      };
      fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));
      // The temp scaffold lives in /tmp, far from the backend's node_modules —
      // without @types/node the gate false-positives on TS2580 ('Cannot find
      // name process') in perfectly valid CLI code. Write a minimal ambient
      // declaration for the node globals the 7B model legitimately emits in
      // CLI/entry files (process, console is builtin). Keeps the gate honest:
      // it only reports STRUCTURAL errors, not missing-type-install noise.
      fs.writeFileSync(path.join(tmpDir, 'globals.d.ts'), [
        'declare const process: {',
        '  env: Record<string, string | undefined>;',
        '  argv: string[];',
        '  cwd(): string;',
        '  exit(code?: number): never;',
        '  stdout: { write(s: string): void };',
        '  stderr: { write(s: string): void };',
        '  on(event: string, cb: (...args: any[]) => void): void;',
        '};',
        '// Vite-style import.meta.env the 7B model legitimately emits in web/CLI code.',
        'interface ImportMeta {',
        '  env: { [key: string]: string | undefined; MODE: string; DEV: boolean; PROD: boolean } & Record<string, string | undefined>;',
        '  dirname: string;',
        '  filename: string;',
        '  url: string;',
        '}',
        'declare const require: any;',
        'declare const module: { exports: any };',
        'declare const __dirname: string;',
        'declare const __filename: string;',
        'declare function setTimeout(cb: () => void, ms: number): any;',
        'declare function setInterval(cb: () => void, ms: number): any;',
        'declare function clearTimeout(t: any): void;',
        'declare function clearInterval(t: any): void;',
        'declare const console: any;',
        'declare namespace NodeJS { export interface ProcessEnv { [key: string]: string | undefined } }',
        '',
      ].join('\n'), 'utf-8');

      let stdout = '';
      let stderr = '';
      try {
        const r = await execFileAsync('node', [TSC_BIN, '--noEmit', '--allowImportingTsExtensions', '-p', tmpDir], {
          cwd: tmpDir,
          timeout: 180000,
          maxBuffer: 8 * 1024 * 1024,
        });
        stdout = r.stdout;
        stderr = r.stderr;
      } catch (e: any) {
        stdout = e?.stdout || '';
        stderr = e?.stderr || '';
      }

      const byLabel = new Map<string, string[]>();
      const combined = `${stderr}\n${stdout}`;
      for (const line of combined.split('\n')) {
        const m = line.match(/^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/);
        if (!m) continue;
        const filePath = m[1].replace(/\\/g, '/');
        let label: string | undefined;
        for (const [lbl, rel] of relByLabel) {
          if (filePath.endsWith(rel)) { label = lbl; break; }
        }
        if (!label) continue;
        const errs = byLabel.get(label) || [];
        // m[4] already includes the "TS" prefix (e.g. "TS2614") — do not
        // double it, the repair prompt reads these verbatim.
        errs.push(`${m[4]}: ${m[5]} (line ${m[2]})`);
        byLabel.set(label, errs);
      }
      return byLabel;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  /**
   * Generate a single file for one node (public, for hot-swap regeneration).
   * Builds dependency context and calls the private generator.
   */
  async generateSingleFile(
    node: any,
    project: Project,
    dependencyLabels: string[]
  ): Promise<string> {
    const fileExports = new Map<string, FileExportInfo>();
    const code = await this.generateNodeFile(node, project, dependencyLabels, fileExports, null);
    return code;
  }

  /**
   * Determine which model tier to use for generating this node's code.
   * Simple/trivial files (configs, types, CSS, etc.) go to the fast coder model,
   * while complex logic (business logic, APIs, databases) stays on the primary model.
   */
  private pickModelTier(node: any, dependencyLabels: string[]): ModelTier {
    return classifyCodeComplexity(
      node.data?.label || node.id || '',
      node.data?.description || '',
      node.type || 'logic',
      node.data?.language || 'typescript',
      dependencyLabels.length
    );
  }

  /**
   * Generate code for a single node as an independent file.
   * The code includes the node's logic with proper function signatures
   * and exports so other files can import from it.
   *
   * Automatically routes simple files to the fast coder model (0.5B/1.5B)
   * and complex files to the primary model (7B).
   */
  private async generateNodeFile(
    node: any,
    project: Project,
    dependencyLabels: string[],
    fileExports: Map<string, FileExportInfo>,
    guiWidgetOutput: Record<string, any> | null,
    fixErrors?: string[],
    fixContext?: { previousContent?: string; importTargets?: string }
  ): Promise<string> {
    const nodeLabel = node.data.label || node.id;
    const language = node.data.language || 'typescript';
    const ext = getFileExtension(language);

    // Build context about what dependencies this node can use. Empty export
    // contracts render as an explicit NONE so the model never reads "exports:"
    // and invents imports from a file that exposes nothing.
    //
    // When a dependency's REAL source is available (generated in an earlier
    // batch or fixed in an earlier repair round), embed it directly — the model
    // must code against the ACTUAL shapes, not guessed ones. The A/B tests
    // showed 7B AND 14B models fail cross-file contracts (private members,
    // wrong member shapes) purely because they never see the dependency code:
    // the 14B wrote `private cells` in grid.ts and ai.ts then hit TS2341 on
    // game.cells. Source is capped per file to keep prompts in context.
    const MAX_DEP_SOURCE_CHARS = 4000;
    const depContext = dependencyLabels.length > 0
      ? `\n\nThis file can import from these sibling files (ONLY the declared exports — never invent members):\n${
          dependencyLabels.map(l => {
            const src = this.depSourceCache.get(l);
            const header = `  - ${labelToFileName(l)}.${ext} (exports: ${describeExports(fileExports.get(l))})`;
            if (src && src.trim().length > 10) {
              const capped = src.trim().length > MAX_DEP_SOURCE_CHARS
                ? src.trim().substring(0, MAX_DEP_SOURCE_CHARS) + '\n// ... (dependency truncated)'
                : src.trim();
              return `${header}\n    REAL SOURCE OF ${labelToFileName(l)}.${ext} (code against these exact shapes — members, fields, visibility, types):\n    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${capped}\n    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
            }
            return header;
          }).join('\n')
        }\n\nMEMBER WHITELIST RULE: on every class/interface imported from a sibling, you may ONLY call the members shown in braces (e.g. ChessBoard { getPiece, setPiece, clone }) or visible in the REAL SOURCE above. NEVER invent a method that is not listed (no board.makeMove(), board.evaluate(), etc.) — if you need that behavior, implement it locally as your own function using the whitelisted members. If a dependency shows NO braces and NO source, call nothing on it.`
      : '';

    // ── Client-only guard ──
    // Browser apps (ui node, no api/database nodes) must never get server-side
    // config hallucinated into them. The 2026-08-13 tic-tac-toe build shipped
    // DATABASE_URL/SECRET_KEY/API_KEY placeholders in config.ts — this prompt
    // constraint is the first line of defense; the security scan is the second.
    const hasUiNode = (project.nodes || []).some((n: any) => n.type === 'ui' || n.type === 'gui-layout');
    const hasServerNode = (project.nodes || []).some((n: any) => n.type === 'api' || n.type === 'database');
    const clientOnlySection = hasUiNode && !hasServerNode
      ? `\n\nIMPORTANT — CLIENT-ONLY APP: this project runs entirely in the browser (no server, no database).\n  - NEVER add server-side configuration: no DATABASE_URL, SECRET_KEY, API_KEY, API_PREFIX, process.env, or DB connections.\n  - NO placeholder values (yourApiKeyHere, yourSecretKeyHere, '...example', empty strings as real config).\n  - Any config constants must be REAL values the app actually uses (board size, theme colors, etc.).`
      : '';

    // ── Inject semantic connections (user-described wiring from a merge) ──
    // Edges created by the Connect & Describe dialog carry data.semantic with
    // the interpreted label/relation/codeHint. They create the import
    // dependency above AND tell the model HOW to implement the wiring, so the
    // two merged modules genuinely interoperate instead of merely importing.
    const semanticSection = buildSemanticSection(node, project);

    // ── Inject GUI widget context for UI nodes ──
    let guiContext = '';
    const isUINode = node.type === 'ui' || node.type === 'gui-layout';
    if (isUINode && guiWidgetOutput) {
      const widgetLines: string[] = [];
      widgetLines.push('');
      widgetLines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      widgetLines.push('📋 GENERATED GUI WIDGET LAYOUT');
      widgetLines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      widgetLines.push(`App: ${guiWidgetOutput.appName || 'Untitled'}`);
      widgetLines.push(`Layout: ${guiWidgetOutput.layout || 'single-page'}`);
      widgetLines.push(`Theme: ${guiWidgetOutput.theme || 'Default'}`);
      widgetLines.push('');

      if (guiWidgetOutput.colorScheme) {
        const cs = guiWidgetOutput.colorScheme;
        widgetLines.push('Color Scheme:');
        widgetLines.push(`  Primary: ${cs.primary || '#4a9eff'}`);
        widgetLines.push(`  Background: ${cs.background || '#1a1a2e'}`);
        widgetLines.push(`  Surface: ${cs.surface || '#16213e'}`);
        widgetLines.push(`  Text: ${cs.text || '#e0e0e0'}`);
        widgetLines.push(`  Accent: ${cs.accent || '#0f3460'}`);
        widgetLines.push('');
      }

      const widgets = guiWidgetOutput.widgets || [];
      if (widgets.length > 0) {
        widgetLines.push(`Generated ${widgets.length} UI widgets:`);
        for (const w of widgets.slice(0, 15)) {
          widgetLines.push(`  [${w.type}] ${w.label} — ${w.description || ''} (${w.zone || 'main'})`);
          if (w.bind?.onClick) widgetLines.push(`    onClick → ${w.bind.onClick}`);
          if (w.bind?.onChange) widgetLines.push(`    onChange → ${w.bind.onChange}`);
        }
        if (widgets.length > 15) {
          widgetLines.push(`  ... and ${widgets.length - 15} more widgets`);
        }
      }

      widgetLines.push('');
      widgetLines.push('INSTRUCTIONS: Generate UI component code that implements the widgets above.');
      widgetLines.push('Use the color scheme and layout as design guidelines.');
      widgetLines.push('Export a single function named `render` (or `init`) that accepts a container HTMLElement');
      widgetLines.push('and renders the UI into it. Do NOT use a default export — the preview wrapper calls');
      widgetLines.push('the named `render`/`init` function with the \'#app-container\' element.');
      widgetLines.push('');
      widgetLines.push('━━━ CONCRETE WIDGET TEMPLATES (build the SAME structure with document.createElement — never invent element types) ━━━');
      widgetLines.push(GUI_WIDGET_SECTION.trim());
      widgetLines.push(APP_QUALITY_RULES.trim());
      widgetLines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      guiContext = widgetLines.join('\n');
    }

    // Check for label/language extension mismatch (e.g., label "main.go" but language is "rust")
    const { extOverride } = stripLabelExtension(nodeLabel);
    const extMismatch = extOverride && !extensionMatchesLanguage(extOverride, language);
    const extClarification = extMismatch
      ? `

NOTE: The label "${nodeLabel}" has a .${extOverride} extension, but the selected language is ${language}.
The file will be saved as a .${ext} file containing ${language} code.
Generate ONLY ${language} syntax — do NOT use ${extOverride} syntax.`
      : '';

    // Determine language-specific hints for the AI prompt
    let languageHint = '';
    if (language?.toLowerCase() === 'go') {
      // Each Go file in a per-file architecture gets a package name based on its directory.
      // The sanitized label becomes both the directory name AND the Go package name.
      // IMPORTANT: Go does NOT allow multiple files in different directories with the same package name.
      const goPackageName = labelToFileName(nodeLabel).replace(/-/g, '');
      languageHint = `\n\nIMPORTANT — Go-specific rules:\n  - Start with: package ${goPackageName}\n  - The package name is "${goPackageName}" — derived from the node label.\n  - DO NOT use "package main" — each node file is its own package in its own directory.\n  - DO NOT include ANY import statements — they will be added automatically by the build system.\n  - DO NOT include func main() — this is not an entry point file.\n  - Start DIRECTLY with the package declaration, no text before it.`;
    } else if (language?.toLowerCase() === 'rust') {
      // Rust files in the per-file architecture are separate modules.
      // Each file is declared via #[path] in the root main.rs.
      // Cross-module access requires `pub` visibility on all exported items.
      languageHint = `\n\nIMPORTANT — Rust-specific rules:\n  - This file will be a separate Rust module, declared via #[path] in main.rs.\n  - Every function, struct, enum, trait, const, or type that other files need MUST be marked \`pub\`.\n  - Without \`pub\`, the item is private to this module and cannot be imported elsewhere.\n  - DO NOT include \`use\` statements — they will be added automatically by the build system.\n  - DO NOT include \`mod\` declarations — those are handled by the root main.rs.\n  - DO NOT include \`fn main()\` — this is not an entry point file.\n  - Use Rust 2021 edition syntax throughout.`;
    } else if (language?.toLowerCase() === 'python') {
      // Python files in the per-file architecture are separate packages.
      // Each node directory has an __init__.py that re-exports the main file.
      // The directory name uses underscores (not hyphens) for valid Python module naming.
      const pyModName = labelToFileName(nodeLabel).replace(/-/g, '_');
      languageHint = `\n\nIMPORTANT — Python-specific rules:\n  - This file will be a Python module inside a package directory named "${pyModName}".\n  - An __init__.py will re-export your definitions via \`from .${labelToFileName(nodeLabel)} import *\`.\n  - Define functions and classes that other modules can import.\n  - DO NOT include \`import\` or \`from ... import\` statements — they will be added automatically.\n  - DO NOT include \`if __name__ == \"__main__\":\` blocks — they belong in the entry point only.\n  - DO NOT include module docstrings at the top level (the __init__.py handles that).\n  - Start directly with your function/class/constant definitions.`;
    } else if ((language?.toLowerCase() === 'typescript' || language?.toLowerCase() === 'javascript') && isUINode) {
      // UI files are saved as plain .ts/.js (never .tsx/.jsx). Generated previews
      // inline the raw source, so JSX would fail both tsc and the browser.
      languageHint = `\n\nIMPORTANT — plain TS/JS rules for UI files:\n  - This file is a .${ext} file, NOT .tsx/.jsx.\n  - DO NOT use JSX syntax (no <div>, <button>, <li key=...>, etc.).\n  - Build DOM with document.createElement(), textContent, className, and appendChild().\n  - You may set innerHTML with static markup strings, but never from user input.\n  - DO NOT include any \`import\`/\`export\` statements — the build system adds imports automatically.\n  - Export ONE function named \`render\` (or \`init\`) that accepts a container HTMLElement and renders the UI into it. The preview wrapper calls it with the '#app-container' element.`;
    }

    // ── Compiler-feedback section (compile-check-retry loop) ──
    // When the previous attempt failed `tsc --noEmit`, feed the exact errors
    // back so the model can fix them on the retry, PLUS its own previous
    // content and the real export contracts of its import targets (mirrors
    // codePlanner's buildRepairPrompt). Without that context the model repairs
    // blind — it cannot fix cross-file drift ("Property 'x' does not exist on
    // type 'Y'") when the fix lives in the OTHER file's contract. The error
    // list is capped to keep the prompt small and focused.
    const fixSection = fixErrors && fixErrors.length > 0
      ? `\n\n⚠️ THE PREVIOUS VERSION OF THIS FILE FAILED TO COMPILE.\n${
          fixContext?.previousContent
            ? `\n━━━ CURRENT CONTENT (previous attempt) ━━━\n${fixContext.previousContent.substring(0, 6000)}\n`
            : ''
        }${
          fixContext?.importTargets
            ? `\n━━━ IMPORT TARGETS (may ONLY reference these declared exports) ━━━\n${fixContext.importTargets}\n`
            : ''
        }\n━━━ TSC ERRORS (fix ALL of them) ━━━\n${fixErrors.slice(0, 12).map(e => `  - ${e}`).join('\n')}\n\nRules for the corrected file:\n  - Keep the SAME exported symbol names (other files import them).\n  - This is a .${ext} file, NOT .tsx/.jsx — do NOT use JSX syntax (<div>, <button>).\n  - Build the DOM with document.createElement(), textContent, className, appendChild().\n  - Do NOT add import/export-from statements — the build system adds them.\n  - Do NOT include markdown, prose, or fences — code only.\n  - TypeScript: every variable/parameter/return must have a valid type; remove 'any' casts that break the code.\n  - Do NOT use TypeScript features the target doesn't support (e.g. JSX in .ts).\n  - If an error says a member does not exist on an imported type (TS2339), do NOT cast to 'any' and do NOT invent the member — call ONLY the members listed in braces in IMPORT TARGETS, or implement the behavior locally as your own helper using those whitelisted members.`
      : '';

    // Program scale from the master node (the size the user picked) — tailors
    // this file's depth to the target program size.
    const masterScale = project.nodes.find(n => n.type === 'master')?.data?.scale;
    const scaleSection = buildScaleSection(masterScale);

    // Blueprint bible constraints (blueprint-driven builds): the fused
    // checklist + wiring-graph section stored on the master node. Forces this
    // file to implement exactly its own checklist module and to use the wiring
    // contract names verbatim so sibling files connect without drift.
    const masterBlueprint = project.nodes.find(n => n.type === 'master')?.data?.blueprintContext;
    const blueprintSection = masterBlueprint
      ? `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nBLUEPRINT CONSTRAINTS (MANDATORY)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${masterBlueprint}\nTHIS FILE'S MODULE: "${nodeLabel}"\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      : '';

    // Build the prompt for a standalone file
    const prompt = `You are an expert ${language} developer${isUINode ? ' and UI/UX designer' : ''}. Generate a SINGLE standalone source file for the node "${nodeLabel}".

NODE DESCRIPTION:
${node.data.description || 'No description provided'}

NODE TYPE: ${node.type || 'logic'}
PROJECT: ${project.name}
TARGET OS: ${project.targetOS}
${scaleSection}${blueprintSection}
${depContext}${semanticSection}
${guiContext}${extClarification}${languageHint}${clientOnlySection}${fixSection}

REQUIREMENTS:
1. Generate COMPLETE, PRODUCTION-READY ${language} code for this specific node
2. The file should be a self-contained module with proper function/class definitions
3. Export the main functionality so other files can import it
4. Include type definitions/interfaces where appropriate
5. Include error handling and edge cases
6. Add clear comments for complex logic
7. DO NOT include import statements — those will be added automatically
8. The generated code will be the FILE BODY — define exports, classes, and functions only
9. Use NAMED exports only (export function/class/const Name). NEVER use \`export default\` — sibling files import your symbols by name, and a default export breaks their imports
10. Write the ACTUAL implementation — real logic, real method bodies. NO placeholder comments ('// TODO', '// define your properties here', '// add more methods as needed'), no empty stubs, no skeleton methods
11. Use ONLY built-in language/platform APIs and the standard library. NO third-party packages or frameworks (express, prisma, lodash, axios, react, better-sqlite3, node:assert, etc.) — nothing is installed and nothing can be imported. Implement persistence with plain in-memory structures, JSON, or built-in file APIs. If you need a library feature, implement a small local equivalent instead.

Return ONLY the code — no markdown, no explanations, no code fences.`;

    try {
      // ── Pick the right model tier for this file ──
      // Compiler-error fixes ALWAYS go to the primary (strongest) model — the
      // fast 0.5B/1.5B coder is too weak to repair tsc errors reliably.
      const tier = (fixErrors && fixErrors.length > 0)
        ? null
        : this.pickModelTier(node, dependencyLabels);

      let code: string;
      if (tier === 'fast-cpu' || tier === 'fast-gpu') {
        // Route to fast coder model (auto-picks best available: GPU1→GPU0→CPU)
        code = await this.ai.reasonFast(prompt, { maxTokens: 2048 });
        console.log(`[fileGenerator] Generated "${nodeLabel}" using fast coder (${tier === 'fast-cpu' ? 'CPU fallback' : 'GPU dedicated'})`);
      } else {
        // Route to primary 7B model (delegator — reserved for complex tasks).
        // Fix rounds use a LOW temperature so the model performs the repair
        // instead of reimagining the file (high temp makes it swap one invented
        // member for another each round instead of converging).
        const isFixRound = !!(fixErrors && fixErrors.length > 0);
        // 0.2: deterministic repair. Measured across 5 builds: 0.2 fix rounds
        // produced the best build (4 real errors) and beat 0.3 (which caused
        // fix-round drift: a 1-file-failing round-1 regressed to 6 files).
        code = await this.ai.reason(prompt, undefined, { maxTokens: 4096, temperature: isFixRound ? 0.2 : undefined });
        console.log(`[fileGenerator] Generated "${nodeLabel}" using 7B delegator (complex logic${isFixRound ? ', fix round @temp 0.2' : ''})`);
      }

      // Clean up any markdown fences the AI might add
      let cleaned = code.trim();
      const langPattern = (language || 'typescript').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      cleaned = cleaned.replace(new RegExp(`^\`\`\`(?:${langPattern}|typescript|javascript|python|go|rust)?\\s*\\n?`, 'i'), '');
      cleaned = cleaned.replace(/\n?```\s*$/i, '');
      cleaned = cleaned.trim();

      // ── Language-specific post-processing ──
      if (language?.toLowerCase() === 'go') {
        // Fix: Go doesn't allow "./" in the middle of import paths
        // e.g., "app-to-list-all-app/./src/config" → "app-to-list-all-app/src/config"
        // The AI sometimes generates "./" paths despite being told not to.
        //
        // This regex only matches inside "..." quotes where there's a leading /
        // before the ./. This is SAFE because:
        //   ✅ "module/./path" → matches (has /./)
        //   ❌ "./path" → no match (no / before ./)
        //   ❌ "../path" → no match (no / before ./)
        //   ❌ fmt.Println("./path") → no match (string not in quotes at regex level...
        //       actually it IS in quotes, but no leading / before ./)
        cleaned = cleaned.replace(/"([^"]+?)\/\.\/([^"]+)"/g, '"$1/$2"');
      }

      return cleaned || `// TODO: Implement ${nodeLabel}\nexport function ${labelToExportName(nodeLabel)}() {\n  // Auto-generated placeholder\n  throw new Error('Not implemented');\n}`;
    } catch (error) {
      console.error(`[fileGenerator] Failed to generate code for node ${nodeLabel}:`, error);
      return `// TODO: Implement ${nodeLabel}\nexport function ${labelToExportName(nodeLabel)}() {\n  // Code generation failed — implement manually\n  throw new Error('Not implemented');\n}`;
    }
  }

  /**
   * Extract exported symbols from generated code.
   */
  private extractExports(code: string, language: string): FileExportInfo {
    const names: string[] = [];
    let defaultName: string | undefined;

    switch (language?.toLowerCase()) {
      case 'typescript':
      case 'javascript': {
        // NOTE: all export regexes are anchored to a line start (allowing
        // leading whitespace) so comments/strings mentioning "export" can
        // never register a false export contract.
        // Named exports: `export function name`, `export const name`, etc.
        const exportRegex = /^\s*export\s+(?!default\b)(?:function|const|let|var|class|interface|type|enum)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/gm;
        let match;
        while ((match = exportRegex.exec(code)) !== null) {
          names.push(match[1]);
        }
        // `export { name1, name2 }` — ALL such blocks, not just the first.
        const namedRegex = /^\s*export\s*\{\s*([^}]+)\s*\}/gm;
        let namedMatch;
        while ((namedMatch = namedRegex.exec(code)) !== null) {
          namedMatch[1].split(',').forEach(e => {
            const n = e.trim().split(/\s+as\s+/)[0].trim();
            if (n && n !== 'default') names.push(n);
          });
        }
        // `export default Name` — captured so dependents can `import Name from`.
        // Handles BOTH `export default Foo` AND `export default class Foo` (the
        // latter must not capture the "class" keyword as the name).
        const defMatch = code.match(/^\s*export\s+default\s+(?:(?:abstract\s+)?(?:class|interface|enum|function)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)|([a-zA-Z_$][a-zA-Z0-9_$]*))/m);
        if (defMatch) defaultName = defMatch[1] || defMatch[2];
        // `export { X as default }` — also a default export.
        const asDefault = code.match(/^\s*export\s*\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s+as\s+default\s*\}/m);
        if (asDefault && !defaultName) defaultName = asDefault[1];

      // ── Member whitelist extraction (typescript/javascript) ──
      // For every exported class/interface, capture the member names inside its
      // body so dependents are told which members they may call. A member is any
      // `name`, `name(...)`, `name: ...`, `name = ...`, `readonly name`, or
      // optional `name?` at brace depth 1 of that declaration.
      const memberWhitelist: Record<string, string[]> = {};
      // ANY top-level class/interface declaration (optional export/default/abstract
      // modifiers). Members are only KEPT when the type is actually exported, so
      // `export class X`, `class X { ... } export { X }`, and `export default X`
      // styles all get whitelists (the model invented members on those too).
      const classDeclRe = /^\s*(?:export\s+(?:default\s+)?|declare\s+)?(?:abstract\s+)?class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)[^{]*\{/gm;
      // export interface Name { ... }
      const ifaceDeclRe = /^\s*(?:export\s+(?:default\s+)?|declare\s+)?interface\s+([a-zA-Z_$][a-zA-Z0-9_$]*)[^{]*\{/gm;
      const collectMembers = (typeName: string, body: string) => {
        // Skip the opening brace itself; capture depth-1 member declarations.
        // Matches: foo, foo(), foo(..): T, foo: T, foo = ..., readonly foo, foo?
        const memberRe = /(?:^|;|\n)\s*(?:readonly\s+|static\s+|private\s+|protected\s+|public\s+)*(?!if\b|for\b|while\b|return\b|throw\b|switch\b|const\b|let\b|var\b|new\b|else\b)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:\(|\?\s*[:;(]|\s*[:;=(]|\s*$)/g;
        const members = new Set<string>();
        let m: RegExpExecArray | null;
        while ((m = memberRe.exec(body)) !== null) {
          if (m[1] && !/^(?:if|for|while|return|throw|switch|const|let|var|new|else|get|set)$/.test(m[1])) {
            members.add(m[1]);
          }
        }
        // Also catch getters/setters and plain methods without type annotations.
        const methodRe = /(?:^|;|\n)\s*(?:get\s+|set\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
        while ((m = methodRe.exec(body)) !== null) {
          if (m[1] && !/^(?:if|for|while|return|throw|switch|new|else)$/.test(m[1])) {
            members.add(m[1]);
          }
        }
        if (members.size > 0) {
          memberWhitelist[typeName] = [...members];
        }
      };
      const exportedNames = new Set<string>([...(names || []), ...(defaultName ? [defaultName] : [])]);
      const classMatches = [...code.matchAll(classDeclRe)];
      for (const cm of classMatches) {
        if (!exportedNames.has(cm[1])) continue;
        const start = (cm.index || 0) + cm[0].length;
        const body = extractBraceBody(code, start);
        if (body) collectMembers(cm[1], body);
      }
      const ifaceMatches = [...code.matchAll(ifaceDeclRe)];
      for (const im of ifaceMatches) {
        if (!exportedNames.has(im[1])) continue;
        const start = (im.index || 0) + im[0].length;
        const body = extractBraceBody(code, start);
        if (body) collectMembers(im[1], body);
      }

      return {
        names: [...new Set(names)],
        defaultName,
        ...(Object.keys(memberWhitelist).length > 0 ? { members: memberWhitelist } : {}),
      };
    }
    case 'python': {
        // Match top-level def and class (not indented)
        const pyRegex = /^(?:async\s+)?(?:def|class)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm;
        let match;
        while ((match = pyRegex.exec(code)) !== null) {
          if (!match[1].startsWith('_')) names.push(match[1]);
        }
        break;
      }
      case 'go': {
        // Match exported functions/types (capitalized)
        const goRegex = /^func\s+([A-Z][a-zA-Z0-9_]*)|^type\s+([A-Z][a-zA-Z0-9_]*)/gm;
        let match;
        while ((match = goRegex.exec(code)) !== null) {
          names.push(match[1] || match[2]);
        }
        break;
      }
      case 'rust': {
        // Match `pub fn`, `pub struct`, `pub enum`, `pub trait`, `pub type`, `pub const`, `pub unsafe fn`
        const rustRegex = /^pub\s+(?:unsafe\s+)?(?:fn|struct|enum|trait|type|const|static|mod|use|macro|union)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm;
        let match;
        while ((match = rustRegex.exec(code)) !== null) {
          names.push(match[1]);
        }
        break;
      }
    }

    return { names: [...new Set(names)], defaultName };
  }

  /**
   * Topological sort of nodes based on dependency graph.
   * Ensures dependencies are generated before dependents.
   */
  private topologicalSort(nodes: any[], depGraph: Map<string, string[]>): any[] {
    const visited = new Set<string>();
    const sorted: any[] = [];
    const labelToNode = new Map<string, any>();

    for (const node of nodes) {
      labelToNode.set(node.data.label || node.id, node);
    }

    function visit(label: string) {
      if (visited.has(label)) return;
      visited.add(label);

      const deps = depGraph.get(label) || [];
      for (const dep of deps) {
        visit(dep);
      }

      const node = labelToNode.get(label);
      if (node) sorted.push(node);
    }

    for (const node of nodes) {
      visit(node.data.label || node.id);
    }

    return sorted;
  }

  /**
   * Group nodes into batches by topological depth using Kahn's algorithm.
   * Nodes in the same batch have NO dependencies on each other and can be
   * generated in parallel. Each batch waits for all previous batches to complete
   * so that import/export data is available when generating dependent nodes.
   *
   * Returns an array of batches, where each batch is an array of nodes.
   */
  private topologicalBatches(nodes: any[], depGraph: Map<string, string[]>): any[][] {
    // Build label → node map
    const labelToNode = new Map<string, any>();
    const allLabels = new Set<string>();
    for (const node of nodes) {
      const label = node.data.label || node.id;
      labelToNode.set(label, node);
      allLabels.add(label);
    }

    // Calculate in-degree (number of unprocessed deps) for each node
    const inDegree = new Map<string, number>();
    for (const label of allLabels) {
      const deps = (depGraph.get(label) || []).filter(d => allLabels.has(d));
      inDegree.set(label, deps.length);
    }

    const batches: any[][] = [];
    const remaining = new Set(allLabels);

    while (remaining.size > 0) {
      // Find all nodes with in-degree 0 (no remaining dependencies)
      const batchLabels: string[] = [];
      for (const label of remaining) {
        if ((inDegree.get(label) || 0) === 0) {
          batchLabels.push(label);
        }
      }

      // Guard against circular dependencies
      if (batchLabels.length === 0) {
        console.warn('[fileGenerator] Circular dependency detected — breaking by adding remaining nodes as a single batch');
        const emergencyBatch = Array.from(remaining).map(l => labelToNode.get(l)!).filter(Boolean);
        if (emergencyBatch.length > 0) batches.push(emergencyBatch);
        break;
      }

      // Map labels to nodes
      const batch = batchLabels.map(l => labelToNode.get(l)!).filter(Boolean);
      batches.push(batch);

      // Remove batch nodes from remaining
      for (const label of batchLabels) {
        remaining.delete(label);
      }

      // Decrease in-degree for nodes that depend on this batch
      for (const label of remaining) {
        const deps = (depGraph.get(label) || []).filter(d => allLabels.has(d));
        const depInBatch = deps.filter(d => batchLabels.includes(d)).length;
        if (depInBatch > 0) {
          inDegree.set(label, (inDegree.get(label) || 0) - depInBatch);
        }
      }
    }

    return batches;
  }

  /**
   * Generate a preview HTML wrapper that assembles all generated files into a standalone,
   * runnable GUI page — designed to work in an iframe via srcdoc (no external file imports).
   *
   * This creates an index.html that:
   *   - Inlines ALL CSS and JS/TS code directly (no module imports — those fail in srcdoc)
   *   - Detects entry-point exports (init, main, run, render, start, etc.) and calls them
   *   - Provides a dark-themed UI wrapper with loading spinner and error toast
   *   - Includes error boundaries so the app doesn't crash silently
   *   - Adds a <base> tag for relative image path resolution
   */
  private generatePreviewHtml(
    project: Project,
    generatedFiles: GeneratedFile[],
    fileExports: Map<string, FileExportInfo>,
    backendUrl?: string
  ): GeneratedFile | null {
    const jsFiles = generatedFiles.filter(f => f.language === 'javascript' || f.language === 'typescript');
    const cssFiles = generatedFiles.filter(f => f.language === 'css');
    const hasHtml = generatedFiles.some(f => f.language === 'html');

    // Skip if there's already an HTML file — we don't want to override it
    if (hasHtml) return null;

    // GUI-entry enforcement (mirrors the chat/CLI path): a GUI canvas project
    // MUST get a viewable index.html even when no web-language UI files were
    // produced yet (Python/Go UI nodes, failed generation, etc.). Headless
    // projects only get a wrapper when there's JS/CSS to assemble.
    const isGui = isGuiCanvasProject(project);
    if (jsFiles.length === 0 && !isGui) return null;

    const projectName = project.name || 'Untitled App';
    const masterNode = project.nodes.find((n: any) => n.type === 'master');
    const appGoal = masterNode?.data?.appGoal || '';

    // ── Build the CSS section (inline) ──
    const cssSection = cssFiles.length > 0
      ? cssFiles.map(f => `/* ${f.fileName} */\n${f.code}`).join('\n\n')
      : '';

    // ── Build the JS section ──
    // BUNDLE the TS/JS files with esbuild so cross-module imports actually
    // resolve inside the srcdoc iframe. The historical per-file IIFE wrapper
    // elided `import` statements, so any file importing a sibling crashed with
    // a ReferenceError (e.g. ui_screens importing ChessEngine from core-engine
    // on the chess build). Falls back to the legacy IIFE assembly when bundling
    // fails (bare package imports, unparseable code) so previews still render.
    const bundledJs = bundlePreviewJs(jsFiles);
    let jsScriptBlocks: string[] = [];
    let legacyNamespaces = '';
    let legacyInitCalls = '';
    if (bundledJs) {
      jsScriptBlocks.push(`<script>\n${bundledJs}\n</script>`);
    } else if (jsFiles.length > 0) {
      const legacy = assembleLegacyPreviewJs(jsFiles);
      legacyNamespaces = legacy.namespaceDeclarations;
      legacyInitCalls = legacy.initSetupCalls.join('\n');
      jsScriptBlocks.push(`<script>\n${legacy.jsSectionLines.join('\n\n')}\n</script>`);
    }

    // ── Build the full HTML ──
    const safeGoal = (appGoal || projectName).replace(/[<>&"]/g, c => ({'<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;'})[c] || c);
    const baseUrl = (backendUrl || 'http://localhost:3001').replace(/\/+$/, '');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <base href="${baseUrl}/">
  <title>${safeGoal}</title>
  <meta name="description" content="${safeGoal} — generated by VACA">
  <style>
    /* ── Base Reset ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; font-family: system-ui, -apple-system, sans-serif; }
    body { background: #0f0f1a; color: #e0e0e0; display: flex; flex-direction: column; }

    /* ── Error Toast ── */
    #error-toast { display: none; position: fixed; top: 12px; right: 12px; z-index: 9999;
      background: #ef4444; color: white; padding: 10px 16px; border-radius: 8px;
      font-size: 13px; max-width: 400px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: slideIn 0.2s ease-out; }
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

    /* ── Loading ── */
    #loading { display: flex; align-items: center; justify-content: center; height: 100vh;
      flex-direction: column; gap: 16px; color: #64748b; }
    #loading .spinner { width: 32px; height: 32px; border: 3px solid rgba(74,158,255,0.2);
      border-top-color: #4a9eff; border-radius: 50%; animation: spin 0.6s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    #loading-bar { width: 200px; height: 3px; background: rgba(74,158,255,0.15); border-radius: 4px; overflow: hidden; margin-top: 4px; }
    #loading-bar-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #4a9eff, #60a5fa); border-radius: 4px; animation: progress 1.5s ease-in-out infinite; }
    @keyframes progress { 0% { width: 0%; } 50% { width: 70%; } 100% { width: 100%; } }

    /* ── App Container ── */
    #app-container { flex: 1; display: flex; flex-direction: column; min-height: 0; }

    /* ── App-generated CSS ── */
${cssSection ? cssSection.split('\n').map(l => `    ${l}`).join('\n') : ''}
  </style>
</head>
<body>
  <div id="error-toast"></div>
  <div id="loading">
    <div class="spinner"></div>
    <span>Loading ${safeGoal}...</span>
    <div id="loading-bar"><div id="loading-bar-fill"></div></div>
  </div>
  <div id="app-container"></div>

  <script>
    // ── Global error boundary ──
    function addError(msg) {
      var toast = document.getElementById('error-toast');
      if (!toast) return;
      toast.textContent = '⚠️ ' + msg;
      toast.style.display = 'block';
      setTimeout(function() { toast.style.display = 'none'; }, 5000);
    }
    window.addEventListener('error', function(ev) { addError(ev.message || 'Unknown error'); });
    window.addEventListener('unhandledrejection', function(ev) { addError((ev.reason && ev.reason.message) || 'Unhandled rejection'); });${legacyNamespaces ? `
      // ── Declare module namespaces (used by the legacy IIFEs below) ──
      ${legacyNamespaces}` : ''}
  </script>

  <!-- ── Inline Generated JS (esbuild-bundled so cross-module imports resolve) ── -->
${jsScriptBlocks.join('\n\n')}

  <script>
    // ── Initialize app ──
    try {
      var loadingEl = document.getElementById('loading');
      var containerEl = document.getElementById('app-container');
      if (loadingEl) loadingEl.style.display = 'none';
      if (containerEl) containerEl.style.display = 'flex';
${legacyInitCalls}
      // GUI entry placeholder — only when there was NOTHING to assemble (no
      // web-language files). Apps that DO have JS render asynchronously may
      // legitimately mount nothing at init, so don't clobber them.
      // jsFiles is interpolated at build time (${jsFiles.length}) — a bare
      // reference would leak an undeclared identifier into the page and throw
      // a ReferenceError that blanks every GUI preview.
      if (containerEl && ${jsFiles.length} === 0 && !containerEl.children.length && !containerEl.textContent.trim()) {
        containerEl.innerHTML = '<div style="padding:48px 24px;text-align:center;color:#94a3b8;font-family:system-ui,sans-serif"><h2 style="color:#e2e8f0;margin:0 0 8px">${safeGoal}</h2><p style="margin:0 0 16px">This app\\'s interface is ready — generated code is below.</p><div style="font-size:12px;opacity:.7">Preview shell · VACA</div></div>';
      }
      console.log('✅ ${safeGoal} initialized successfully');
    } catch(e) {
      var loadingEl2 = document.getElementById('loading');
      if (loadingEl2) loadingEl2.innerHTML = '<div style="color:#ef4444;text-align:center">❌ Failed to initialize:<br><pre style="margin-top:8px;font-size:12px;color:#aaa">' + e.message + '</pre></div>';
      addError(e.message);
    }
  </script>
</body>
</html>`;

    return {
      fileName: 'index.html',
      language: 'html',
      code: html,
      nodeId: 'preview_gui_wrapper',
      nodeLabel: 'App Preview (Auto-generated)',
      dependencies: jsFiles.map(f => f.nodeLabel),
      exports: [],
      errors: [],
      validated: true,
    };
  }

  /**
   * Get the availability of sandbox tools for code validation.
   */
  getAvailability() {
    return this.sandbox.getAvailability();
  }
}

// ─── Preview JS assembly helpers ────────────────────────────────────────────

const PREFERRED_ENTRY_POINTS = ['init', 'main', 'run', 'render', 'start', 'createApp', 'setup', 'createUI'];

function previewNamespace(label: string): string {
  return label.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^([0-9])/, '_$1');
}

/**
 * Bundle the project's TS/JS files with esbuild into a single browser-safe
 * IIFE so cross-module imports actually resolve inside the srcdoc preview
 * iframe. Each file is written to a temp dir mirroring its label-based path
 * (`<label-dir>/<fileName>` — the same shape the generated import statements
 * reference, e.g. `../core-engine/core-engine.ts`), a virtual entry imports
 * every file as a module namespace and calls the preferred entry exports
 * (render/init/main/…) with #app-container, and esbuild resolves and inlines
 * everything.
 *
 * Returns the bundled code, or null when bundling fails (caller falls back to
 * the legacy IIFE assembly). Exported for tests.
 */
export function bundlePreviewJs(jsFiles: GeneratedFile[]): string | null {
  if (jsFiles.length === 0) return null;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vaca-preview-'));
  try {
    // Mirror the on-disk layout the generated import statements assume.
    for (const f of jsFiles) {
      const dir = path.join(tmp, labelToFileName(f.nodeLabel));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, f.fileName), f.code);
    }

    const entryPath = path.join(tmp, '_preview_entry.ts');
    const lines: string[] = [];
    for (const f of jsFiles) {
      lines.push(`import * as ${previewNamespace(f.nodeLabel)} from './${labelToFileName(f.nodeLabel)}/${f.fileName}';`);
    }
    for (const f of jsFiles) {
      if (f.exports.length === 0) continue;
      const ns = previewNamespace(f.nodeLabel);
      const foundEntry = PREFERRED_ENTRY_POINTS.find(name => f.exports.includes(name));
      const callName = foundEntry || f.exports[0];
      // Skip class constructors in the first-export fallback — a class is
      // typeof 'function' but must not be invoked without `new` (the chess
      // build's core_engine.ChessEngine tripped exactly this).
      const guard = foundEntry
        ? `typeof ${ns}.${callName} === 'function'`
        : `typeof ${ns}.${callName} === 'function' && !/^class\\s/.test(String(${ns}.${callName}))`;
      lines.push(
        `try { if (${guard}) { ${ns}.${callName}(document.getElementById('app-container')); } else { console.log('${f.fileName}: awaiting user interaction'); } } catch (e) { console.error('Error calling ${ns}.${callName}:', e); if (typeof addError === 'function') addError(e.message); }`
      );
    }
    fs.writeFileSync(entryPath, lines.join('\n'));

    const result = esbuildBuildSync({
      entryPoints: [entryPath],
      bundle: true,
      format: 'iife',
      target: 'es2017',
      write: false,
      logLevel: 'silent',
      loader: { '.ts': 'ts' },
    });
    return result.outputFiles[0].text;
  } catch (err) {
    console.warn('[preview] esbuild bundling failed, falling back to legacy IIFE assembly:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Legacy preview JS assembly: wraps each file in an IIFE that attaches its
 * exports to a per-file namespace object. Import statements are elided by
 * `stripTypeScriptKeepExports`, so cross-module calls do NOT work here — this
 * is only the fallback when esbuild bundling fails. Exported for tests.
 */
export function assembleLegacyPreviewJs(jsFiles: GeneratedFile[]): {
  namespaceDeclarations: string;
  jsSectionLines: string[];
  initSetupCalls: string[];
} {
  const jsSectionLines: string[] = [];
  const initSetupCalls: string[] = [];
  const namespaceDeclarations: string[] = [];

  for (const file of jsFiles) {
    const ns = previewNamespace(file.nodeLabel);
    // Use `var` not `const` — const declarations in one <script> block are NOT visible in other <script> blocks
    namespaceDeclarations.push(`var ${ns} = {};`);

    // Wrap code in an IIFE that assigns exports to the namespace
    // Escape backticks and `${` patterns in generated code so they don't break the outer template literal
    // Transpile TS to browser-safe JS first (keeps exports.* for the
    // IIFE namespace) — raw TS in the iframe throws SyntaxError.
    const rawCode = (file.language === 'typescript' || file.language === 'tsx')
      ? stripTypeScriptKeepExports(file.code)
      : file.code;
    const safeCode = rawCode.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
    jsSectionLines.push(`// ── ${file.fileName} ──`);
    jsSectionLines.push(`(function(exports) {\n${safeCode}\n})(typeof ${ns} !== 'undefined' ? ${ns} : {});`);

    // Detect entry point exports and call them
    if (file.exports.length > 0) {
      const foundEntry = PREFERRED_ENTRY_POINTS.find(name => file.exports.includes(name));
      if (foundEntry) {
        initSetupCalls.push(`  try { ${ns}.${foundEntry}(document.getElementById('app-container')); } catch(e) { console.error('Error calling ${ns}.${foundEntry}:', e); addError(e.message); }`);
      } else {
        // Call the first export as initialization — pass the resolved container
        // so UI functions that accept a container HTMLElement work in all paths.
        // Skip class constructors (typeof 'function' but must not be called
        // without `new`).
        initSetupCalls.push(`  try { if(typeof ${ns}.${file.exports[0]} === 'function' && !/^class\\s/.test(String(${ns}.${file.exports[0]}))) ${ns}.${file.exports[0]}(document.getElementById('app-container')); else console.log('${file.fileName}: awaiting user interaction'); } catch(e) { console.warn('${file.nodeLabel} init:', e); }`);
      }
    }
  }

  return {
    namespaceDeclarations: namespaceDeclarations.join(' '),
    jsSectionLines,
    initSetupCalls,
  };
}
