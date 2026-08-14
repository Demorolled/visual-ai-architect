/**
 * Code Planner Routes — Interactive CLI-style code generation
 * ===========================================================
 *
 * Instead of silently generating all code, this endpoint works like a CLI:
 *   1. User says "build me a todo app"
 *   2. LLM returns a structured plan: files to create, questions for the user
 *   3. User sees the plan and answers the questions
 *   4. LLM generates the actual code and writes the files
 *
 * This makes the LLM-1 Reasoning & Design feel like an interactive
 * terminal session — showing every step, asking for guidance.
 */

import { Router, Request, Response } from 'express';
import { AITranslator } from '../ai/translator.js';
import { cleanLLMResponse } from '../utils/responseCleaner.js';
import { loadPreference, type UiPreference } from './uiPreference.js';
import { getManifestoContext } from '../ai/manifesto.js';
import { getLibraryContext, getLibraryContextForNodeType } from '../ai/libraryContext.js';
import { getScaleSection, normalizeScale, type AppScale } from '../ai/prompts.js';
import { extractIntent, formatIntentSection, isLowConfidenceIntent, mergeIntentSpecs, type IntentSpec } from '../ai/intentExtractor.js';
import { captureVerifiedSidecar } from '../training/verifiedGenerationCapture.js';
import { broadcastGenerationProgress } from '../socket/socketManager.js';
// Shared GUI helpers (intent detection, widget templates, GUI-entry guarantee) —
// live in ../ai/guiShared.ts (neutral module); re-exported here so existing
// importers (tests, routes) keep working unchanged.
import { isGuiRequest, ensureGuiEntryFile, GUI_WIDGET_SECTION, APP_QUALITY_RULES, inlineExternalScriptRefs, stripTypeScript, type PlannedFile, type FileUse } from '../ai/guiShared.js';
export { isGuiRequest, ensureGuiEntryFile, GUI_WIDGET_SECTION, APP_QUALITY_RULES, inlineExternalScriptRefs, stripTypeScript, stripTypeScriptKeepExports } from '../ai/guiShared.js';
export type { PlannedFile, FileUse } from '../ai/guiShared.js';
import fs from 'fs';
import pathModule from 'path';
import { spawn } from 'child_process';

export const codePlannerRoutes = Router();
const translator = new AITranslator();

// ─── Safety timeouts ────────────────────────────────────────────
// A runaway LLM generation must never hang the route handler. These are passed
// to translator.reason(), which aborts the in-flight HTTP request via
// AbortSignal.timeout (also freeing the model slot) and surfaces a clean error.
const PLAN_TIMEOUT_MS = 180_000;   // plan reasoning is small (~2k tokens) — 3 min cap
const WRITE_TIMEOUT_MS = 600_000;  // per-call cap — a full one-shot at 12288 tokens takes ~4-6 min at ~30-50 tok/s (measured 364s at 33.7 tok/s); per-file calls are far smaller

// ─── Export-dir helpers ────────────────────────────────────────

/** Keep the exports folder tidy and predictable: exports/<slug>-<ts>/ */
function sanitizeSlug(s: string): string {
  return (s || 'code')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'code';
}

function getExportDir(request: string): string {
  const dir = pathModule.join(process.cwd(), 'exports', `${sanitizeSlug(request)}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Resolve a LLM-supplied relative path safely INSIDE the export dir. */
function safeJoin(exportDir: string, relPath: string): string {
  const rel = pathModule.normalize(relPath || 'file.txt').replace(/^(\\.\\.(\/|\\|$))+/, '');
  const full = pathModule.resolve(exportDir, rel);
  return full.startsWith(exportDir + pathModule.sep) ? full : pathModule.join(exportDir, 'file.txt');
}

// ─── User-context injection (profile + manifesto + library) ──────────────
// Part 2 of the intent upgrade: the WRITE path finally sees who the user is
// and what they want. Mirrors the injection pattern already used by the
// architect path (prompts.ts enrichWithKnowledge / getArchitectPrompt).

// Module-anchored (mirrors manifesto.ts / libraryContext.ts / user.ts) so the
// paths stay correct regardless of the process working directory.
const PROJECT_ROOT = pathModule.resolve(import.meta.dirname, '..', '..', '..');

interface UserProfileData {
  preferences?: Record<string, unknown>;
  styleTags?: string[];
}

let cachedUserProfile: UserProfileData | null = null;
let profileLoadedAt = 0;
const PROFILE_CACHE_TTL_MS = 10_000; // re-read from disk at most every 10s

/** Load the current user's profile.json (backend/users/<name>/profile.json). */
function loadUserProfile(): UserProfileData {
  const now = Date.now();
  if (cachedUserProfile !== null && (now - profileLoadedAt) < PROFILE_CACHE_TTL_MS) {
    return cachedUserProfile;
  }
  try {
    let username = 'default';
    try {
      const current = fs.readFileSync(pathModule.join(PROJECT_ROOT, 'profiles', 'current_user.txt'), 'utf-8').trim();
      if (current) username = current.replace(/[^a-zA-Z0-9_-]/g, '_');
    } catch { /* fall back to default */ }
    const profilePath = pathModule.join(PROJECT_ROOT, 'backend', 'users', username, 'profile.json');
    if (!fs.existsSync(profilePath)) {
      cachedUserProfile = {};
      profileLoadedAt = now;
      return {};
    }
    cachedUserProfile = JSON.parse(fs.readFileSync(profilePath, 'utf-8')) as UserProfileData;
    profileLoadedAt = now;
    return cachedUserProfile;
  } catch {
    cachedUserProfile = {};
    profileLoadedAt = now;
    return {};
  }
}

/** Build a compact USER PROFILE section from preferences + styleTags. */
function getUserProfileSection(): string {
  const profile = loadUserProfile();
  const lines: string[] = [];
  const tags = Array.isArray(profile.styleTags)
    ? profile.styleTags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).slice(0, 20)
    : [];
  if (tags.length) lines.push(`Style tags: ${tags.join(', ')}`);
  if (profile.preferences && typeof profile.preferences === 'object') {
    const prefs = Object.entries(profile.preferences)
      .filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false)
      .slice(0, 20)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
    if (prefs.length) lines.push(`Preferences: ${prefs.join('; ')}`);
  }
  if (!lines.length) return '';
  return `\n\n━━━ USER PROFILE ━━━\nThe user has told us their preferences. Honor them where they don't conflict with the direct request.\n${lines.map(l => `• ${l}`).join('\n')}`;
}

/**
 * Shared user-context blocks (profile + manifesto) injected into every prompt
 * composer (plan, one-shot write, per-file write). Returns only the non-empty
 * blocks, ready to spread into a parts array.
 */
function getUserContextSections(): string[] {
  const sections: string[] = [];
  const profile = getUserProfileSection();
  if (profile) sections.push(profile);
  const manifesto = getManifestoContext();
  if (manifesto) sections.push(`\n\n${manifesto}`);
  return sections;
}

/** Infer a node type from a file path (mirrors the canvas typing heuristic). */
function inferNodeTypeFromPath(filePath: string): string {
  const lower = filePath.toLowerCase();
  // Master/blueprint/architecture docs are the whole-project bucket.
  if (/(\bmaster\b|\bblueprint\b|architect|overview|roadmap|readme)/.test(lower)) return 'master';
  // HTML/CSS files are UI by definition — without this, index.html maps to
  // 'input' (the 'index' heuristic) and gets the wrong library context.
  if (/\.(html?|css)$/i.test(lower)) return 'ui';
  if (/(ui|view|screen|client|render|gui)/.test(lower)) return 'ui';
  if (/(db|database|store|storage|repo|model)/.test(lower)) return 'database';
  if (/(main|entry|input|io|cli|index|app)/.test(lower)) return 'input';
  return 'logic';
}

/**
 * Tally the planned files' node types and pick the DOMINANT one (argmax with a
 * deterministic tie-break: master > logic > ui > database > input) plus the
 * dominant language (most common). Returns null for an empty plan so callers
 * fall back to goal-based-only context.
 */
function getDominantNodeType(files: PlannedFile[] | undefined): { type: string; language: string } | null {
  if (!files || !files.length) return null;
  const typeCounts = new Map<string, number>();
  const langCounts = new Map<string, number>();
  for (const f of files) {
    // Untrusted LLM JSON: a file entry may lack a path — skip it (mirrors how
    // fileList tolerates missing paths) instead of throwing in .toLowerCase().
    if (!f || typeof f.path !== 'string' || !f.path.trim()) continue;
    const type = inferNodeTypeFromPath(f.path);
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    const lang = typeof f.language === 'string' ? f.language.trim().toLowerCase() : '';
    if (lang) langCounts.set(lang, (langCounts.get(lang) || 0) + 1);
  }
  const priority: Record<string, number> = { master: 5, logic: 4, ui: 3, database: 2, input: 1 };
  let bestType = '';
  let bestCount = 0;
  for (const [type, count] of typeCounts) {
    if (count > bestCount || (count === bestCount && (priority[type] || 0) > (priority[bestType] || 0))) {
      bestType = type;
      bestCount = count;
    }
  }
  if (!bestType) return null;
  let bestLang = '';
  let bestLangCount = 0;
  for (const [lang, count] of langCounts) {
    if (count > bestLangCount) {
      bestLang = lang;
      bestLangCount = count;
    }
  }
  return { type: bestType, language: bestLang };
}

/** Cap an injected context string so it can't starve the response token budget. */
function capInjection(text: string, maxChars: number): string {
  if (!text) return '';
  return text.length > maxChars ? text.substring(0, maxChars) + '\n…(truncated)' : text;
}

/**
 * The one-shot node-type context is drawn from the 'logic' | 'master' buckets
 * ONLY — the literal Part-2 contract (getLibraryContextForNodeType('logic'|'master')).
 * 'master' when the plan is dominated by master/blueprint files, otherwise
 * 'logic' (the most general code bucket). Other dominant types (ui/database/
 * input) normalize to 'logic' in the one-shot; the per-file path still uses the
 * exact file type.
 */
function resolveOneShotNodeType(dominant: { type: string } | null | undefined): string {
  return dominant && dominant.type === 'master' ? 'master' : 'logic';
}

/**
 * Which library-context strategy the one-shot WRITE prompt uses. Switchable
 * per request so the goal-based vs node-type strategies can be A/B measured:
 *   - 'goal'     (baseline): full 1800-char budget to goal-based context only
 *   - 'hybrid'   (default) : 900 goal-based + 900 node-type when dominant known
 *   - 'dominant' (replacement): full 1800-char budget to node-type context only
 *                              (getLibraryContextForNodeType REPLACES getLibraryContext)
 */
type LibraryMode = 'goal' | 'hybrid' | 'dominant';

/** Accept 'goal'|'hybrid'|'dominant' from a request body; anything else -> hybrid. */
function normalizeLibraryMode(v: unknown): LibraryMode {
  return v === 'goal' || v === 'dominant' ? v : 'hybrid';
}

/**
 * Compose the WRITE system prompt (one-shot or chunked) with user context
 * injected: profile + manifesto + library context.
 *
 * The library budget (1800 chars total) is SPLIT when a dominant node type is
 * known: 900 chars of goal-based context (the request topic — game vs web vs
 * CLI) + 900 chars of node-type context from getLibraryContextForNodeType with
 * the node type constrained to 'logic' | 'master' (the literal contract).
 * Without a dominant type (no plan), the full 1800 goes to goal-based context.
 *
 * Modes (see LibraryMode): 'goal' and 'dominant' apply the FULL budget to a
 * single strategy — 'dominant' is the REPLACEMENT variant that swaps
 * getLibraryContext(request) for getLibraryContextForNodeType(dominantType,
 * dominantLang) entirely, for A/B comparison against the goal baseline.
 * NOTE: dominantType is the RESOLVED one-shot type (logic|master, via
 * resolveOneShotNodeType) — a ui/database/input-dominant plan still measures
 * 'logic' context at full budget, per the established one-shot contract.
 *
 * `basePrompt` defaults to WRITE_PROMPT (one-shot: write EVERY file). The
 * chunked path passes CHUNK_WRITE_PROMPT so the SYSTEM prompt agrees with the
 * chunk's user-prompt instruction ("only THIS CHUNK") — otherwise a weak model
 * obeys the system prompt and writes everything, reintroducing the token cap.
 */
function getWritePromptWithContext(
  request: string,
  dominant?: { type: string; language: string } | null,
  mode: LibraryMode = 'hybrid',
  basePrompt: string = WRITE_PROMPT
): string {
  const parts: string[] = [basePrompt, ...getUserContextSections()];
  const library = getLibraryContextBlock(request, dominant, mode);
  if (library) parts.push(`\n\n${library}`);
  return parts.join('\n');
}

/**
 * The effective library-context block for a write prompt — the exact caps and
 * strategy the composer injects: 'dominant' → node-type context at 1800;
 * 'hybrid' with a dominant type → 900 goal-based + 900 node-type; otherwise
 * goal-based at 1800. Extracted so generatePlanFiles can RETURN the effective
 * block for the training sidecar (fidelity: the LoRA learns from exactly what
 * the model saw), while getWritePromptWithContext injects the same block.
 */
function getLibraryContextBlock(
  request: string,
  dominant?: { type: string; language: string } | null,
  mode: LibraryMode = 'hybrid'
): string {
  const hasDominant = !!(dominant && dominant.type);
  if (mode === 'dominant' && hasDominant) {
    return capInjection(
      getLibraryContextForNodeType(resolveOneShotNodeType(dominant), dominant!.language),
      1800
    );
  }
  if (mode === 'hybrid' && hasDominant) {
    const goalLib = capInjection(getLibraryContext(request), 900);
    const nodeLib = capInjection(
      getLibraryContextForNodeType(resolveOneShotNodeType(dominant), dominant!.language),
      900
    );
    return [goalLib, nodeLib].filter(Boolean).join('\n\n');
  }
  return capInjection(getLibraryContext(request), 1800);
}

/**
 * Compose the per-file FILE_WRITE system prompt with user context for THAT
 * file: profile + manifesto + getLibraryContextForNodeType(nodeType, language).
 */
function getFileWritePromptWithContext(file: PlannedFile): string {
  const parts: string[] = [FILE_WRITE_PROMPT, ...getUserContextSections()];
  const library = capInjection(getLibraryContextForNodeType(inferNodeTypeFromPath(file.path), file.language), 1500);
  if (library) parts.push(`\n\n${library}`);
  return parts.join('\n');
}

/**
 * Detect when the request explicitly names ONE file ("a python script named
 * main.py", "a server named server.js", "an index.html that ..."). Such
 * requests MUST be planned as exactly that single file — the model otherwise
 * over-engineers them into multi-file projects with runtime contract
 * mismatches (the build-ladder s10/e09/e12/e17 failures: 4 files for a
 * one-script request, TypeScript modules a browser cannot run, index.html
 * planned as src/main.ts, and TS syntax leaked into .js files).
 */
function getSingleFileSection(request: string): string {
  const named = /\bnamed\s+([A-Za-z0-9_.-]+\.(?:py|js|ts|sh|html?))\b/i;
  const saysSingle = /\b(?:a|one|single)\s+(?:python|node|javascript|typescript|bash|shell|script|file|program|app|server)\b/i;
  const mentionsIndexHtml = /\bindex\.html\b/i.test(request);
  const mentionsServerJs = /\bserver\.js\b/i.test(request);
  const fname = named.test(request) && saysSingle.test(request) ? named.exec(request)![1] : null;
  if (!fname && !mentionsIndexHtml && !mentionsServerJs) return '';
  const rules: string[] = [];
  if (fname) {
    rules.push(`The user explicitly asked for ONE file named "${fname}". The plan MUST contain EXACTLY that one file — put the entire working app inside it. NEVER split into multiple files, NEVER add extra files (no index.html, no helpers, no second script).`);
  }
  if (mentionsIndexHtml) {
    rules.push(`The user explicitly asked for an "index.html" — the plan MUST include index.html as the single entry file of a self-contained browser app. ALL JavaScript must be plain vanilla JavaScript (inline <script> or a .js file) — NEVER TypeScript (.ts/.tsx): the browser preview has no build step and cannot compile TypeScript.`);
  }
  if (mentionsServerJs) {
    rules.push(`The user explicitly asked for "server.js" — the plan MUST include server.js as the entry, written in PURE JavaScript (no TypeScript annotations, no extension-less ESM imports, no npm packages unless the request names them). If the request says "built-in http module", use ONLY Node built-ins (http, fs, url).`);
  }
  if (!fname || fname.endsWith('.py') || fname.endsWith('.sh')) {
    rules.push(`That single file must be directly runnable and must ACTUALLY RUN when executed: it must call its main logic at the top level (for python add an \`if __name__ == '__main__':\` guard or a top-level call; for node, invoke the server or run the logic). Defining functions but never calling them is a FAILURE — the script must print/output the requested results when run.`);
  }
  return `\n\n━━━ SINGLE-FILE REQUEST (MANDATORY) ━━━\n${rules.join('\n')}`;
}

/**
 * Compose the PLAN system prompt with user context injected — profile +
 * manifesto + goal-based library (capped) — in addition to the global UI
 * preference and an optional explicit SCALE override (small/medium/large/
 * enterprise). This makes the clarifying questions the model asks already
 * respect the user's stated preferences (e.g. a dark-theme preference means
 * the model won't ask "what theme?", and a cli preference suppresses the
 * CLI-vs-GUI question), and makes a 'large' request plan 25–45 files instead
 * of a 3-file skeleton.
 */
function getPlanPromptWithContext(request: string, preference: UiPreference, scale?: AppScale | string): string {
  const parts: string[] = [getPlanPromptWithPreference(preference), ...getUserContextSections()];
  const singleFile = getSingleFileSection(request);
  if (singleFile) parts.push(singleFile);
  const scaleSection = getScaleSection(scale);
  if (scaleSection) parts.push(scaleSection);
  const library = capInjection(getLibraryContext(request), 1500);
  if (library) parts.push(`\n\n${library}`);
  return parts.join('\n');
}

// ─── Types ───────────────────────────────────────────────────────────────

interface ClarifyingQuestion {
  key: string;
  question: string;
  options?: string[];
  type?: 'choice' | 'text';
}

interface CodePlan {
  reasoning: string;
  files: PlannedFile[];
  questions: ClarifyingQuestion[];
}

/**
 * Normalize plan questions into the structured schema.
 *
 * Accepts BOTH legacy string questions ("Should this be a CLI or web app?") and
 * the structured form ({ key, question, options?, type? }). Assigns stable,
 * unique keys (q1, q2, ... for legacy strings) so the frontend can key answers
 * deterministically and the write prompt can show readable "Q: ... / A: ..."
 * lines instead of raw keys.
 */
function normalizeQuestions(questions: unknown): ClarifyingQuestion[] {
  if (!Array.isArray(questions)) return [];
  const seen = new Set<string>();
  const out: ClarifyingQuestion[] = [];
  questions.forEach((q, i) => {
    // Legacy string form
    if (typeof q === 'string') {
      const question = q.trim();
      if (!question) return;
      out.push({ key: `q${i + 1}`, question, type: 'text' });
      return;
    }
    // Structured object form
    if (!q || typeof q !== 'object') return;
    const obj = q as Record<string, unknown>;
    const question = typeof obj.question === 'string' ? obj.question.trim() : '';
    if (!question) return;
    let key = typeof obj.key === 'string' && obj.key.trim() ? obj.key.trim() : `q${i + 1}`;
    const baseKey = key;
    let n = 2;
    while (seen.has(key)) { key = `${baseKey}_${n++}`; }
    seen.add(key);
    const options = Array.isArray(obj.options)
      ? obj.options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0).map(o => o.trim())
      : undefined;
    const type: 'choice' | 'text' = options && options.length > 0 ? 'choice' : 'text';
    out.push({ key, question, ...(options && options.length ? { options } : {}), type });
  });
  return out;
}

// ─── GUI-entry enforcement ──────────────────────────────────────────────
// Shared helpers (isGuiRequest, ensureGuiEntryFile, GUI_WIDGET_SECTION) now live
// in ../ai/guiShared.ts and are imported at the top of this file.
// ─── Phase 1: per-file export/uses contracts ────────────────────────────
// The plan now declares, for EVERY file, the members it exports (its public API
// surface) and the members it imports from other planned files. The write path
// (one-shot + per-file) must honor these contracts, so generated files never
// call/instantiate/reference a member the target file never declared — the
// exact failure class seen in the chess A/B (ai.ts referencing ChessBoard /
// ChessMove that game.ts never exported -> TS2304/TS2339).

/**
 * Normalize a file path for contract matching: strip ./ prefix, trailing /,
 * and a common source extension — so `from: 'src/game'` matches path
 * `src/game.ts` (and vice versa). Used by dependency ordering, the consistency
 * checker, and the chunked repair matcher.
 */
function normalizeContractPath(p: string): string {
  return (p || '')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '')
    .replace(/\.(ts|tsx|js|jsx|go|rs|py|java|rb|php|c|cpp|cs)$/i, '');
}

/**
 * Sanitize untrusted LLM plan files into the contract schema. Drops entries
 * without a path (can't be planned/written), keeps only string exports and
 * well-formed uses. Never throws on malformed JSON shapes.
 */
function normalizeFileContracts(files: unknown): PlannedFile[] {
  if (!Array.isArray(files)) return [];
  const out: PlannedFile[] = [];
  for (const f of files) {
    if (!f || typeof f !== 'object') continue;
    const obj = f as Record<string, unknown>;
    const path = typeof obj.path === 'string' ? obj.path.trim() : '';
    if (!path) continue; // untrusted LLM JSON: no path -> can't plan/write it
    const summary = typeof obj.summary === 'string' ? obj.summary : '';
    const language = typeof obj.language === 'string' ? obj.language : '';
    const exportsArr = Array.isArray(obj.exports)
      ? [...new Set(obj.exports.filter((m): m is string => typeof m === 'string' && m.trim().length > 0).map(m => m.trim()))]
      : [];
    const usesArr = Array.isArray(obj.uses)
      ? obj.uses
          .filter((u): u is Record<string, unknown> => !!u && typeof u === 'object')
          .map(u => {
            const from = typeof u.from === 'string' ? u.from.trim() : '';
            const members = Array.isArray(u.members)
              ? u.members.filter((m): m is string => typeof m === 'string' && m.trim().length > 0).map(m => m.trim())
              : [];
            return from && members.length ? { from, members } : null;
          })
          .filter((u): u is FileUse => u !== null)
      : [];
    out.push({
      path, summary, language,
      ...(exportsArr.length ? { exports: exportsArr } : {}),
      ...(usesArr.length ? { uses: usesArr } : {}),
    });
  }
  return out;
}

/**
 * Render the MANDATORY contracts section injected into the one-shot write
 * prompt: every file's exports + uses, so the writer sees the full cross-file
 * API surface before generating anything. Empty for a plan with no files.
 */
function buildFileContractsSection(files: PlannedFile[]): string {
  if (!files.length) return '';
  const lines: string[] = [
    '━━━ FILE CONTRACTS (MANDATORY) ━━━',
    'Cross-file API surface. A file may ONLY import members listed in the exporting file\'s "exports". Never reference a member that isn\'t declared there.',
    'IMPORTS (MANDATORY): every "uses from" line below MUST be backed by a real import statement at the top of the importing file — a sibling symbol referenced without an import is a compile failure.',
    '',
  ];
  for (const f of files) {
    const exports = f.exports?.length ? f.exports.join(', ') : '(none)';
    lines.push(`[${f.path}]`);
    lines.push(`  exports: ${exports}`);
    if (f.uses?.length) {
      for (const u of f.uses) lines.push(`  uses from ${u.from}: ${u.members.join(', ')}`);
    } else {
      lines.push('  uses: (none)');
    }
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Build the per-file contract block for Pass 2 (per-file fallback): THIS
 * file's exports/uses plus the exports of every file it imports from — so the
 * writer knows exactly which members exist on the far side of each import.
 */
function buildPerFileContractBlock(f: PlannedFile, allFiles: PlannedFile[]): string {
  const lines: string[] = ['━━━ FILE CONTRACT (MANDATORY) ━━━'];
  lines.push(`[${f.path}]`);
  lines.push(`  this file exports: ${f.exports?.length ? f.exports.join(', ') : '(none)'}`);
  if (f.uses?.length) {
    for (const u of f.uses) {
      const target = allFiles.find(t => normalizeContractPath(t.path) === normalizeContractPath(u.from));
      const targetExports = target?.exports?.length ? target.exports.join(', ') : '(unknown — declared nowhere)';
      lines.push(`  import from ${u.from} (exports: ${targetExports}): ${u.members.join(', ')}`);
    }
  } else {
    lines.push('  imports: (none)');
  }
  return lines.join('\n');
}

/**
 * Verify the plan's contracts are self-consistent BEFORE writing: every member
 * a file claims to import must actually be declared in the target file's
 * exports. Returns human-readable violations (empty array = consistent).
 *
 * NOTE: this validates the model's DECLARED contracts only — it cannot catch
 * generated code that fails to export a listed member. The tsc gate in
 * ui-chess-flow-check.py is the real compile-level validator.
 */
function checkContractConsistency(files: PlannedFile[]): string[] {
  const violations: string[] = [];
  if (!files.length) return violations;
  const exportByPath = new Map<string, Set<string>>();
  for (const f of files) {
    exportByPath.set(normalizeContractPath(f.path), new Set(f.exports || []));
  }
  for (const f of files) {
    for (const u of f.uses || []) {
      const target = exportByPath.get(normalizeContractPath(u.from));
      if (!target) {
        violations.push(`${f.path} imports from '${u.from}' which is not a planned file`);
        continue;
      }
      for (const m of u.members) {
        if (!target.has(m)) {
          violations.push(`${f.path} imports '${m}' from ${u.from}, but ${u.from} does not export it`);
        }
      }
    }
  }
  return violations;
}

// ─── Phase 1 closure: post-write contract VERIFIER ───────────────────────
// checkContractConsistency validates the plan's DECLARED contracts only. The
// verifier below scans the GENERATED code for drift: exports the plan declared
// but the code never provides, and imports of members the target neither
// exports nor declares. This closes the residual the Phase-1 plan says it
// cannot see ("can't see write-time drift").

/**
 * Extract the names a generated file actually exports (regex, best-effort).
 * Handles `export default class App {}` / `export default function foo() {}`
 * correctly (captures App/foo, NOT the class/function keyword), named export
 * statements, and bare `export default X`.
 */
function extractExportNames(code: string): Set<string> {
  const out = new Set<string>();
  // export const/let/var/function/class/interface/type/enum NAME
  for (const m of code.matchAll(/\bexport\s+(?:async\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) {
    out.add(m[1]);
  }
  // export { A, B as C }
  for (const m of code.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0]?.trim();
      if (name) out.add(name);
    }
  }
  // export default class Name | export default function Name (captures the NAME)
  const defaultNamed = code.match(/\bexport\s+default\s+(?:(?:abstract\s+)?class|(?:async\s+)?function)\s+([A-Za-z_$][\w$]*)/);
  if (defaultNamed) out.add(defaultNamed[1]);
  else {
    // export default Name (bare identifier)
    const dm = code.match(/\bexport\s+default\s+([A-Za-z_$][\w$]*)/);
    if (dm) out.add(dm[1]);
  }
  return out;
}

/** True when a file has any `export default` (named, anonymous, or expression). */
function hasDefaultExport(code: string): boolean {
  return /\bexport\s+default\b/.test(code);
}

/**
 * Extract imports from a generated file: { from, members, hasDefault }. Named
 * members are the symbols to verify; hasDefault marks a default import whose
 * local alias is arbitrary (verified as "target has any default export", never
 * by alias-name equality).
 */
function extractImports(code: string): Array<{ from: string; members: string[]; hasDefault: boolean }> {
  const out: Array<{ from: string; members: string[]; hasDefault: boolean }> = [];
  // import { A, B } from './x'
  for (const m of code.matchAll(/\bimport\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const members = m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]?.trim()).filter(Boolean);
    if (members.length) out.push({ from: m[2], members, hasDefault: false });
  }
  // import type { A, B } from './x'  (type-only named imports are still imports)
  for (const m of code.matchAll(/\bimport\s+type\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const members = m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]?.trim()).filter(Boolean);
    if (members.length) out.push({ from: m[2], members, hasDefault: false });
  }
  // import type X from './x'  and  import type X, { A } from './x'  (default type-only)
  for (const m of code.matchAll(/\bimport\s+type\s+([A-Za-z_$][\w$]*)(?:\s*,\s*\{([^}]*)\})?\s*from\s*['"]([^'"]+)['"]/g)) {
    const named = m[2]
      ? m[2].split(',').map(s => s.trim().split(/\s+as\s+/)[0]?.trim()).filter(Boolean)
      : [];
    out.push({ from: m[3], members: named, hasDefault: true });
  }
  // import X from './x'  and  import X, { A, B } from './x'  (default import)
  for (const m of code.matchAll(/\bimport\s+(?!type\b)([A-Za-z_$][\w$]*)(?:\s*,\s*\{([^}]*)\})?\s*from\s*['"]([^'"]+)['"]/g)) {
    const named = m[2]
      ? m[2].split(',').map(s => s.trim().split(/\s+as\s+/)[0]?.trim()).filter(Boolean)
      : [];
    out.push({ from: m[3], members: named, hasDefault: true });
  }
  return out;
}

/** Escape regex metacharacters in a member name before embedding in \\b...\\b. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface DeclaredArity {
  /** Params without a default or `?` — the minimum the compiler requires. */
  required: number;
  /** All declared params — the maximum (unless hasRest). */
  total: number;
  /** `...rest` present — callers may pass any number of args. */
  hasRest: boolean;
  /** Human-readable signature for the violation message, e.g. minimax(state, depth, maxPlayer). */
  signature: string;
}

/**
 * Parse EXPORTED function arity from a generated file: `export function
 * NAME(...)`, `export async function NAME(...)`, `export const NAME = (...)`
 * / `export const NAME = async (...) => ...`. Paren-balanced so type
 * annotations containing parens (`(x: (a: number) => void)`) don't confuse the
 * parameter split. Returns a map name -> arity; non-function exports and
 * functions without an exported signature are simply absent.
 */
export function extractExportedFunctionArity(code: string): Map<string, DeclaredArity> {
  const out = new Map<string, DeclaredArity>();
  // export [async] function NAME( ... ) — params to the first balanced `)`.
  for (const m of code.matchAll(/\bexport\s+async\s+function\s+([A-Za-z_$][\w$]*)/g)) {
    const name = m[1];
    parseParamsAt(code, paramsParenIndex(code, m.index! + m[0].length), (params) => {
      if (!out.has(name)) out.set(name, arityFromParams(params, `${name}(${params})`));
    });
  }
  for (const m of code.matchAll(/\bexport\s+function\s+([A-Za-z_$][\w$]*)/g)) {
    parseParamsAt(code, paramsParenIndex(code, m.index! + m[0].length), (params) => {
      const name = m[1];
      if (!out.has(name)) out.set(name, arityFromParams(params, `${name}(${params})`));
    });
  }
  // export const NAME = [async] ( ... ) =>  (arrow with parenthesized params)
  for (const m of code.matchAll(/\bexport\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?\(/g)) {
    const openIdx = paramsParenIndex(code, m.index! + m[0].length - 1);
    parseParamsAt(code, openIdx, (params) => {
      const name = m[1];
      if (!out.has(name)) out.set(name, arityFromParams(params, `${name}(${params})`));
    });
  }
  // export const NAME = [async] <T, ...>( ... ) =>  (generic arrow)
  for (const m of code.matchAll(/\bexport\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?</g)) {
    const openIdx = paramsParenIndex(code, m.index! + m[0].length - 1); // at `<` — helper skips the balanced generic clause
    parseParamsAt(code, openIdx, (params) => {
      const name = m[1];
      if (!out.has(name)) out.set(name, arityFromParams(params, `${name}(${params})`));
    });
  }
  // export const NAME = [async] function ( ... )  (function expression)
  for (const m of code.matchAll(/\bexport\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\s*\(/g)) {
    const openIdx = paramsParenIndex(code, m.index! + m[0].length - 1);
    parseParamsAt(code, openIdx, (params) => {
      const name = m[1];
      if (!out.has(name)) out.set(name, arityFromParams(params, `${name}(${params})`));
    });
  }
  // export const NAME = [async] function <T>( ... )  (generic function expression)
  for (const m of code.matchAll(/\bexport\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\s*</g)) {
    const openIdx = paramsParenIndex(code, m.index! + m[0].length - 1); // at `<`
    parseParamsAt(code, openIdx, (params) => {
      const name = m[1];
      if (!out.has(name)) out.set(name, arityFromParams(params, `${name}(${params})`));
    });
  }
  return out;
}

/** Index of the `(` starting a name's parameter list, skipping whitespace and a balanced `<...>` generic clause (which may nest). */
function paramsParenIndex(code: string, fromIdx: number): number {
  let i = fromIdx;
  while (i < code.length && /\s/.test(code[i])) i++;
  if (code[i] === '<') {
    let depth = 0;
    for (; i < code.length; i++) {
      const ch = code[i];
      if (ch === '<') depth++;
      else if (ch === '>') {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    while (i < code.length && /\s/.test(code[i])) i++;
  }
  return i;
}

/** Call fn with the balanced paren-list substring starting at `openIdx` (which must point at `(`). */
function parseParamsAt(code: string, openIdx: number, fn: (params: string) => void): void {
  if (code[openIdx] !== '(') return;
  let depth = 0;
  let quote: string | null = null;
  let esc = false;
  for (let i = openIdx; i < code.length; i++) {
    const ch = code[i];
    if (quote) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; continue; }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) { fn(code.slice(openIdx + 1, i)); return; }
    }
  }
}

/** Compute required/total/hasRest + signature text from a raw param list. */
function arityFromParams(raw: string, signature: string): DeclaredArity {
  const parts = splitTopLevel(raw, ',');
  const nonEmpty = parts.filter(p => p.trim().length > 0);
  const hasRest = nonEmpty.some(p => p.trim().startsWith('...'));
  let required = 0;
  for (const p of nonEmpty) {
    const t = p.trim();
    if (t.startsWith('...')) continue; // rest params aren't required
    // A default marker is `=` NOT followed by `>` — `=>` inside an arrow-FN
    // type annotation (fn: (x) => number) is not a default param.
    if (/=(?![>])/.test(t)) continue; // defaulted
    // Optional marker must be `?` directly after the param NAME — a `?` inside
    // the type annotation (fn: (x?: number) => void) or a default-value ternary
    // (a = cond ? 1 : 2) must not mark the param optional.
    const nameEnd = t.search(/[=:]/);
    if (nameEnd !== -1 ? t.slice(0, nameEnd).includes('?') : t.includes('?')) continue; // optional
    required += 1;
  }
  return {
    required,
    total: nonEmpty.length,
    hasRest,
    // Collapse newlines/tabs to single spaces but KEEP the source's
    // leading/trailing padding — the embedded signature is shown to the model
    // as `name( ... )` and reads better with the original spacing preserved.
    signature: signature.replace(/\s+/g, ' '),
  };
}

/** Split on a delimiter at paren/bracket/brace/string depth 0 (e.g. params, call args). */
function splitTopLevel(s: string, delim: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let esc = false;
  let cur = '';
  for (const ch of s) {
    if (quote) {
      cur += ch;
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);
    if (ch === delim && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * All call-site argument counts for `name(` in code. Strings, template
 * literals, and comments are MASKED to spaces first (same length, so match
 * indices stay valid) — a `foo(1, 2)` inside prose or a string must never
 * count as a call. `obj.name(` and `xname(` never match. Returns an empty
 * array when the member is never CALLED (type references don't count).
 */
export function countCallArgumentCounts(code: string, name: string): number[] {
  const masked = maskStringsAndComments(code);
  const counts: number[] = [];
  const re = new RegExp(`\\b${escapeRegExp(name)}\\s*\\(`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked)) !== null) {
    // A preceding `.` (obj.name() is a METHOD, not this function call) or `?.`
    // means the call binds to a member, not to the imported symbol.
    const before = m.index > 0 ? masked[m.index - 1] : '';
    if (before === '.' || before === '?') { re.lastIndex = m.index + 1; continue; }
    const openIdx = m.index + m[0].length - 1;
    let depth = 0;
    let commaCount = 0;
    let lastComma = -1;
    let endIdx = -1;
    for (let i = openIdx; i < masked.length; i++) {
      const ch = masked[i];
      if (ch === '(') { depth++; continue; }
      if (ch === ')') {
        depth--;
        if (depth === 0) { endIdx = i; break; }
        continue;
      }
      if (ch === ',' && depth === 1) { commaCount++; lastComma = i; continue; }
    }
    if (endIdx > openIdx) {
      // Args = commas at depth 1, +1 if a non-space char follows the last
      // comma (or the opening paren for a single arg). This makes trailing
      // commas (`foo(a, b,)` = 2 args, legal TS) count correctly.
      const tailStart = lastComma >= 0 ? lastComma + 1 : openIdx + 1;
      let hasTail = false;
      for (let i = tailStart; i < endIdx; i++) {
        if (!/\s/.test(masked[i])) { hasTail = true; break; }
      }
      counts.push(commaCount + (hasTail ? 1 : 0));
    }
    re.lastIndex = endIdx > openIdx ? endIdx + 1 : m.index + 1;
  }
  return counts;
}

/** Replace string/template/comment contents with same-length spaces (indices preserved). */
function maskStringsAndComments(code: string): string {
  const chars = code.split('');
  let quote: string | null = null;
  let esc = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const next = chars[i + 1];
    if (lineComment) {
      if (ch === '\n') lineComment = false;
      else chars[i] = ' ';
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') { chars[i] = ' '; chars[i + 1] = ' '; blockComment = false; i++; }
      else chars[i] = ' ';
      continue;
    }
    if (quote) {
      chars[i] = ' ';
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '/' && next === '/') { chars[i] = ' '; chars[i + 1] = ' '; lineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { chars[i] = ' '; chars[i + 1] = ' '; blockComment = true; i++; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; chars[i] = ' '; continue; }
  }
  return chars.join('');
}

/** Compute a relative import specifier from one planned file to another. */
function relativeImportSpecifier(fromPath: string, toPath: string): string {
  const fromDir = pathModule.posix.dirname(fromPath || 'x.ts');
  const rel = pathModule.posix
    .relative(fromDir, toPath || 'x.ts')
    .replace(/\.(ts|tsx|js|jsx)$/i, '');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

// ─── Non-relative import safety (npm-package phantom class) ─────────────
// A generated file may import Node builtins (fs, path, node:*) and packages
// that are actually installed — anything else (the writer inventing
// `import csv from 'csv-parser'` when no such dependency exists) is a TS2307
// compile failure the moment tsc runs. The contract verifier used to skip all
// non-relative specifiers by design; check 2c below flags the unsafe ones and
// the repair paths strip them deterministically.

/** Node built-in module names (bare + node: prefixed) that never need installing. */
const NODE_BUILTIN_MODULES = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console', 'constants',
  'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain', 'events', 'fs', 'http',
  'http2', 'https', 'inspector', 'module', 'net', 'os', 'path', 'perf_hooks', 'process',
  'punycode', 'querystring', 'readline', 'repl', 'stream', 'string_decoder', 'sys',
  'timers', 'tls', 'trace_events', 'tty', 'url', 'util', 'v8', 'vm', 'wasi',
  'worker_threads', 'zlib',
]);

/** The package name a bare specifier refers to ('@scope/pkg' or 'pkg' — subpaths dropped). */
function packageNameFromSpecifier(spec: string): string {
  const parts = spec.split('/');
  return spec.startsWith('@') && parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
}

/**
 * True when a bare specifier resolves to an installed package. Checks the root
 * and backend node_modules dirs — correct for this flat-npm project; non-flat
 * layouts (pnpm .pnpm/, nested hoisting) would need require.resolve instead.
 */
function isInstalledPackage(spec: string): boolean {
  const pkg = packageNameFromSpecifier(spec);
  if (!pkg) return false;
  return [
    pathModule.join(PROJECT_ROOT, 'node_modules', pkg),
    pathModule.join(PROJECT_ROOT, 'backend', 'node_modules', pkg),
  ].some(p => fs.existsSync(p));
}

/**
 * True when a NON-RELATIVE import specifier is safe: a Node builtin (bare or
 * `node:`-prefixed) or an installed package. Relative/absolute specifiers
 * ('.', '/') are the phantom-MODULE check 2b's concern — callers filter them
 * first and never reach this helper.
 */
export function isSafeNonRelativeImport(spec: string): boolean {
  if (spec.startsWith('node:')) return true;
  if (NODE_BUILTIN_MODULES.has(packageNameFromSpecifier(spec))) return true;
  return isInstalledPackage(spec);
}

/**
 * Deterministically remove import/export statements whose non-relative
 * specifier is neither a Node builtin nor an installed package (phantom npm
 * dependencies the writer invented). Zero LLM calls; never touches the body.
 * Handles binding imports (incl. multi-line), side-effect imports
 * (`import 'pkg'`), and re-exports (`export { a } from 'pkg'` / `export *`).
 * If the removed members were used in the body, the resulting TS2304
 * undefined-symbol errors route to the tsc gate's import repair, which
 * implements them locally or imports from a planned file. Returns the stripped
 * content or null when nothing matched.
 */
export function stripPhantomPackageImports(content: string): string | null {
  let changed = false;
  const dropIfPhantom = (whole: string, spec: string): string => {
    if (spec.startsWith('.') || spec.startsWith('/') || isSafeNonRelativeImport(spec)) return whole;
    changed = true;
    return '';
  };
  const out = content
    // Binding imports (multi-line capable: [^;]* never crosses a semicolon,
    // so a statement can span lines but not swallow a following line;
    // `import.` — import.meta — is excluded via the (?!\.) guard).
    .replace(/^\s*import\s+(?!\.)(?:type\s+)?[^;]*?\s+from\s*['"]([^'"]+)['"]\s*;?\s*$/gm, dropIfPhantom)
    // Side-effect imports: import 'pkg';
    .replace(/^\s*import\s+['"]([^'"]+)['"]\s*;?\s*$/gm, dropIfPhantom)
    // Re-exports: export * from 'pkg' / export { a } from 'pkg' / export a from 'pkg'
    .replace(/^\s*export\s+(?:\*|\{[^}]*\}|[A-Za-z_$][\w$]*)\s+from\s*['"]([^'"]+)['"]\s*;?\s*$/gm, dropIfPhantom);
  return changed ? out : null;
}

/**
 * Post-write contract verifier: scan GENERATED files for drift vs the declared
 * contracts. Returns human-readable violations (empty = contracts honored in
 * the code, not just the plan). Named imports are checked against the target's
 * actual exports (falling back to its declared exports); declared exports that
 * never appear in the code are flagged. Pure + best-effort — a heuristic scan,
 * not a compiler, so it feeds a repair pass rather than hard-failing.
 *
 * Checks three things:
 *   1. Declared exports that never materialize in the generated code.
 *   2. Existing imports of members the target neither exports nor declares.
 *   3. MISSING imports (the one-shot hole): every DECLARED cross-file `use`
 *      must be backed by a real import statement, and any member the code
 *      actually references must be among that import's members (or a default
 *      import). A file that references sibling symbols with ZERO imports used
 *      to pass checks 1+2 (there was nothing to check) — now it is flagged
 *      with an [IMPORT] tag so the repair pass uses the import-specific prompt.
 */
export function verifyGeneratedContracts(
  files: Array<{ path: string; content: string }>,
  contractFiles: PlannedFile[]
): string[] {
  const violations: string[] = [];
  if (!files.length) return violations;
  const declaredByPath = new Map<string, PlannedFile>();
  for (const f of contractFiles) declaredByPath.set(normalizeContractPath(f.path), f);
  const actualByPath = new Map<string, Set<string>>();
  const defaultByPath = new Map<string, boolean>();
  const arityByPath = new Map<string, Map<string, DeclaredArity>>();
  for (const f of files) {
    actualByPath.set(normalizeContractPath(f.path), extractExportNames(f.content));
    defaultByPath.set(normalizeContractPath(f.path), hasDefaultExport(f.content));
    arityByPath.set(normalizeContractPath(f.path), extractExportedFunctionArity(f.content));
  }
  for (const f of files) {
    const key = normalizeContractPath(f.path);
    const planned = declaredByPath.get(key);
    if (!planned) continue; // unplanned generated file (e.g. preview wrapper) — not contract-checked
    const declared = new Set(planned.exports || []);
    const actual = actualByPath.get(key) || new Set();
    // 1. Declared exports that never materialize in the code.
    for (const name of declared) {
      if (!actual.has(name)) {
        violations.push(`${f.path} declares export '${name}' but the generated code does not export it`);
      }
    }
    // 2. Imported members the target never exports/declares. Relative specifiers
    //    resolve against the IMPORTING file's directory (./game from src/ai.ts
    //    -> src/game), exactly like the module resolver the compiler uses.
    //    Named imports are checked by name; DEFAULT imports only require the
    //    target to have ANY `export default` (the local alias is arbitrary —
    //    `import App from './game'` with `export default class Game` is valid).
    for (const imp of extractImports(f.content)) {
      // Non-relative specifiers (builtins / packages) are never looked up in
      // the planned-file set — member checks only apply to sibling files.
      // They are covered by the phantom checks 2b (relative modules) and 2c
      // (npm deps) instead; a default import of 'fs' must NOT be flagged as
      // "target has no export default".
      if (!imp.from.startsWith('.')) continue;
      const resolvedFrom = pathModule.posix.normalize(pathModule.posix.join(pathModule.posix.dirname(f.path), imp.from));
      const targetKey = normalizeContractPath(resolvedFrom);
      const targetActual = actualByPath.get(targetKey);
      const targetDeclared = new Set(declaredByPath.get(targetKey)?.exports || []);
      if (imp.hasDefault) {
        const hasDefault = targetActual ? (defaultByPath.get(targetKey) ?? false) : false;
        if (!hasDefault) {
          violations.push(`${f.path} default-imports from ${imp.from}, but the target has no export default`);
        }
      }
      for (const member of imp.members) {
        const provided = targetActual ? targetActual.has(member) : targetDeclared.has(member);
        if (!provided) {
          violations.push(`${f.path} imports '${member}' from ${imp.from}, but the target neither exports nor declares it`);
        }
      }
    }
    // 2b. PHANTOM-MODULE check (TS2307 class): every RELATIVE import in the
    //     generated code must resolve to a planned file (or another generated
    //     file). An import that resolves to a module which is neither planned
    //     nor generated is a compile failure the moment tsc runs (e.g. the
    //     one-shot writer inventing `./types` that no plan declared). Caught
    //     here at contract time so the repair pass removes the dead import
    //     before tsc ever sees it. Non-relative specifiers are handled by
    //     check 2c below (builtins/installed packages pass; invented npm deps
    //     are flagged). Tagged [IMPORT] so the repair pass uses the
    //     import-specific prompt.
    for (const imp of extractImports(f.content)) {
      if (!imp.from.startsWith('.')) continue; // non-relative — check 2c
      const resolvedFrom = pathModule.posix.normalize(pathModule.posix.join(pathModule.posix.dirname(f.path), imp.from));
      const targetKey = normalizeContractPath(resolvedFrom);
      const isPlanned = declaredByPath.has(targetKey);
      const isGenerated = actualByPath.has(targetKey);
      if (!isPlanned && !isGenerated) {
        violations.push(`[IMPORT] ${f.path} imports from '${imp.from}' which is not a planned file (phantom module — TS2307)`);
      }
    }
    // 2c. NON-RELATIVE phantom-dependency check (npm-package class): a bare
    //     specifier that is neither a Node builtin nor an installed package —
    //     e.g. the writer inventing `import csv from 'csv-parser'` — is a
    //     TS2307 compile failure the moment tsc runs. Builtins (fs, path,
    //     node:*) and installed packages are fine. Tagged [IMPORT] so the
    //     repair pass removes the dead import.
    for (const imp of extractImports(f.content)) {
      if (imp.from.startsWith('.') || imp.from.startsWith('/')) continue; // relative/absolute — covered by 2b
      if (isSafeNonRelativeImport(imp.from)) continue;
      violations.push(`[IMPORT] ${f.path} imports from '${imp.from}' which is neither a Node builtin nor an installed package (phantom dependency — TS2307)`);
    }
    // 2d. TS2554 ARITY pre-check (the probe's minimax failure class). For every
    //     member imported from a sibling planned file that is an exported
    //     FUNCTION, count the call-site arguments at EVERY call site and flag
    //     drift from the target's declared signature — plan-time, before tsc
    //     ever runs. The message embeds the declared signature so the repair
    //     pass can reconcile either side. Only cross-file calls are checked
    //     (local functions can't be resolved here); non-function exports and
    //     members that are never CALLED (type references, method access) are
    //     skipped by construction.
    for (const imp of extractImports(f.content)) {
      if (!imp.from.startsWith('.')) continue;
      // NOTE: a default import alias is arbitrary (can't be mapped to a named
      // signature) — but it never appears in `members`, so named members on the
      // same statement are still checked below.
      const resolvedFrom = pathModule.posix.normalize(pathModule.posix.join(pathModule.posix.dirname(f.path), imp.from));
      const targetArity = arityByPath.get(normalizeContractPath(resolvedFrom));
      if (!targetArity) continue; // target not generated here (planned-only) or has no exported functions
      for (const member of imp.members) {
        const declared = targetArity.get(member);
        if (!declared) continue; // not an exported function — nothing to arity-check
        const callCounts = countCallArgumentCounts(f.content, member);
        for (const args of callCounts) {
          if (args < declared.required || (!declared.hasRest && args > declared.total)) {
            const direction = args < declared.required
              ? `passes ${args} argument(s) but ${declared.required} required`
              : `passes ${args} argument(s) but ${declared.total} declared`;
            violations.push(
              `[ARITY] ${f.path} calls '${member}' — ${direction}; target signature: ${declared.signature}`
            );
          }
        }
      }
    }
    // 3. Missing-import necessity check (the one-shot hole). For every member
    //    the plan declares this file uses from another planned file, the code
    //    must actually import it. No import from that file at all → violation.
    //    A member referenced in the body but absent from the import (and no
    //    default import covering it) → violation. [IMPORT] tags route the
    //    repair pass to the import-specific prompt.
    if (planned.uses && planned.uses.length) {
      // Map resolved target path -> { members imported, hasDefault }
      const importsByTarget = new Map<string, { members: Set<string>; hasDefault: boolean }>();
      for (const imp of extractImports(f.content)) {
        const resolvedFrom = imp.from.startsWith('.')
          ? pathModule.posix.normalize(pathModule.posix.join(pathModule.posix.dirname(f.path), imp.from))
          : imp.from;
        const targetKey = normalizeContractPath(resolvedFrom);
        const entry = importsByTarget.get(targetKey) || { members: new Set<string>(), hasDefault: false };
        for (const m of imp.members) entry.members.add(m);
        if (imp.hasDefault) entry.hasDefault = true;
        importsByTarget.set(targetKey, entry);
      }
      // Body without import lines, so "does the code reference X" isn't
      // answered by the import statement itself. Comments and string literals
      // are stripped too so a member name in prose/strings doesn't count as
      // a real reference (false-positive guard).
      const bodyWithoutImports = f.content
        .replace(/^import\s+[^;]*?from\s*['"][^'"]+['"]\s*;?$/gm, '')
        .replace(/^import\s+[^;]*?;$/gm, '')
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/'(?:[^'\\]|\\.)*'/g, '')
        .replace(/"(?:[^"\\]|\\.)*"/g, '')
        .replace(/`(?:[^`\\]|\\.)*`/g, '');
      for (const u of planned.uses) {
        const useKey = normalizeContractPath(u.from);
        const importEntry = importsByTarget.get(useKey);
        // A declared member is only "needed" when the code ACTUALLY references
        // it outside comments/strings AND it isn't declared locally (the model
        // may have inlined it). Members the code never touches — or only names
        // in prose — must not trigger a missing-import repair round.
        const neededMembers = (u.members || []).filter((member) => {
          const locallyDeclared = new RegExp(`\\b(?:function|class|interface|type|enum|const|let|var)\\s+${escapeRegExp(member)}\\b`).test(bodyWithoutImports);
          if (locallyDeclared) return false;
          return new RegExp(`\\b${escapeRegExp(member)}\\b`).test(bodyWithoutImports);
        });
        if (!importEntry) {
          if (neededMembers.length > 0) {
            violations.push(`[IMPORT] ${f.path} uses members from ${u.from} (declared) but never imports from it`);
          }
          continue;
        }
        for (const member of neededMembers) {
          if (!importEntry.members.has(member) && !importEntry.hasDefault) {
            violations.push(`[IMPORT] ${f.path} references '${member}' from ${u.from} but never imports it`);
          }
        }
      }
    }
  }
  return violations;
}

/**
 * Roadmap 1b: which planned files are MISSING from a (possibly truncated)
 * one-shot response. A 1-of-4 write must not silently count as success.
 */
export function findMissingPlannedFiles(
  files: Array<{ path: string }>,
  contractFiles: PlannedFile[]
): PlannedFile[] {
  const present = new Set(files.map(f => normalizeContractPath(f.path)));
  return contractFiles.filter(f => !present.has(normalizeContractPath(f.path)));
}

/** Repair-pass prompt for a file that violates the FILE CONTRACTS post-write. */
function buildContractRepairPrompt(
  request: string,
  file: PlannedFile,
  currentContent: string,
  violations: string[],
  allFiles: PlannedFile[]
): string {
  const targets = (file.uses || []).map(u => {
    const t = allFiles.find(x => normalizeContractPath(x.path) === normalizeContractPath(u.from));
    return `  ${u.from} exports: ${t?.exports?.length ? t.exports.join(', ') : '(unknown — declared nowhere)'}`;
  });
  const targetBlock = targets.length
    ? `\n\n━━━ IMPORT TARGETS (may ONLY reference these declared members) ━━━\n${targets.join('\n')}`
    : '';
  return `User request: ${request}\n\nThe file ${file.path} was just generated but violates the FILE CONTRACTS.\n\n━━━ CURRENT CONTENT ━━━\n${currentContent.substring(0, 6000)}\n\n━━━ CONTRACT VIOLATIONS ━━━\n${violations.join('\n')}${targetBlock}\n\n━━━ TASK ━━━\nFix the contract violations above and return the COMPLETE corrected content for ${file.path}. If the file must provide a member that other files import, ADD the missing export. If the file imports a member the target file never exports, change the import to a member that exists (or implement the logic locally). Never remove core functionality. Return ONLY the file's raw code — no markdown fences, no JSON wrapper, no commentary.`;
}

/**
 * The exact import statements the plan declares this file needs (from its
 * `uses`), computed deterministically — the specifier resolved relative to
 * THIS file, members in declaration order. Shared by the missing-import repair
 * prompt (display) and the P1 deterministic import patch (zero-LLM fix).
 */
export function computeRequiredImportLines(file: PlannedFile, allFiles: PlannedFile[]): string[] {
  const lines: string[] = [];
  for (const u of file.uses || []) {
    const target = allFiles.find(x => normalizeContractPath(x.path) === normalizeContractPath(u.from));
    if (!target) continue;
    const specifier = relativeImportSpecifier(file.path, target.path);
    const members = (u.members || []).join(', ');
    if (members) lines.push(`import { ${members} } from '${specifier}';`);
  }
  return lines;
}

/**
 * Insert import lines after the last existing import statement (or at the top
 * when the file has none) so a patch never disturbs the file body. Generated
 * code is compact and import-led, so "after the last import" is deterministic.
 */
function insertImportLines(content: string, lines: string[]): string {
  if (!lines.length) return content;
  const all = content.split('\n');
  let lastImport = -1;
  for (let i = 0; i < all.length; i++) {
    if (/^\s*import(?:\s+type)?\s+/.test(all[i]) && /;\s*$/.test(all[i])) lastImport = i;
  }
  const insertAt = lastImport + 1;
  return [...all.slice(0, insertAt), ...lines, ...all.slice(insertAt)].join('\n');
}

/**
 * P1 import-only patch (deterministic, zero LLM calls): insert the
 * plan-declared import lines into the file's content. Returns the patched
 * content, or null when the file already imports from every declared target
 * (nothing to add — the caller should fall through to a real repair call).
 * Only ADDS imports (the plan's `uses` are the declared cross-file API), never
 * rewrites or reorders body code — the failure mode of whole-file rewrites.
 */
export function applyDeterministicImportPatch(
  content: string,
  file: PlannedFile,
  allFiles: PlannedFile[]
): string | null {
  const lines = computeRequiredImportLines(file, allFiles);
  if (!lines.length) return null;
  // Parse the required imports into {specifier, resolved target key, members}.
  const required: Array<{ specifier: string; key: string; members: string[] }> = [];
  for (const l of lines) {
    const m = l.match(/^import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]([^'"]+)['"]\s*;$/);
    if (!m) continue;
    const members = m[1].split(',').map(s => s.trim()).filter(Boolean);
    const specifier = m[2];
    const key = specifier.startsWith('.')
      ? normalizeContractPath(pathModule.posix.normalize(pathModule.posix.join(pathModule.posix.dirname(file.path), specifier)))
      : normalizeContractPath(specifier);
    if (members.length) required.push({ specifier, key, members });
  }
  if (!required.length) return null;
  // Existing NAMED imports by resolved target: member set + the line index of
  // the first `import { ... } from target`. `import type { ... }` is NOT a
  // value import, so it never counts as an existing import here.
  const existingMembers = new Map<string, Set<string>>();
  const namedLineIdx = new Map<string, number>();
  const all = content.split('\n');
  for (let i = 0; i < all.length; i++) {
    const nm = all[i].match(/^\s*import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]\s*;?\s*$/);
    if (!nm) continue;
    const spec = nm[2];
    const key = spec.startsWith('.')
      ? normalizeContractPath(pathModule.posix.normalize(pathModule.posix.join(pathModule.posix.dirname(file.path), spec)))
      : normalizeContractPath(spec);
    const members = nm[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]?.trim()).filter(Boolean);
    if (!existingMembers.has(key)) {
      existingMembers.set(key, new Set());
      namedLineIdx.set(key, i);
    }
    for (const mm of members) existingMembers.get(key)!.add(mm);
  }
  // Build additions (target not imported at all) + merges (target imported,
  // some members missing — merge into the existing named import line).
  const newLines: string[] = [];
  const merged = new Map<number, string[]>(); // line index -> members to add
  for (const r of required) {
    const have = existingMembers.get(r.key);
    if (!have) {
      newLines.push(`import { ${r.members.join(', ')} } from '${r.specifier}';`);
      continue;
    }
    const missingMembers = r.members.filter(m => !have.has(m));
    if (!missingMembers.length) continue;
    const lineIdx = namedLineIdx.get(r.key)!;
    merged.set(lineIdx, [...new Set([...(merged.get(lineIdx) || []), ...missingMembers])]);
  }
  if (!newLines.length && !merged.size) return null;
  // Apply merges by rewriting the brace list of the targeted import line.
  for (const [idx, addMembers] of merged) {
    all[idx] = all[idx].replace(
      /^(\s*import\s*\{)([^}]*)(\}\s*from\s*['"][^'"]+['"]\s*;?\s*)$/,
      (_m: string, p1: string, p2: string, p3: string) => {
        const existingList = p2.split(',').map((s: string) => s.trim()).filter(Boolean);
        return `${p1} ${[...new Set([...existingList, ...addMembers])].join(', ')} ${p3}`;
      }
    );
  }
  let out = all.join('\n');
  if (newLines.length) out = insertImportLines(out, newLines);
  return out !== content ? out : null;
}

/**
 * P2 name-drift fix (zero LLM): a file imports a member the target module
 * does not actually export (TS2305, e.g. `import { Todo }` while todo.ts
 * declares `interface TodoItem`) — the whole-file regenerate prompt keeps
 * re-rolling the drift because each file is repaired in isolation. This
 * aligns the import binding deterministically with the target's ACTUAL
 * exports via an `as` alias (`import { TodoItem as Todo }`), so every
 * existing usage stays valid with ZERO body changes. Returns the patched
 * content or null when nothing can be aligned.
 */
export function applyDeterministicNameDriftFix(
  content: string,
  selfPath: string,
  allFiles: Array<{ path: string; content?: string }>,
  errs: string[]
): string | null {
  // Parse each TS2305: Module '"./todo"' has no exported member 'Todo'.
  const missingBySpec = new Map<string, string[]>();
  for (const e of errs) {
    // tsc quotes the module path (e.g. Module '"./todo"' — both quotes) so
    // allow any run of quote chars around the captured path/member.
    const m = e.match(/Module\s*['"]*([^'"]+)['"]*\s+has no exported member\s*['"]*([^'"]+)['"]*/);
    if (!m) continue;
    const spec = m[1];
    const member = m[2];
    if (!missingBySpec.has(spec)) missingBySpec.set(spec, []);
    missingBySpec.get(spec)!.push(member);
  }
  if (!missingBySpec.size) return null;

  const byKey = new Map<string, string>();
  for (const f of allFiles) if (f && f.path) byKey.set(normalizeContractPath(f.path), f.content || '');

  // Scan ACTUAL exported names from the target's written content.
  const exportsCache = new Map<string, string[]>();
  const targetExports = (key: string): string[] => {
    if (!exportsCache.has(key)) {
      const src = byKey.get(key) || '';
      const names: string[] = [];
      const BANNED = new Set(['default', 'async', 'declare', 'abstract', 'function', 'const', 'let', 'var', 'interface', 'class', 'type', 'enum', 'readonly', 'import', 'export', 'from']);
      for (const m of src.matchAll(/export\s+(?:type\s+|interface\s+|class\s+|function\s+|const\s+|enum\s+|abstract\s+class\s+)?([A-Za-z_$][\w$]*)/g)) {
        const name = m[1];
        if (!BANNED.has(name) && !names.includes(name)) names.push(name);
      }
      exportsCache.set(key, names);
    }
    return exportsCache.get(key) || [];
  };

  // Best-guess match for a missing member against the target's exports.
  // Preference order: exact → case-insensitive → PREFIX (TodoItem starts with
  // Todo) → SUFFIX (addTodo ends with Todo) → any containment by length gap.
  // Plain "shortest containing" picked addTodo over TodoItem for "Todo"
  // because both contain it — the prefix rule fixes that drift.
  const findMatch = (member: string, exports: string[]): string | null => {
    if (exports.includes(member)) return member;
    const lower = member.toLowerCase();
    const ci = exports.find((e) => e.toLowerCase() === lower);
    if (ci) return ci;
    const prefix = exports
      .filter((e) => e.length >= 2 && e.toLowerCase().startsWith(lower))
      .sort((a, b) => a.length - b.length);
    if (prefix.length) return prefix[0];
    const suffix = exports
      .filter((e) => e.length >= 2 && e.toLowerCase().endsWith(lower))
      .sort((a, b) => a.length - b.length);
    if (suffix.length) return suffix[0];
    const containing = exports
      .filter((e) => e.length >= 2 && (e.toLowerCase().includes(lower) || lower.includes(e.toLowerCase())))
      .sort((a, b) => Math.abs(a.length - member.length) - Math.abs(b.length - member.length));
    return containing.length ? containing[0] : null;
  };

  const selfDir = pathModule.posix.dirname(selfPath);
  let changed = false;
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const im = lines[i].match(/^(\s*import\s*(?:type\s+)?\{)([^}]*)(\}\s*from\s*['"])([^'"]+)(['"]\s*;?\s*)$/);
    if (!im) continue;
    const spec = im[4];
    const key = spec.startsWith('.')
      ? normalizeContractPath(pathModule.posix.normalize(pathModule.posix.join(selfDir, spec)))
      : normalizeContractPath(spec);
    const missing = missingBySpec.get(spec) || missingBySpec.get(key);
    if (!missing || !missing.length) continue;
    const exports = targetExports(key);
    if (!exports.length) continue;
    let lineChanged = false;
    const members = im[2].split(',').map((s) => s.trim()).filter(Boolean);
    const rewritten = members.map((member) => {
      // The binding is the part after any existing ` as ` alias.
      const parts = member.split(/\s+as\s+/);
      const binding = parts[parts.length - 1].trim();
      if (!missing.includes(binding)) return member;
      const match = findMatch(binding, exports);
      if (!match || match === binding) return member;
      lineChanged = true;
      return `${match} as ${binding}`;
    });
    if (!lineChanged) continue;
    lines[i] = `${im[1]} ${rewritten.join(', ')} ${im[3]}${spec}${im[5]}`;
    changed = true;
  }
  if (!changed) return null;
  const out = lines.join('\n');
  return out !== content ? out : null;
}

/**
 * P1 import-only patch (tiny LLM call): when a file's tsc errors are ALL
 * import-class (TS2304/2503/2552/2307) and the deterministic plan-driven
 * insert wasn't enough (phantom modules, symbols outside the plan's declared
 * uses), this asks the model for ONLY the import statements to add/remove — a
 * ~1k-token call that never rewrites the file body. Whole-file rewrites were
 * the failure mode: the weak model restructured unrelated logic while
 * re-omitting the imports.
 */
export function buildImportPatchPrompt(
  request: string,
  file: PlannedFile,
  currentContent: string,
  violations: string[],
  allFiles: PlannedFile[]
): string {
  const declared = computeRequiredImportLines(file, allFiles);
  const declaredBlock = declared.length
    ? `\n\n━━━ PLAN-DECLARED IMPORTS (already added if present in the code) ━━━\n${declared.join('\n')}`
    : '';
  return `User request: ${request}\n\nThe file ${file.path} fails to compile with missing-import errors (Cannot find name/module, or an import of a module that does not exist).\n\n━━━ CURRENT IMPORT SECTION ━━━\n${currentContent.substring(0, 2500)}\n\n━━━ TSC ERRORS ━━━\n${violations.join('\n')}${declaredBlock}\n\n━━━ TASK ━━━\nReturn ONLY a single valid JSON object with two arrays (no markdown, no fences, no commentary):\n{"add": ["import { X } from './y';", "..."], "remove": ["import { Z } from './app';", "..."]}\n- "add": the exact import statements needed so every unresolved symbol is imported from a file that actually exports it.\n- "remove": full import statements to DELETE — e.g. an import from a module that does not exist (TS2307), or one that imports a member the target never exports (replace it via "add" instead).\n- Use [] (not null/omitted) when there is nothing to add/remove.\nNEVER touch anything but import statements — do not rewrite, rename, or restructure the file body.`;
}

/**
 * Apply a parsed {"add": [...], "remove": [...]} import patch to file content:
 * delete the exact `remove` statements, then insert the `add` statements after
 * the last existing import. No body code is ever rewritten.
 */
export function applyImportPatch(content: string, patch: { add?: string[]; remove?: string[] }): string {
  let out = content;
  const remove = (patch.remove || []).map(l => l.trim()).filter(Boolean);
  if (remove.length) {
    const escaped = remove.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const re = new RegExp(`^\\s*(?:${escaped.join('|')})\\s*(?:\\n|$)`, 'gm');
    out = out.replace(re, '');
  }
  const add = (patch.add || []).map(l => l.trim()).filter(Boolean);
  if (add.length) out = insertImportLines(out, add);
  return out;
}

/**
 * Run the whole-file missing-import repair prompt (buildMissingImportRepairPrompt)
 * and return the cleaned corrected content, or null when the model produced
 * nothing usable / nothing changed. The LAST-RESORT path for stubborn
 * import-class files that the deterministic insert and the tiny patch could
 * not fix (phantom modules, symbols outside the plan's declared uses).
 */
async function wholeFileImportRepair(
  request: string,
  planned: PlannedFile,
  content: string,
  errs: string[],
  contractFiles: PlannedFile[],
  timeoutMs: number
): Promise<string | null> {
  const raw = await translator.reason(buildMissingImportRepairPrompt(request, planned, content, errs, contractFiles), FILE_WRITE_PROMPT, { maxTokens: 4096, timeoutMs });
  let c = cleanLLMResponse(raw);
  const wrapped = extractJSON<{ content?: string }>(c);
  if (wrapped && typeof wrapped.content === 'string') c = wrapped.content;
  else c = c.replace(/^```(?:\w+)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  return c && c !== content ? c : null;
}

/**
 * Dedicated repair prompt for MISSING-IMPORT violations (the one-shot hole).
 * Unlike the generic contract-repair prompt (fix exports/imports of declared
 * members), this is laser-focused: the file references sibling symbols with
 * ZERO or partial imports. It computes the EXACT import lines to add from the
 * plan's declared `uses`, and instructs the model to add imports rather than
 * rewrite logic — the failure mode that generic repair kept getting wrong.
 */
export function buildMissingImportRepairPrompt(
  request: string,
  file: PlannedFile,
  currentContent: string,
  violations: string[],
  allFiles: PlannedFile[]
): string {
  // Compute the exact import lines the plan says this file needs.
  const importLines = computeRequiredImportLines(file, allFiles);
  const importBlock = importLines.length
    ? `\n\n━━━ REQUIRED IMPORTS (add these at the top of the file) ━━━\n${importLines.join('\n')}\nAdd each import statement at the top of the file (after any existing imports). Use EXACTLY these specifiers.`
    : `\n\n━━━ UNDEFINED SYMBOLS ━━━\nNone of the unresolved symbols are declared in this file's contract as imports from other files. For EACH unresolved symbol, EITHER define it locally in this file (class/function/type) OR import it from the correct sibling file. Never leave a bare reference to an undefined symbol.`;
  const intro = importLines.length
    ? `The file ${file.path} references symbols from other planned files but is MISSING the import statements, so it cannot compile.`
    : `The file ${file.path} references symbols that are NOT defined anywhere in the project (no sibling file exports them and they are not declared locally), so it cannot compile.`;
  const task = importLines.length
    ? `ADD the missing import statement(s) at the top of ${file.path} so every cross-file symbol it uses is imported from the correct file. ALSO: if the file imports from a module that is NOT a planned file (it does not exist — e.g. TS2307 "Cannot find module"), REMOVE that import and either implement the symbol locally or import it from a planned file that actually exports it. If the tsc errors include call-site mismatches (TS2554 wrong argument count, TS2304 missing name), correct those calls to match the REAL exported signatures of the imported members. Do NOT remove, rename, or restructure unrelated existing code — fix imports and the errors they cause. If a member is exported as the file's default export, a default import is acceptable instead.`
    : `For EACH unresolved symbol, EITHER define it locally in this file (class/function/type/const) OR import it from the correct sibling file. Do NOT invent an import from a file that does not exist — if a module import points at a non-existent file (TS2307), remove it. If a symbol is referenced but never defined or imported (TS2304/2552), correct the call sites to match the real signatures. Do NOT remove, rename, or restructure unrelated existing code.`;
  return `User request: ${request}\n\n${intro}\n\n━━━ CURRENT CONTENT ━━━\n${currentContent.substring(0, 6000)}\n\n━━━ MISSING-IMPORT VIOLATIONS ━━━\n${violations.join('\n')}${importBlock}\n\n━━━ TASK ━━━\n${task}\n\nReturn ONLY the file's raw code — no markdown fences, no JSON wrapper, no commentary.`;
}

/**
 * Finalize generated files (one-shot + per-file paths): partial-write gate,
 * post-write contract repair, then an in-route tsc gate with bounded repair.
 * Writes the files to a fresh export dir (returned so routes skip a second
 * write pass, exactly like chunked mode) and reports repair stats.
 */
/**
 * Normalize a tsc error line for stall comparison: strip the (line,col)
 * position so a repair that MOVES the same error to a new line — or reports
 * it at a different column — still counts as the same underlying issue.
 * Without this, moving-line errors never register as "stalled" and one
 * stubborn file can consume the whole repair budget.
 */
export function normalizeTscError(e: string): string {
  return e.replace(/\(\d+,\d+\)/g, '').trim();
}

// ─── Mechanical tsc classes ────────────────────────────────────────────────
// The audit's P2 list (TS2304/2305/2307/2322/2345/2582) plus the classes
// observed live in the multi-request probe: TS2355/TS7030 (missing return /
// not-all-paths-return) and TS2554 (call-site arity drift — cross-file, stays
// on the regenerate prompt until the whole-project repair pass lands).
const MECHANICAL_TSC_CLASSES = new Set([
  'TS2304', 'TS2305', 'TS2307', 'TS2322', 'TS2345', 'TS2355',
  'TS2503', 'TS2552', 'TS2554', 'TS2582', 'TS7030',
]);

/** Extract the error code ("TS2355") from a raw tsc error line, or null. */
export function tscErrorCode(e: string): string | null {
  const m = e.match(/error\s+(TS\d+)/);
  return m ? m[1] : null;
}

/** True when the tsc error is one of the known-mechanical classes. */
export function isMechanicalTscClass(e: string): boolean {
  const code = tscErrorCode(e);
  return !!code && MECHANICAL_TSC_CLASSES.has(code);
}

/**
 * Deterministic TS2355/TS7030 fix ("must return a value" / "not all code paths
 * return a value"): a function declared with a primitive non-void return type
 * whose body falls through the end gets a type-appropriate `return <default>;`
 * inserted before its closing brace. Zero LLM calls, no logic changes.
 * Only fires when the declared return type is a primitive we can synthesize a
 * safe default for (number → 0, string → '', boolean → false, bigint → 0n, and
 * the Promise<primitive> async twin). Returns the fixed content or null.
 */
export function applyDeterministicMissingReturnFix(content: string, errors: string[]): string | null {
  const DEFAULT_BY_TYPE: Record<string, string> = {
    number: '0',
    string: "''",
    boolean: 'false',
    bigint: '0n',
  };
  const lines = content.split('\n');
  let changed = false;
  // Process errors BOTTOM-UP (highest line first): every successful patch
  // splices a line in, shifting all later line numbers — consuming the errors
  // top-down would make stale positions match a DIFFERENT function's
  // signature. Descending order means an insertion can never invalidate an
  // error we still have to process.
  const errs = errors
    .map((e, i) => ({ e, i, loc: e.match(/\((\d+),(\d+)\)/) }))
    .filter(x => x.loc && /error\s+TS(2355|7030)/.test(x.e))
    .sort((a, b) => Number(b.loc![1]) - Number(a.loc![1]));
  for (const { e: err, loc } of errs) {
    // The error location points AT the declared return type, so the function
    // signature is on the error line itself.
    const lineNo = Number(loc![1]) - 1;
    const col = Number(loc![2]) - 1;
    const sigLine = lines[lineNo];
    if (!sigLine || col < 0 || col >= sigLine.length) continue;
    // Signature must declare a primitive (optionally Promise<>) return type
    // with a `{` body opening on the same line (the generated style):
    //   function foo(): number {        |  const foo = (): number => {
    //   export function foo(x): string { |  foo(): boolean {  (method)
    const sig = sigLine.match(/(\)\s*:\s*)((?:Promise<)?(number|string|boolean|bigint)(?:>)?)(\s*(?:=>\s*)?\{)/);
    if (!sig) continue;
    // Verify the error column actually falls at the start of the return-type
    // annotation we matched. tsc points AT the annotation (the `n` of `number`,
    // the `P` of `Promise<number>` — confirmed empirically) — so we anchor on
    // the FULL annotation including any `Promise<` prefix. Param types like
    // `(x: number)` can't be mistaken: the annotation is only looked for
    // after the signature's closing `)` (group 1 = `): `), and the column
    // must land on it.
    const annStart = sig.index !== undefined ? sig.index + sig[1].length : -1;
    if (annStart < 0 || col < annStart - 2 || col > annStart + sig[2].length + 2) continue;
    const defaultVal = DEFAULT_BY_TYPE[sig[3]];
    // Find the matching close brace, skipping string/comment contents.
    const openBrace = sigLine.indexOf('{', annStart + sig[2].length);
    if (openBrace < 0) continue;
    let depth = 0;
    let quote: string | null = null;
    let esc = false;
    let lineComment = false;
    let blockComment = false;
    let closeLi = -1;
    let closeIdx = -1;
    for (let li = lineNo; li < lines.length; li++) {
      const line = lines[li];
      const start = li === lineNo ? openBrace : 0;
      for (let ci = start; ci < line.length; ci++) {
        const ch = line[ci];
        const next = line[ci + 1];
        if (lineComment) continue;
        if (blockComment) { if (ch === '*' && next === '/') { blockComment = false; ci++; } continue; }
        if (quote) {
          if (esc) esc = false;
          else if (ch === '\\') esc = true;
          else if (ch === quote) quote = null;
          continue;
        }
        if (ch === '/' && next === '/') { lineComment = true; ci++; continue; }
        if (ch === '/' && next === '*') { blockComment = true; ci++; continue; }
        if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) { closeLi = li; closeIdx = ci; li = lines.length; break; }
        }
      }
      lineComment = false;
    }
    if (closeLi < 0) continue;
    const closeLine = lines[closeLi];
    // Only patch when the close brace sits at the start of its own line (the
    // generated style); a mid-line `}` (e.g. single-line bodies) means the
    // body's last statement shares the line and a whole-line splice would
    // corrupt it — fall through to the LLM prompts for those.
    if (closeLine.slice(0, closeIdx).trim().length > 0) continue;
    // Don't double-patch: skip if the statement right before the close is
    // already a return (shouldn't happen when the error fired, but be safe).
    const prior = lines[closeLi - 1]?.trim();
    if (prior && /^return(\s|;|$)/.test(prior)) continue;
    // Indent the inserted return one level DEEPER than the close brace (body
    // level), not at the close brace's own indent — top-level functions close
    // at column 0 and their statements live at 2.
    const closeIndent = closeLine.match(/^\s*/)?.[0] ?? '';
    const insertion = `${closeIndent}  return ${defaultVal};`;
    lines.splice(closeLi, 0, insertion);
    changed = true;
  }
  return changed ? lines.join('\n') : null;
}

/**
 * Deterministic TS2322 fix for void-typed functions: when a function declared
 * `: void` / `: Promise<void>` has `return <literal>;`, the value is discarded
 * anyway — rewrite it to `return;`. Zero LLM calls. Only strips LITERALS
 * (number/string/boolean/null) so no side-effecting expression is ever dropped;
 * anything else falls through to the LLM repair prompts.
 * Returns the fixed content or null.
 */
export function applyDeterministicVoidReturnFix(content: string, errors: string[]): string | null {
  if (!errors.some(e => /error\s+TS2322:.*not assignable to type '(Promise<)?void'/.test(e))) return null;
  const lines = content.split('\n');
  let changed = false;
  for (const err of errors) {
    if (!/error\s+TS2322:.*not assignable to type '(Promise<)?void'/.test(err)) continue;
    const loc = err.match(/\((\d+),(\d+)\)/);
    if (!loc) continue;
    const lineNo = Number(loc[1]) - 1;
    const col = Number(loc[2]) - 1;
    const line = lines[lineNo];
    if (!line || col < 0) continue;
    // Anchor on the error column: tsc points at the return statement. Find the
    // `return` keyword that starts at-or-before the column and rewrite only
    // THAT statement — never a `return <literal>;` that happens to sit inside
    // a string or comment elsewhere on the same line.
    const kw = line.lastIndexOf('return', col);
    if (kw < 0 || !/^return\s+/.test(line.slice(kw))) continue;
    // The `return` must be a REAL statement — not one inside a string literal
    // (`'return 42;'`), a comment (`// return 42;`), or an identifier
    // (`xreturn`). Check the char immediately before the keyword.
    if (kw > 0 && /['"`/A-Za-z0-9_$]/.test(line[kw - 1])) continue;
    const rest = line.slice(kw);
    // `return <literal>;` → `return;`  (literal-only: no side effects lost —
    // template literals are excluded when they interpolate `${...}` because
    // the expression inside may be side-effecting).
    const m = rest.match(/^return\s+((?:-?\d+(?:\.\d+)?|'[^']*'|"[^"]*"|`[^`$]*`|true|false|null))\s*;/);
    if (!m) continue;
    lines[lineNo] = line.slice(0, kw) + 'return;' + rest.slice(m[0].length);
    changed = true;
  }
  return changed ? lines.join('\n') : null;
}

// ─── Shared behavioral smoke gate (render + CLI) with bounded repair ─────
// tsc can't see single-file HTML OR whether a CLI actually runs — the
// behavioral class ("loads but doesn't work") is only fixable when the model
// sees the actual runtime errors. Both write paths (one-shot finalize and
// chunked) run the same bounded repair loop so a FAILED verdict feeds back to
// the model instead of shipping broken. Probes are injectable for tests.

/** A smoke-gate verdict shared by the render and CLI probes. */
export type SmokeVerdict = { status: 'passed' | 'failed' | 'skipped' | 'unavailable'; errors: string[]; detail: string };

/**
 * Run the render gate (HTML entries) and, when no HTML entry exists, the CLI
 * gate — each with a bounded repair loop (up to 2 rounds per gate). `canRepair`
 * / `consumeRepair` hook into the caller's shared LLM-repair budget so the
 * smoke phase can never starve (or be starved by) other phases; `tag` prefixes
 * logs so finalize vs chunked runs are distinguishable. Mutates `files` in
 * place when a repair rewrites the failing entry.
 */
export async function runBehavioralSmokeGates(opts: {
  request: string;
  files: Array<{ path: string; content: string }>;
  contractFiles: PlannedFile[];
  exportDir: string;
  timeoutMs: number;
  tag: string;
  canRepair: () => boolean;
  consumeRepair: () => void;
  renderProbe?: typeof runRenderSmoke;
  cliProbe?: typeof runCliSmoke;
  /** Injectable for tests: returns the rewritten file content (or '' / unchanged to abort). */
  repairCall?: (prompt: string) => Promise<string>;
}): Promise<{ renderSmoke: SmokeVerdict; cliSmoke: SmokeVerdict }> {
  const { request, files, contractFiles, exportDir, timeoutMs, tag } = opts;
  const canRepair = opts.canRepair;
  const consumeRepair = opts.consumeRepair;
  const renderProbe = opts.renderProbe ?? runRenderSmoke;
  const cliProbe = opts.cliProbe ?? runCliSmoke;
  // Default repair call: LLM rewrite of the failing file (raw-code contract —
  // strip fences/JSON wrappers exactly like the write paths do).
  const repairCall = opts.repairCall
    ?? (async (prompt: string): Promise<string> => {
        const raw = await translator.reason(prompt, FILE_WRITE_PROMPT, { maxTokens: 8192, timeoutMs });
        let content = cleanLLMResponse(raw);
        const wrapped = extractJSON<{ content?: string }>(content);
        if (wrapped && typeof wrapped.content === 'string') content = wrapped.content;
        else content = content.replace(/^```(?:\w+)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        return content;
      });

  // Render gate: smoke-test HTML entries in headless Chrome. A FAILED verdict
  // (console/page errors, interaction-crash, or blank page) feeds back into a
  // bounded repair loop — the "loads but doesn't work" class is only fixable
  // when the model sees the actual runtime errors.
  let renderSmoke = await renderProbe(exportDir, files);
  const MAX_SMOKE_REPAIR_ROUNDS = 2;
  let smokeRounds = 0;
  while (renderSmoke.status === 'failed' && smokeRounds < MAX_SMOKE_REPAIR_ROUNDS && canRepair()) {
    smokeRounds += 1;
    const htmlEntry = files.find(f => /\.html?$/i.test(f.path) && (f.content || '').trim().length > 0);
    if (!htmlEntry) break;
    const planned = contractFiles.find(t => normalizeContractPath(t.path) === normalizeContractPath(htmlEntry.path))
      || { path: htmlEntry.path, summary: 'HTML app', language: 'html' };
    consumeRepair();
    console.warn(`[codePlanner] ${tag} render smoke: FAILED (${renderSmoke.detail}) — behavioral repair round ${smokeRounds}`);
    emitCodegenProgress({ phase: 'validating', percent: 90 + smokeRounds * 3, message: `Fixing ${renderSmoke.errors.length} runtime error(s) in ${htmlEntry.path}…` });
    const prompt = buildRenderSmokeRepairPrompt(request, planned, htmlEntry.content, renderSmoke.errors, renderSmoke.detail);
    const content = await repairCall(prompt);
    if (!content || content === htmlEntry.content) {
      console.warn(`[codePlanner] ${tag} render smoke: repair round ${smokeRounds} produced no usable rewrite — stopping`);
      break;
    }
    htmlEntry.content = content;
    // Re-apply the self-containment pass: a repair that introduces external
    // <script src> refs must still yield a single-file preview-ready entry.
    inlineExternalScriptRefs(files);
    fs.writeFileSync(safeJoin(exportDir, htmlEntry.path), htmlEntry.content, 'utf-8');
    renderSmoke = await renderProbe(exportDir, files);
  }
  if (renderSmoke.status !== 'skipped') {
    console.log(`[codePlanner] ${tag} render smoke: ${renderSmoke.status} (${renderSmoke.detail})${smokeRounds ? ` after ${smokeRounds} repair round(s)` : ''}`);
  }

  // CLI gate: for non-HTML projects, execute the entry under tsx and feed a
  // FAILED verdict into the same bounded repair loop — the "compiles but
  // doesn't work" class for CLIs (type-only imports erased at runtime,
  // undefined symbols, stub bodies that print nothing).
  let cliSmoke = renderSmoke.status !== 'skipped'
    ? { status: 'skipped' as const, errors: [], detail: 'HTML entry present — render gate used' }
    : await cliProbe(exportDir, files);
  const MAX_CLI_SMOKE_REPAIR_ROUNDS = 2;
  let cliSmokeRounds = 0;
  while (cliSmoke.status === 'failed' && cliSmokeRounds < MAX_CLI_SMOKE_REPAIR_ROUNDS && canRepair()) {
    cliSmokeRounds += 1;
    const entryPath = pickCliEntryFile(files);
    const entry = entryPath ? files.find(f => f.path === entryPath) : undefined;
    if (!entry) break;
    const planned = contractFiles.find(t => normalizeContractPath(t.path) === normalizeContractPath(entry.path))
      || { path: entry.path, summary: 'CLI app', language: 'typescript' };
    consumeRepair();
    console.warn(`[codePlanner] ${tag} cli smoke: FAILED (${cliSmoke.detail}) — behavioral repair round ${cliSmokeRounds}`);
    emitCodegenProgress({ phase: 'validating', percent: 90 + cliSmokeRounds * 3, message: `Fixing ${cliSmoke.errors.length} runtime error(s) in ${entry.path}…` });
    const prompt = buildCliSmokeRepairPrompt(request, planned, entry.content || '', cliSmoke.errors, cliSmoke.detail);
    const content = await repairCall(prompt);
    if (!content || content === entry.content) {
      console.warn(`[codePlanner] ${tag} cli smoke: repair round ${cliSmokeRounds} produced no usable rewrite — stopping`);
      break;
    }
    entry.content = content;
    fs.writeFileSync(safeJoin(exportDir, entry.path), content, 'utf-8');
    cliSmoke = await cliProbe(exportDir, files);
  }
  if (cliSmoke.status !== 'skipped') {
    console.log(`[codePlanner] ${tag} cli smoke: ${cliSmoke.status} (${cliSmoke.detail})${cliSmokeRounds ? ` after ${cliSmokeRounds} repair round(s)` : ''}`);
  }
  return { renderSmoke, cliSmoke };
}

async function finalizeGeneratedFiles(
  request: string,
  files: Array<{ path: string; content: string }>,
  contractFiles: PlannedFile[],
  intentSection: string,
  answersText: string,
  fileList: string,
  timeoutMs: number
): Promise<{
  files: Array<{ path: string; content: string }>;
  exportDir: string;
  repairRounds: number;
  tscErrors: number;
  contractViolations: number;
  /** True when the independent tsc gate actually ran and gave a verdict. */
  tscVerified: boolean;
  /** The independent tsc gate's verdict: 'clean' | 'errors' | 'skipped' | 'unavailable'. */
  compileStatus: 'clean' | 'errors' | 'skipped' | 'unavailable';
  /** Headless-Chrome render smoke-test verdict for HTML entries (3D gate). */
  renderSmoke: { status: 'passed' | 'failed' | 'skipped' | 'unavailable'; errors: string[]; detail: string };
  /** tsx-execution behavioral gate verdict for non-HTML (CLI/script) entries. */
  cliSmoke: { status: 'passed' | 'failed' | 'skipped' | 'unavailable'; errors: string[]; detail: string };
}> {
  // 1b) Partial one-shot acceptance gate: fill in any planned files the
  //     (possibly truncated) response never wrote, per-file.
  let working = [...files];
  const missing = findMissingPlannedFiles(working, contractFiles);
  if (missing.length > 0) {
    console.warn(`[codePlanner] partial write: ${working.length}/${contractFiles.length} file(s) present — generating ${missing.length} missing file(s) per-file`);
    emitCodegenProgress({ phase: 'generating', percent: 48, generatingNodes: missing.map(f => f.path), message: `Filling ${missing.length} file(s) the one-shot skipped…` });
    for (let mi = 0; mi < missing.length; mi++) {
      const f = missing[mi];
      emitCodegenProgress({
        phase: 'generating',
        batch: mi,
        totalBatches: missing.length,
        generatingNodes: [f.path],
        percent: 50 + Math.round((mi / Math.max(1, missing.length)) * 12),
        message: `Generating missing file ${f.path}…`,
      });
      const contractBlock = buildPerFileContractBlock(f, contractFiles);
      const isHtmlFile = f.language?.toLowerCase() === 'html' || /\.html?$/i.test(f.path);
      const prompt = `User request: ${request}\n\n${intentSection}\n\n━━━ PROJECT PLAN ━━━\n${fileList}\n\n${contractBlock}\n\n━━━ USER ANSWERS ━━━\n${answersText}\n${isHtmlFile ? `\n${GUI_WIDGET_SECTION}\n${APP_QUALITY_RULES}` : ''}\n\n━━━ TASK ━━━\nWrite the COMPLETE, production-quality content for the file: ${f.path}\nLanguage: ${f.language}\nPurpose: ${f.summary}\n\nImport from the other planned files ONLY the members declared in this file's contract above. NEVER reference an undeclared member.${isHtmlFile ? ' For GUI files, copy the WIDGET TEMPLATES above verbatim AND follow the APP QUALITY RULES above.' : ''} Return ONLY the file's raw code — no markdown fences, no JSON wrapper, no commentary.`;
      const raw = await translator.reason(prompt, getFileWritePromptWithContext(f), { maxTokens: 4096, timeoutMs });
      let content = cleanLLMResponse(raw);
      const wrapped = extractJSON<{ content?: string }>(content);
      if (wrapped && typeof wrapped.content === 'string') content = wrapped.content;
      else content = content.replace(/^```(?:\w+)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      if (content) working.push({ path: f.path, content });
    }
  }

  // Phase-1 closure: verify GENERATED code against declared contracts and
  // repair the offending files (bounded — 2 rounds, stop when nothing changes).
  // A shared repair-call budget caps total LLM work across BOTH repair phases
  // so a drifted 12-file plan can't turn one request into a multi-minute crawl.
  let repairCalls = 0;
  // Per-phase budgets: the contract phase is capped at 4 calls, and the tsc
  // gate gets the remaining ~12-16 of the shared pool (the tsc loop checks
  // MAX_REPAIR_CALLS — a shared 6-call pool let contract repair starve the tsc
  // gate: 18 errors with 0 repair rounds was the observed failure).
  const MAX_CONTRACT_REPAIR_CALLS = 4;
  const MAX_TSC_REPAIR_CALLS = 12; // was 8 — the gate must chase the mechanical classes (TS2304/2305/2307/2322/2345/2582) to 0
  // Reserved slice for the behavioral smoke repair that runs LAST: each phase
  // owns its own budget so a later phase is never starved by an earlier one
  // (the exact contract-vs-tsc starvation bug this design already fixed — a
  // tsc-heavy repair must not silently prevent the smoke gate from ever firing).
  const MAX_SMOKE_REPAIR_CALLS = 4;
  const MAX_TSC_PHASE_CALLS = MAX_CONTRACT_REPAIR_CALLS + MAX_TSC_REPAIR_CALLS;
  const MAX_REPAIR_CALLS = MAX_TSC_PHASE_CALLS + MAX_SMOKE_REPAIR_CALLS;
  let contractViolations = 0;
  let violations = verifyGeneratedContracts(working, contractFiles);
  const initialViolations = violations.length;
  let contractRounds = 0;
  while (violations.length > 0 && contractRounds < 2 && repairCalls < MAX_CONTRACT_REPAIR_CALLS) {
    contractRounds += 1;
    console.warn(`[codePlanner] contract verifier (round ${contractRounds}): ${violations.length} violation(s)`);
    emitCodegenProgress({ phase: 'validating', percent: 66 + contractRounds * 4, message: `Verifying file contracts — ${violations.length} violation(s) to fix…` });
    const byFile = new Map<string, string[]>();
    for (const v of violations) {
      // Violations may carry an [IMPORT] tag — strip it so the FILE PATH is the
      // grouping key (matching `[IMPORT] src/storage.ts ...` to src/storage),
      // not the tag itself, which never matches any planned file.
      const m = v.match(/^(?:\[[A-Z]+\]\s+)?([^ ]+)/);
      if (!m) continue;
      const key = normalizeContractPath(m[1]);
      if (!byFile.has(key)) byFile.set(key, []);
      byFile.get(key)!.push(v);
    }
    let changed = false;
    for (const cf of working) {
      if (repairCalls >= MAX_REPAIR_CALLS) break;
      const errs = byFile.get(normalizeContractPath(cf.path));
      if (!errs || !errs.length) continue;
      repairCalls += 1;
      const planned = contractFiles.find(t => normalizeContractPath(t.path) === normalizeContractPath(cf.path))
        || { path: cf.path, summary: '', language: '' };
      // Missing-import violations get the dedicated import prompt (add imports,
      // don't rewrite logic) — the generic contract prompt kept failing them.
      const allImportClass = errs.length > 0 && errs.every(e => e.startsWith('[IMPORT]'));
      // P1 import-only patch: a file whose ONLY contract violations are
      // missing-import ([IMPORT]) gets the plan-declared imports inserted
      // DETERMINISTICALLY — zero LLM calls, and the model never gets a chance
      // to restructure unrelated code while re-omitting the imports. Falls
      // through to the LLM import prompt only when there is nothing to add.
      if (allImportClass) {
        const patched = applyDeterministicImportPatch(cf.content, planned, contractFiles);
        if (patched && patched !== cf.content) {
          cf.content = patched;
          changed = true;
          console.warn(`[codePlanner] contract verifier: ${cf.path} missing-import violations fixed by deterministic import insert (no LLM call)`);
          continue;
        }
      }
      // Phantom npm-dependency imports (check 2c, TS2307 class) are removed
      // deterministically for ANY file with at least one [IMPORT] violation
      // (not just pure-import files) — the strip is idempotent and zero-LLM.
      // The tsc gate picks up any now-undefined symbols (TS2304) if the
      // removed members were used.
      if (errs.some(e => e.startsWith('[IMPORT]'))) {
        const stripped = stripPhantomPackageImports(cf.content);
        if (stripped && stripped !== cf.content) {
          cf.content = stripped;
          changed = true;
          console.warn(`[codePlanner] contract verifier: ${cf.path} phantom npm-dependency imports removed deterministically (no LLM call)`);
          continue;
        }
      }
      repairCalls += 1;
      const prompt = allImportClass
        ? buildMissingImportRepairPrompt(request, planned, cf.content, errs, contractFiles)
        : buildContractRepairPrompt(request, planned, cf.content, errs, contractFiles);
      const raw = await translator.reason(prompt, FILE_WRITE_PROMPT, { maxTokens: 4096, timeoutMs });
      let content = cleanLLMResponse(raw);
      const wrapped = extractJSON<{ content?: string }>(content);
      if (wrapped && typeof wrapped.content === 'string') content = wrapped.content;
      else content = content.replace(/^```(?:\w+)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      if (content && content !== cf.content) { cf.content = content; changed = true; }
    }
    violations = verifyGeneratedContracts(working, contractFiles);
    if (!changed) break; // repair produced no change — don't loop forever
  }
  // Report the RESIDUAL violation count (what survived repair) — the initial
  // count is logged separately so the response's contractViolations reflects
  // the actual state of the written code, not the state at round start.
  contractViolations = violations.length;
  if (initialViolations > 0) {
    console.warn(`[codePlanner] contract verifier: ${initialViolations} initial violation(s), ${contractViolations} remaining after ${contractRounds} round(s)`);
  }

  // Phase 5: in-route tsc gate — write to disk, compile, repair, re-check.
  // Mirrors the chunked loop so "compiles" is a gate on every write path.
  const exportDir = getExportDir(request);
  inlineExternalScriptRefs(working); // GUI entry must be self-contained for preview
  for (const f of working) {
    const fullPath = safeJoin(exportDir, f.path);
    fs.mkdirSync(pathModule.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, f.content, 'utf-8');
  }
  let repairRounds = 0;
  let tscVerdict = await runTscCheck(exportDir, working);
  emitCodegenProgress({ phase: 'validating', percent: 76, message: tscVerdict.errors.length ? `Compiling with tsc — ${tscVerdict.errors.length} error(s)…` : 'Compiling with tsc…' });
  // MACRO LOOP — per-file repair and whole-project repair ALTERNATE so each
  // strategy re-runs on the error set the OTHER one left behind: whole-project
  // rewrites shift the interfaces, so the per-file pass must then re-chase the
  // NEW error set (and vice versa). Running each exactly once stranded errors
  // only the other strategy could reach. Bounded by MAX_MACRO_ROUNDS plus the
  // shared repairCalls budget — a hard project can't become an unbounded crawl.
  // Per-file stall state resets each macro round (the files changed beneath it).
  const MAX_MACRO_ROUNDS = 2;
  let macroRound = 0;
  // Cheap content signature (path + length + head) so the macro loop can detect
  // a round in which NEITHER pass modified any file — re-running on identical
  // content with a fresh stall map would just re-spend LLM calls for nothing.
  const contentSignature = (files: Array<{ path: string; content: string }>): string =>
    files.map(f => `${f.path}|${f.content.length}|${f.content.slice(0, 60)}`).join('\n');
  // The tsc phase is capped at its OWN slice (contract + tsc) so the smoke
  // gate's reserved budget is never consumed by compile repairs.
  while (tscVerdict.errors.length && macroRound < MAX_MACRO_ROUNDS && repairCalls < MAX_TSC_PHASE_CALLS) {
    macroRound += 1;
    const sigBeforeRound = contentSignature(working);
  // Files that already got a tiny import-only patch call this gate — if one
  // is still failing import-class errors on a later round, escalate to the
  // whole-file import prompt (the stubborn phantom-module case).    // NOTE: importPatchedFiles resets each macro round intentionally — after
    // the whole-project pass rewrites files, a file that got its one tiny
    // import-patch call in an earlier round deserves a fresh patch attempt on
    // the NEW content (escalation still happens within a round on 2nd+ tries).
    const importPatchedFiles = new Set<string>();
    let round = 0;
  // Chase compile errors to ZERO for the mechanical classes (TS2304/2305/2307/
  // 2322/2345/2582): up to 6 rounds per macro round so a stubborn file gets
  // several regenerate-with-errors-in-context chances instead of shipping with
  // errors. Per-file stall tracking gives up on ONE file whose error set hasn't
  // moved after 2 repaired rounds (so a single unfixable file can't consume the
  // shared budget) while the other files keep being chased. The loop still
  // stops early when a round changes nothing globally (unfixable drift must
  // not burn the whole budget) or when the shared repair budget is spent.
  const lastErrsByFile = new Map<string, string[]>();
  const stalledRounds = new Map<string, number>();
  const sameErrors = (a: string[] | undefined, b: string[]): boolean =>
    !!a && a.length === b.length && a.every((e, i) => normalizeTscError(e) === normalizeTscError(b[i]));
  const noteStall = (key: string, changed: boolean, errs: string[]): void => {
    const prev = lastErrsByFile.get(key);
    if (changed) stalledRounds.set(key, 0);
    else if (prev !== undefined && sameErrors(prev, errs)) stalledRounds.set(key, (stalledRounds.get(key) || 0) + 1);
    else stalledRounds.set(key, 1);
    lastErrsByFile.set(key, errs);
  };
  while (tscVerdict.errors.length && round < 6 && repairCalls < MAX_TSC_PHASE_CALLS) {
    round += 1;
    repairRounds += 1;
    let roundChanged = false;
    console.warn(`[codePlanner] tsc gate: ${tscVerdict.errors.length} error(s) — repair round ${round}`);
    emitCodegenProgress({ phase: 'validating', percent: 80 + round * 7, message: `Fixing ${tscVerdict.errors.length} compile error(s)…` });
    const errByFile = new Map<string, string[]>();
    const addErr = (key: string, e: string) => {
      if (!key) return;
      if (!errByFile.has(key)) errByFile.set(key, []);
      errByFile.get(key)!.push(e);
    };
    for (const e of tscVerdict.errors) {
      const m = e.match(/^([^:]+)\s*\(/);
      if (!m) continue;
      const absPath = m[1].trim();
      const rel = absPath.startsWith(exportDir)
        ? absPath.slice(exportDir.length).replace(/^[/\\]+/, '')
        : (absPath.split(/[\\/]/).pop() || '');
      addErr(normalizeContractPath(rel), e);
      addErr(normalizeContractPath(absPath.split(/[\\/]/).pop() || ''), e);
    }
    for (const cf of working) {
      if (repairCalls >= MAX_TSC_PHASE_CALLS) break;
      const cfPathKey = normalizeContractPath(cf.path);
      const cfBaseKey = normalizeContractPath(cf.path.split('/').pop() || '');
      const fileErrs = errByFile.get(cfPathKey) || errByFile.get(cfBaseKey);
      if (!fileErrs || !fileErrs.length) continue;
      // Per-file stall: a file whose error set is UNCHANGED after 2 repaired
      // rounds is unfixable by the current prompts — give up on IT (so one
      // stuck file can't consume the shared budget) while the other files keep
      // being chased to zero.
      if (sameErrors(lastErrsByFile.get(cfPathKey), fileErrs) && (stalledRounds.get(cfPathKey) || 0) >= 2) {
        console.warn(`[codePlanner] tsc gate: ${cf.path} unchanged for ${stalledRounds.get(cfPathKey)} round(s) — skipping, repairing others`);
        continue;
      }
      repairCalls += 1;
      const planned = contractFiles.find(t => normalizeContractPath(t.path) === cfPathKey)
        || { path: cf.path, summary: '', language: '' };
      // P2 name-drift fix (zero LLM): TS2305 (import member not exported,
      // e.g. `import { Todo }` while the target declares `interface TodoItem`)
      // — align the import binding with the target's ACTUAL exports via an
      // `as` alias so every usage stays valid. Whole-file regenerates re-roll
      // the drift because each file is repaired in isolation.
      const driftFixed = applyDeterministicNameDriftFix(cf.content, cf.path, working, fileErrs);
      if (driftFixed && driftFixed !== cf.content) {
        cf.content = driftFixed;
        fs.writeFileSync(safeJoin(exportDir, cf.path), driftFixed, 'utf-8');
        roundChanged = true;
        noteStall(cfPathKey, true, fileErrs);
        console.warn(`[codePlanner] tsc gate: ${cf.path} TS2305 name-drift fixed deterministically (import alias)`);
        continue; // re-check after the loop — no repair call spent
      }
      // P1 import-only patch path: when EVERY error in this file is a
      // missing-import class error (TS2304/2503/2552/2307), try the
      // NOTE: TS2582 ("Cannot find name 'require'") is deliberately NOT in
      // this class — fixing it needs a body rewrite (require → ESM import or
      // createRequire), which the import-only prompts forbid; it routes to the
      // regenerate prompt below instead.
      // DETERMINISTIC plan-driven import insert first — zero LLM calls and it
      // cannot restructure unrelated code. Only if nothing was added (phantom
      // modules, symbols outside the plan's `uses`) do we spend ONE repair
      // call on a tiny import-only patch (add/remove statements, never a
      // whole-file rewrite). Mixed-class files (import errors + shape drift /
      // arity) skip this path and fall through to the existing whole-file
      // prompts — a bare import patch cannot fix TS2339/TS2554.
      // Phantom npm-dependency imports (TS2307 for a package that isn't
      // installed) are stripped deterministically for ANY file with a
      // missing-module error (not just pure-import files) — idempotent, zero
      // LLM calls, no body changes. Remaining undefined symbols route to the
      // import repair below.
      if (fileErrs.some(e => /error TS2307/.test(e))) {
        const stripped = stripPhantomPackageImports(cf.content);
        if (stripped && stripped !== cf.content) {
          cf.content = stripped;
          fs.writeFileSync(safeJoin(exportDir, cf.path), stripped, 'utf-8');
          roundChanged = true;
          noteStall(cfPathKey, true, fileErrs);
          console.warn(`[codePlanner] tsc gate: ${cf.path} phantom npm-dependency imports removed deterministically (no LLM call)`);
          continue; // re-check after the loop — no repair call spent
        }
      }
      // Missing-return class (TS2355/TS7030) and void-return class (TS2322
      // into `void`/`Promise<void>`): deterministic zero-LLM fixes — insert a
      // type-appropriate default return / drop a discarded literal value.
      // Each is idempotent and re-verified by the gate; anything they can't
      // safely touch falls through to the LLM prompts below.
      if (fileErrs.some(e => /error\s+TS(2355|7030)/.test(e))) {
        const missingRet = applyDeterministicMissingReturnFix(cf.content, fileErrs);
        if (missingRet && missingRet !== cf.content) {
          cf.content = missingRet;
          fs.writeFileSync(safeJoin(exportDir, cf.path), missingRet, 'utf-8');
          roundChanged = true;
          noteStall(cfPathKey, true, fileErrs);
          console.warn(`[codePlanner] tsc gate: ${cf.path} TS2355/TS7030 missing-return fixed deterministically (no LLM call)`);
          continue;
        }
      }
      if (fileErrs.some(e => /error\s+TS2322:.*not assignable to type '(Promise<)?void'/.test(e))) {
        const voidRet = applyDeterministicVoidReturnFix(cf.content, fileErrs);
        if (voidRet && voidRet !== cf.content) {
          cf.content = voidRet;
          fs.writeFileSync(safeJoin(exportDir, cf.path), voidRet, 'utf-8');
          roundChanged = true;
          noteStall(cfPathKey, true, fileErrs);
          console.warn(`[codePlanner] tsc gate: ${cf.path} TS2322-void return fixed deterministically (no LLM call)`);
          continue;
        }
      }
      if (fileErrs.length > 0 && fileErrs.every(e => /error TS(2304|2503|2552|2307)/.test(e))) {
        const patched = applyDeterministicImportPatch(cf.content, planned, contractFiles);
        if (patched && patched !== cf.content) {
          cf.content = patched;
          fs.writeFileSync(safeJoin(exportDir, cf.path), patched, 'utf-8');
          roundChanged = true;
          noteStall(cfPathKey, true, fileErrs);
          console.warn(`[codePlanner] tsc gate: ${cf.path} missing-import errors fixed by deterministic import insert (no LLM call)`);
          continue; // re-check after the loop — no repair call spent
        }
        // Deterministic insert couldn't help (phantom modules, symbols outside
        // the plan's `uses`). FIRST time for this file: ONE tiny import-only
        // patch call (add/remove statements, never a whole-file rewrite). If a
        // patch was already attempted and the file STILL has import-class
        // errors, escalate to the whole-file import prompt (removes bad
        // modules, defines/imports out-of-plan symbols) — last resort.
        let content: string | null = null;
        if (importPatchedFiles.has(cfPathKey)) {
          // Second+ attempt on this file: the import-only prompts failed, so
          // REGENERATE the whole file against a line-numbered copy with each
          // error at its exact line — this is what finally fixes a phantom
          // SYMBOL (referenced but never defined anywhere: the model must
          // either define it locally or import it, and the numbered source
          // makes the undeclared-reference sites impossible to miss).
          repairCalls += 1; // this is a real LLM repair call — count it against the budget
          const regeneratePrompt = buildRegenerateWithErrorsPrompt(request, planned, cf.content, fileErrs, contractFiles);
          const raw = await translator.reason(regeneratePrompt, FILE_WRITE_PROMPT, { maxTokens: 4096, timeoutMs });
          let c = cleanLLMResponse(raw);
          const wrapped = extractJSON<{ content?: string }>(c);
          if (wrapped && typeof wrapped.content === 'string') c = wrapped.content;
          else c = c.replace(/^```(?:\w+)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
          content = c && c !== cf.content ? c : null;
        } else {
          importPatchedFiles.add(cfPathKey);
          repairCalls += 1;
          const patchRaw = await translator.reason(buildImportPatchPrompt(request, planned, cf.content, fileErrs, contractFiles), FILE_WRITE_PROMPT, { maxTokens: 1200, timeoutMs });
          const patch = extractJSON<{ add?: string[]; remove?: string[] }>(cleanLLMResponse(patchRaw));
          if (patch && (Array.isArray(patch.add) || Array.isArray(patch.remove))) {
            const applied = applyImportPatch(cf.content, patch);
            content = applied !== cf.content ? applied : null;
          }
          // Patch unparseable/empty — fall back to the whole-file import prompt now.
          if (!content) content = await wholeFileImportRepair(request, planned, cf.content, fileErrs, contractFiles, timeoutMs);
        }
        if (content) {
          fs.writeFileSync(safeJoin(exportDir, cf.path), content, 'utf-8');
          cf.content = content;
          roundChanged = true;
        }
        noteStall(cfPathKey, !!content, fileErrs);
        continue;
      }
      // Classify tsc errors by fix type:
      //  - TS2304/2503/2552/2307/2582 "Cannot find name/namespace/module/global X" =
      //    missing-import or phantom-symbol/module signature → the dedicated
      //    import prompt first (ADD the import or define the symbol locally;
      //    REMOVE imports of files that don't exist; don't rewrite logic).
      //    NOTE: TS2339 ("Property X does not exist on type Y") is deliberately
      //    NOT in this class — it is cross-file API-shape drift (e.g. `.done`
      //    vs `.completed`), and the import prompt's "only add imports, don't
      //    restructure" instruction would block the model from fixing the
      //    actual property mismatch. It goes straight to the regenerate prompt.
      // `some` (not `every`) on the missing-name class: a file that mixes a
      // missing-import error with, say, argument-count errors (probe8: main.ts
      // had TS2304 + TS2554) must still go to the import prompt — under `every`
      // it fell to the generic prompt, which fixed the arity but left the
      // missing import. The import prompt handles both (add/remove imports AND
      // correct the call sites).
      const missingNameClass = fileErrs.length > 0 && fileErrs.some(e => /error TS(2304|2503|2552|2307|2582)/.test(e));
      const mixedNameClass = missingNameClass && !fileErrs.every(e => /error TS(2304|2503|2552|2307)/.test(e));
      // Regenerate-with-errors-in-context is the PRIMARY repair strategy for
      // every non-import class (TS2322/2345/2582 assignability, TS2339 shape
      // drift, TS2305/2614 wrong-member, TS2355/TS7030 missing-return after the
      // deterministic default-return fix, and TS2554 cross-file arity — the
      // probe's game failure class, which needs the whole-project pass): the
      // model rewrites the whole file against a LINE-NUMBERED copy with each
      // compiler error at its exact line — line-patching the same file again is
      // how TS2339/TS2459-style drift survives. Import-class files stay on the
      // narrower import prompts and escalate to regeneration when their errors
      // are MIXED (a phantom-symbol survivor like TS2304 + TS2339 needs the
      // full numbered rewrite).
      const repairPrompt = missingNameClass
        ? (mixedNameClass && round >= 2)
          ? buildRegenerateWithErrorsPrompt(request, planned, cf.content, fileErrs, contractFiles)
          : buildMissingImportRepairPrompt(request, planned, cf.content, fileErrs, contractFiles)
        : buildRegenerateWithErrorsPrompt(request, planned, cf.content, fileErrs, contractFiles);
      const raw = await translator.reason(repairPrompt, FILE_WRITE_PROMPT, { maxTokens: 4096, timeoutMs });
      let content = cleanLLMResponse(raw);
      const wrapped = extractJSON<{ content?: string }>(content);
      if (wrapped && typeof wrapped.content === 'string') content = wrapped.content;
      else content = content.replace(/^```(?:\w+)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      if (content && content !== cf.content) {
        fs.writeFileSync(safeJoin(exportDir, cf.path), content, 'utf-8');
        cf.content = content;
        roundChanged = true;
      }
      noteStall(cfPathKey, !!(content && content !== cf.content), fileErrs);
    }
    tscVerdict = await runTscCheck(exportDir, working);
    // A round that changed no file content means the remaining errors are
    // unfixable by the current prompts — stop so the loop never burns the
    // whole budget on the same errors (was: loop ran until budget cap only).
    if (!roundChanged) break;
  }
  // GAP #5 — whole-project repair pass: the per-file loop above rewrote each
  // erroring file in isolation and residual errors survive. Those survivors are
  // almost always CROSS-FILE INTERFACE DRIFT (TS2554 arity, TS2339 shape,
  // TS2322/TS2345 type disagreement) which single-file rewrites can never
  // reconcile — rewrite ALL involved files (erroring + their import targets)
  // TOGETHER in one bounded call so both sides align in a single shot. If
  // errors STILL survive after this pass, the macro loop re-runs the per-file
  // pass on the shifted error set (fresh stall state) and tries again.
  if (tscVerdict.errors.length > 0) {
    const wholeProject = await runWholeProjectRepair(request, working, contractFiles, exportDir, tscVerdict, timeoutMs);
    working = wholeProject.files;
    tscVerdict = wholeProject.verdict;
    repairRounds += wholeProject.rounds;
  }
  // A round that changed NO file content (per-file stalled AND whole-project
  // rewrote nothing) means the remaining errors are unfixable by either
  // strategy — stop instead of re-running the same passes on the same bytes.
  if (contentSignature(working) === sigBeforeRound) break;
  } // end macro round — alternation of per-file and whole-project repair
  const remainingErrors = tscVerdict.errors.length;
  const verdictMsg = remainingErrors
    ? `Generated ${working.length} file(s) — ${remainingErrors} compile error(s) remain`
    : tscVerdict.status === 'clean'
      ? `Generated ${working.length} file(s), tsc-clean`
      : tscVerdict.status === 'skipped'
        ? `Generated ${working.length} file(s) — no TypeScript files, nothing to compile`
        : `Generated ${working.length} file(s) — WARNING: tsc gate unavailable, compile NOT verified`;
  // Behavioral + 3D gate: tsc can't see single-file HTML, so smoke-test it in
  // Chrome. A FAILED smoke verdict (console/page errors, interaction-crash, or
  // blank page) feeds back into a bounded repair loop — same pattern as the tsc
  // gate — because the behavioral class ("loads but doesn't work") is only
  // fixable when the model sees the actual runtime errors. Non-HTML projects
  // get the CLI gate instead (executes the entry under tsx). Shared helper so
  // the chunked path gets identical repair treatment.
  const { renderSmoke, cliSmoke } = await runBehavioralSmokeGates({
    request,
    files: working,
    contractFiles,
    exportDir,
    timeoutMs,
    tag: 'finalize',
    canRepair: () => repairCalls < MAX_REPAIR_CALLS,
    consumeRepair: () => { repairCalls += 1; },
  });
  console.log(`[codePlanner] finalize: ${working.length} file(s), ${repairRounds} tsc repair round(s), ${remainingErrors} remaining tsc error(s) [gate: ${tscVerdict.status}], ${contractViolations} contract violation(s)`);
  emitCodegenProgress({ phase: 'validating', percent: 95, message: verdictMsg });
  return { files: working, exportDir, repairRounds, tscErrors: remainingErrors, contractViolations, tscVerified: tscVerdict.status === 'clean' || tscVerdict.status === 'errors', compileStatus: tscVerdict.status, renderSmoke, cliSmoke };
}

// ─── Live progress broadcast (P2: a one-shot call is silent for minutes) ──
// The one-shot write path is a single opaque LLM call that can run for minutes
// with zero client feedback. These helpers broadcast phase-level progress over
// the existing Socket.IO channel (the same generation_progress events the
// canvas /files path emits) so the chat panel and live preview stay informed:
// what phase we're in, which files are being generated, a percent, and a
// human-readable message. Best-effort — a failed broadcast never affects
// generation, and everything is a no-op when no Socket.IO server is attached.

interface CodegenProgressEvent {
  phase: string;
  percent: number;
  batch?: number;
  totalBatches?: number;
  generatingNodes?: string[];
  message?: string;
}

/**
 * Broadcast a codegen progress event (percent clamped to [0,100], sensible
 * batch defaults, optional message). Never throws. Injectable `broadcast` makes
 * the clamping/defaulting logic unit-testable without a live Socket.IO server.
 */
export function emitCodegenProgress(
  p: CodegenProgressEvent,
  broadcast: (x: { batch: number; totalBatches: number; batchSize: number; generatingNodes: string[]; percent: number; phase: string; message?: string }) => void = broadcastGenerationProgress
): void {
  try {
    broadcast({
      batch: p.batch ?? 0,
      totalBatches: p.totalBatches ?? 1,
      batchSize: p.generatingNodes?.length ?? 0,
      generatingNodes: p.generatingNodes ?? [],
      percent: Math.max(0, Math.min(100, Math.round(p.percent))),
      phase: p.phase,
      ...(p.message ? { message: p.message } : {}),
    });
  } catch (err) {
    console.warn('[codePlanner] progress broadcast failed (non-fatal):', err);
  }
}

/**
 * Run a heartbeat during a long opaque LLM call: emit a "still working" event
 * every `intervalMs` (percent creeping from `start` toward `ceiling`) so the UI
 * is never silent for minutes. Callers MUST clear the returned timer when the
 * awaited call settles.
 */
function startProgressHeartbeat(
  intervalMs: number,
  start: number,
  ceiling: number,
  nodes: string[],
  message: string
): ReturnType<typeof setInterval> {
  let pct = start;
  return setInterval(() => {
    pct = Math.min(pct + 5, ceiling);
    emitCodegenProgress({ phase: 'generating', percent: pct, generatingNodes: nodes, message });
  }, intervalMs);
}

// ─── Chunked incremental generation helpers ─────────────────────────────
// The user-facing ask: "instead of hitting the token cap all at once, process
// each file/node in chunks — write some into a buffer, build/check the code,
// repeat." These helpers power the chunked mode of generatePlanFiles: files are
// ordered by dependency, split into small chunks, each chunk is generated in
// its own LLM call (far under the one-shot cap), written to disk, tsc-checked
// on the accumulated files, and repaired before the next chunk starts.

/** Accept a chunk size from a request body: int in [1,50], else undefined. */
function normalizeChunkSize(v: unknown): number | undefined {
  let n: number;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && /^\d+$/.test(v.trim())) n = Number(v.trim());
  else return undefined;
  if (!Number.isFinite(n)) return undefined;
  n = Math.floor(n);
  return n >= 1 && n <= 50 ? n : undefined;
}

/**
 * Order files so dependencies come first (a file that "uses" another is
 * generated AFTER it, so the import target already exists on disk when the
 * dependent is written). Cycle-safe: a use-cycle keeps both files in their
 * insertion order instead of recursing forever.
 */
function orderFilesByDependency(files: PlannedFile[]): PlannedFile[] {
  const byPath = new Map(files.map(f => [normalizeContractPath(f.path), f]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const out: PlannedFile[] = [];
  const visit = (f: PlannedFile): void => {
    const key = normalizeContractPath(f.path);
    if (visited.has(key)) return;
    if (visiting.has(key)) return; // cycle guard — node stays in insertion position
    visiting.add(key);
    for (const u of f.uses || []) {
      const dep = byPath.get(normalizeContractPath(u.from));
      if (dep) visit(dep);
    }
    visiting.delete(key);
    visited.add(key);
    out.push(f);
  };
  for (const f of files) visit(f);
  return out;
}

/** Split an array into consecutive chunks of at most `size`. */
function chunkFiles<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

/**
 * Rough per-file OUTPUT-token estimate from the plan's metadata (no content
 * exists yet). A file's generated code is proportional to its declared scope:
 * the summary length (≈3-4 chars per code token) plus a per-file scaffolding
 * floor. HTML GUI entries are self-contained (inline CSS/JS) so they get a
 * higher floor. Pure heuristic — feeds the auto-chunk decision, never a gate.
 */
export function estimateFileOutputTokens(f: PlannedFile): number {
  const summaryLen = (f.summary || '').trim().length;
  const isHtml = f.language?.toLowerCase() === 'html' || /\.html?$/i.test(f.path);
  const scaffold = isHtml ? 220 : 160;
  return scaffold + Math.round(summaryLen / 3);
}

/** Total one-shot output-token estimate for a plan (files + JSON wrapper). */
export function estimatePlanOutputTokens(files: PlannedFile[]): number {
  if (!files.length) return 0;
  return files.reduce((sum, f) => sum + estimateFileOutputTokens(f), 0) + 40; // {"files":[...]} wrapper
}

/**
 * P1 auto-chunk decision: the chunk size to use when no explicit chunkSize was
 * requested, or undefined when a single one-shot call is safe. The trigger is
 * a TOKEN estimate, not just a file count — the old fixed 14-file threshold
 * let fat 5-8 file plans (self-contained HTML + several TS files) sail past
 * the one-shot truncation cap. Auto-chunk when the plan has >6 files OR the
 * estimated output exceeds 6k tokens (a 13k-max one-shot call at ~4
 * chars/token leaves no headroom above that). Chunk size is sized to keep
 * each chunk ≈2k output tokens, clamped to the same [2,4] window as before.
 */
export function estimateAutoChunkSize(files: PlannedFile[]): number | undefined {
  if (!files.length) return undefined;
  const estTokens = estimatePlanOutputTokens(files);
  if (files.length <= 6 && estTokens <= 6000) return undefined;
  const perFile = Math.max(1, Math.round(estTokens / files.length));
  return Math.max(2, Math.min(4, Math.floor(2000 / perFile)));
}

/**
 * Compile the accumulated .ts/.tsx files in the export dir and resolve with the
 * tsc error lines. Async `spawn` (NOT spawnSync) so the single-threaded server
 * never blocks during the per-chunk check. Resolves [] when there are no TS
 * files (pure HTML/JS apps), tsc can't run, or the 60s guard kills tsc — the
 * check is best-effort, never fatal to generation.
 */
/**
 * Independent tsc gate — the compiler is the authority on whether generated
 * code compiles (the LLM's word is never taken). Runs the REAL tsc binary over
 * the export dir's TS files and returns a verdict:
 *   - status 'clean'       : tsc ran, zero errors
 *   - status 'errors'      : tsc ran, errors[] holds the `error TS...` lines
 *   - status 'skipped'     : no .ts/.tsx files — nothing to compile
 *   - status 'unavailable' : tsc could not run (binary missing / spawn error)
 *                           or was killed by the 60s guard — the gate did NOT
 *                           verify anything, so callers must not claim tsc-clean.
 * Async `spawn` (NOT spawnSync) so the single-threaded server never blocks
 * during the check. `--esModuleInterop` keeps default-imports of CJS modules
 * (e.g. `import fs from 'fs'`) from false-failing with TS1259 — a harness
 * artifact, not a code error (same class as the filtered TS5112).
 */
export function runTscCheck(exportDir: string, files: Array<{ path: string }>): Promise<{ errors: string[]; status: 'clean' | 'errors' | 'skipped' | 'unavailable' }> {
  const tsFiles = files.filter(f => f.path.endsWith('.ts') || f.path.endsWith('.tsx'));
  if (!tsFiles.length) return Promise.resolve({ errors: [], status: 'skipped' });
  const tscBin = pathModule.join(PROJECT_ROOT, 'node_modules', '.bin', 'tsc');
  const absPaths = tsFiles.map(f => safeJoin(exportDir, f.path));
  return new Promise((resolve) => {
    const proc = spawn(tscBin, ['--noEmit', '--target', 'ES2020', '--module', 'ESNext', '--moduleResolution', 'bundler', '--esModuleInterop', '--skipLibCheck', ...absPaths]);
    let out = '';
    let timedOut = false;
    const killTimer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
    }, 60_000);
    proc.stdout.on('data', (d: Buffer) => { out += String(d); });
    proc.stderr.on('data', (d: Buffer) => { out += String(d); });
    proc.on('error', (err) => {
      clearTimeout(killTimer);
      console.warn('[codePlanner] tsc check unavailable:', (err as Error)?.message || err);
      resolve({ errors: [], status: 'unavailable' });
    });
    proc.on('close', () => {
      clearTimeout(killTimer);
      if (timedOut) {
        console.warn('[codePlanner] tsc check timed out after 60s — compile NOT verified');
        resolve({ errors: [], status: 'unavailable' });
      }
      // Killed by a signal other than our 60s timer (e.g. the OS reaping it):
      // partial output must never be reported as a verdict.
      if (proc.signalCode !== null) {
        console.warn(`[codePlanner] tsc check killed by signal ${proc.signalCode} — compile NOT verified`);
        resolve({ errors: [], status: 'unavailable' });
      }
      // TS5112 (config-present-with-explicit-files) is a harness artifact, never a code error.
      const errors = out.split('\n').filter(l => l.includes('error TS') && !l.includes('TS5112'));
      resolve({ errors, status: errors.length ? 'errors' : 'clean' });
    });
  });
}

/**
 * Render smoke-test for generated HTML/GUI entries (behavioral + 3D gate).
 *
 * tsc can only see TypeScript — a single-file HTML app (vanilla JS + Three.js
 * via CDN) is invisible to it, so wrong CDN paths, undefined THREE, a broken
 * render loop, OR a page that crashes when the user actually clicks it all
 * pass the type gate. This spawns scripts/smoke-test-html.py (Playwright +
 * system Chrome, headless) to actually OPEN the file and report console/page
 * errors, WebGL canvas presence, the 3D-fallback banner, AND (behavioral mode)
 * new errors triggered by primary interactions (fill first input + Enter,
 * click primary control, click secondary control) plus blank-page detection.
 *
 * The gate fires for any HTML entry that carries interactive markers (inline
 * script, onclick/onkeydown/addEventListener, button/input/form) — the
 * behavioral "compiles but doesn't work" class — in addition to the 3D class.
 * A purely static info page with zero JS/controls is skipped (nothing to
 * behave).
 *
 * Best-effort by design: never blocks or fails generation — the verdict is
 * reported in the response (renderSmoke) and logged. Status:
 *   'passed' | 'failed' | 'skipped' (no HTML) | 'unavailable' (no playwright/chrome)
 */
export function runRenderSmoke(exportDir: string, files: Array<{ path: string; content?: string }>, timeoutMs = 35_000): Promise<{ status: 'passed' | 'failed' | 'skipped' | 'unavailable'; errors: string[]; detail: string }> {
  const html = files.find(f => /\.html?$/i.test(f.path) && (f.content || '').trim().length > 0);
  if (!html) return Promise.resolve({ status: 'skipped', errors: [], detail: 'no HTML entry file' });
  const content = html.content || '';
  // Cost + relevance guard: headless Chrome costs ~8-10s, so only fire for
  // entries with something to BEHAVE — 3D/graphics markers (three.js/WebGL)
  // or interactive markers (inline script, event handlers, form controls).
  // A static info page with zero JS and zero controls is skipped.
  const is3D = /new\s+THREE\.|THREE\.[A-Z]|three(?:\.min)?\.js|from\s+['"]three['"]|webgl|getContext\s*\(\s*['"]webgl/i.test(content);
  const isInteractive = /<script|on(?:click|keydown|keyup|change|input|submit)\s*=|addEventListener|\b<(?:button|input|form|select|textarea)\b/i.test(content);
  if (!is3D && !isInteractive) {
    return Promise.resolve({ status: 'skipped', errors: [], detail: 'no interactive or 3D markers in HTML' });
  }
  const absPath = safeJoin(exportDir, html.path);
  if (!fs.existsSync(absPath)) return Promise.resolve({ status: 'skipped', errors: [], detail: 'HTML file not on disk' });
  const script = pathModule.join(PROJECT_ROOT, 'scripts', 'smoke-test-html.py');
  if (!fs.existsSync(script)) return Promise.resolve({ status: 'skipped', errors: [], detail: 'smoke-test-html.py missing' });
  return new Promise((resolve) => {
    const proc = spawn('python3', [script, absPath, '--behavioral', '--wait', '4000', '--out', `${absPath}.smoke.png`], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let timedOut = false;
    const killTimer = setTimeout(() => { timedOut = true; proc.kill('SIGKILL'); }, timeoutMs);
    proc.stdout.on('data', (d: Buffer) => { out += String(d); });
    proc.stderr.on('data', (d: Buffer) => { out += String(d); });
    proc.on('error', (err) => {
      clearTimeout(killTimer);
      console.warn('[codePlanner] render smoke unavailable:', (err as Error)?.message || err);
      resolve({ status: 'unavailable', errors: [], detail: (err as Error)?.message || 'spawn failed' });
    });
    proc.on('close', (code) => {
      clearTimeout(killTimer);
      if (timedOut) {
        console.warn('[codePlanner] render smoke timed out — HTML render NOT verified');
        resolve({ status: 'unavailable', errors: [], detail: 'timeout' });
        return;
      }
      try {
        const parsed = JSON.parse(out);
        // Infra failure (chrome/playwright missing, launch crash) is NOT a
        // model verdict — report 'unavailable' so the model isn't blamed.
        if (parsed.error) {
          resolve({ status: 'unavailable', errors: [], detail: String(parsed.error).slice(0, 160) });
          return;
        }
        // Behavioral gate failures carry interaction-triggered errors — the
        // "loads fine but crashes on click" class. Surface them so the repair
        // loop (and the UI) sees the real behavioral failure, not just a
        // generic "failed".
        const behavioral = parsed.behavioral;
        const interactionErrors = Array.isArray(behavioral?.interactionErrors)
          ? (behavioral.interactionErrors as string[])
          : [];
        const errors = [
          ...(parsed.pageErrors || []),
          ...(parsed.consoleErrors || []),
          ...interactionErrors,
        ];
        const passed = parsed.pass === true;
        let detail: string;
        if (behavioral && Array.isArray(behavioral.interactions)) {
          const n = (behavioral.interactions as string[]).length;
          detail = interactionErrors.length
            ? `${interactionErrors.length} interaction-triggered error(s): ${interactionErrors[0].slice(0, 120)}`
            : `interactions=${n}, bodyText=${behavioral.bodyTextLength ?? '?'}`;
        } else if (parsed.fallbackVisible) {
          detail = '3D fallback banner visible (CDN blocked?)';
        } else {
          detail = `canvas=${parsed.canvas?.found}`;
        }
        resolve({ status: passed ? 'passed' : 'failed', errors: errors.slice(0, 8), detail });
      } catch {
        resolve({ status: 'unavailable', errors: [], detail: `unparsable smoke output: ${String(out).slice(0, 160)}` });
      }
    });
  });
}

/**
 * Pick the runnable entry file of a generated non-HTML project (the file the
 * user would launch): prefers main/index/cli/app/server/start.* then falls
 * back to the first TS/JS file. Pure function — unit-testable.
 */
export function pickCliEntryFile(files: Array<{ path: string }>): string | null {
  const runnable = files.filter(f => /\.(?:ts|tsx|js|mjs|cjs)$/i.test(f.path));
  if (!runnable.length) return null;
  const order = ['main', 'index', 'cli', 'app', 'server', 'start'];
  for (const name of order) {
    const hit = runnable.find(f => {
      const base = f.path.split('/').pop() || '';
      return new RegExp(`^${name}\.(?:ts|tsx|js|mjs|cjs)$`, 'i').test(base);
    });
    if (hit) return hit.path;
  }
  return runnable[0].path;
}

/**
 * CLI behavioral gate for non-HTML (terminal/script) apps. tsc can only see
 * types — a CLI that imports a type-only member as a value (erased at runtime),
 * references an undefined symbol at module scope, or is a stub body
 * (loadHabits = () => []) passes the type gate but crashes or prints NOTHING
 * when executed. This spawns scripts/smoke-test-cli.py which runs the entry
 * under tsx with --help / -h and reports the verdict + captured errors.
 *
 * Status: 'passed' | 'failed' | 'skipped' (no runnable entry) | 'unavailable'
 * (tsx/python missing — infra, never the model's fault).
 */
export function runCliSmoke(exportDir: string, files: Array<{ path: string; content?: string }>, timeoutMs = 45_000): Promise<{ status: 'passed' | 'failed' | 'skipped' | 'unavailable'; errors: string[]; detail: string }> {
  const entry = pickCliEntryFile(files);
  if (!entry) return Promise.resolve({ status: 'skipped', errors: [], detail: 'no runnable entry file' });
  const absPath = safeJoin(exportDir, entry);
  if (!fs.existsSync(absPath)) return Promise.resolve({ status: 'skipped', errors: [], detail: `entry not on disk: ${entry}` });
  const script = pathModule.join(PROJECT_ROOT, 'scripts', 'smoke-test-cli.py');
  if (!fs.existsSync(script)) return Promise.resolve({ status: 'unavailable', errors: [], detail: 'smoke-test-cli.py missing' });
  return new Promise((resolve) => {
    const proc = spawn('python3', [script, exportDir, '--entry', entry], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let timedOut = false;
    const killTimer = setTimeout(() => { timedOut = true; proc.kill('SIGKILL'); }, timeoutMs);
    proc.stdout.on('data', (d: Buffer) => { out += String(d); });
    proc.stderr.on('data', (d: Buffer) => { out += String(d); });
    proc.on('error', (err) => {
      clearTimeout(killTimer);
      console.warn('[codePlanner] cli smoke unavailable:', (err as Error)?.message || err);
      resolve({ status: 'unavailable', errors: [], detail: (err as Error)?.message || 'spawn failed' });
    });
    proc.on('close', () => {
      clearTimeout(killTimer);
      if (timedOut) {
        console.warn('[codePlanner] cli smoke timed out — CLI run NOT verified');
        resolve({ status: 'unavailable', errors: [], detail: 'timeout' });
        return;
      }
      try {
        const parsed = JSON.parse(out);
        if (parsed.error) {
          resolve({ status: 'unavailable', errors: [], detail: String(parsed.error).slice(0, 160) });
          return;
        }
        const status = parsed.status === 'passed' ? 'passed' : parsed.status === 'failed' ? 'failed' : 'skipped';
        const errors = Array.isArray(parsed.errors) ? (parsed.errors as string[]).slice(0, 8) : [];
        resolve({ status, errors, detail: String(parsed.detail || '').slice(0, 240) });
      } catch {
        resolve({ status: 'unavailable', errors: [], detail: `unparsable cli smoke output: ${String(out).slice(0, 160)}` });
      }
    });
  });
}

/** Build the per-chunk generation prompt (only THIS chunk's files are written). */
function buildChunkPrompt(
  request: string,
  intentSection: string,
  fileList: string,
  contractsSection: string,
  answersText: string,
  alreadyWritten: Array<{ path: string; exports?: string[] }>,
  chunk: PlannedFile[],
  chunkIndex: number,
  totalChunks: number
): string {
  const writtenBlock = alreadyWritten.length
    ? alreadyWritten.map(f => `[${f.path}] exports: ${f.exports?.length ? f.exports.join(', ') : '(none)'}`).join('\n')
    : '(none yet — this is the first chunk)';
  const chunkBlock = chunk.map((f, i) => {
    const uses = f.uses?.length ? '\n  uses: ' + f.uses.map(u => `from ${u.from}: ${u.members.join(', ')}`).join('; ') : '';
    return `[${i + 1}] ${f.path} (${f.language}) — ${f.summary}\n  exports: ${f.exports?.length ? f.exports.join(', ') : '(none)'}${uses}`;
  }).join('\n');
  // GUI entry files in this chunk get the concrete widget templates so chunked
  // builds produce the same quality UI as one-shot/per-file mode.
  const chunkHasHtml = chunk.some(f => f.language === 'html' || /\.html?$/i.test(f.path));
  const widgetSection = chunkHasHtml ? `\n${GUI_WIDGET_SECTION}\n${APP_QUALITY_RULES}` : '';
  const guiHint = chunkHasHtml
    ? ' For GUI files, copy the WIDGET TEMPLATES above verbatim — use native <video>/<audio> for media, never a <div> placeholder.'
    : '';
  return `User request: ${request}\n\n${intentSection}\n\n━━━ PROJECT PLAN (ALL FILES) ━━━\n${fileList}\n\n${contractsSection}\n\n━━━ ALREADY-WRITTEN FILES (ON DISK — import from these using their declared exports) ━━━\n${writtenBlock}\n\n━━━ CHUNK ${chunkIndex}/${totalChunks} — FILES TO WRITE NOW ━━━\n${chunkBlock}\n\n━━━ USER ANSWERS ━━━\n${answersText}${widgetSection}\n\n━━━ TASK ━━━\nWrite COMPLETE, working code ONLY for the ${chunk.length} file(s) listed in THIS CHUNK. Files in the ALREADY-WRITTEN list exist on disk — import from them ONLY the members in their declared exports. NEVER import from a file that is neither in the ALREADY-WRITTEN list nor in THIS CHUNK — it does not exist. HONOR the FILE CONTRACTS: never reference an undeclared member. Every member this chunk's files use from ALREADY-WRITTEN files or other files in THIS CHUNK MUST be imported at the top of the file — a missing import is a compile failure.${guiHint}\n\nCOMPACTNESS: Write DENSE code — no boilerplate comments, no verbose docstrings, minimal whitespace. Keep every file tight but complete.\n\nIMPORTANT: Write the ACTUAL file content. Not stubs, not placeholders — real working code.\n\nReturn ONLY valid JSON with a "files" array, where each entry has "path" and "content".`;
}

/**
 * Build a LINE-NUMBERED source view for repair prompts that is FOCUSED on the
 * compiler errors instead of a blind prefix. Small files are shown whole;
 * large files (past `maxChars`) keep the header region (imports/exports —
 * where most cross-file errors live) plus a ±window around every error's line,
 * with an ellipsis marker for the omitted middle. This closes the old
 * `substring(0, 8000)` hole where an error past ~line 200 was literally
 * invisible to the model and could only be "fixed" by guessing.
 *
 * tsc line numbers are 1-based; error locations are parsed from the standard
 * `file(line,col)` prefix. Returns { source, truncated } — `truncated` is true
 * when lines were omitted, so callers can add a NOTE the model reads.
 */
export function buildErrorFocusedNumberedSource(
  content: string,
  errors: string[],
  opts?: { maxChars?: number; window?: number; headerLines?: number }
): { source: string; truncated: boolean } {
  const maxChars = opts?.maxChars ?? 8000;
  const window = opts?.window ?? 12;
  const headerLines = opts?.headerLines ?? 30;
  const numberize = (lines: string[]): string =>
    lines.map((l, i) => `${String(i + 1).padStart(4)} | ${l}`).join('\n');
  if (content.length <= maxChars) return { source: numberize(content.split('\n')), truncated: false };
  const lines = content.split('\n');
  const keep = new Set<number>();
  // Always keep the header (imports/exports region) — drift lives there.
  for (let i = 0; i < Math.min(headerLines, lines.length); i++) keep.add(i);
  // Keep a window around every error line (1-based in output → 0-based idx).
  // Two locator formats are parsed: tsc's `file(line,col)` and Chrome
  // console's `file:///...html:line:col` — the smoke/behavioral gate reports
  // the latter ("Uncaught TypeError ... at app.html:123:45").
  for (const e of errors) {
    const tscLoc = e.match(/\((\d+),(\d+)\)/);
    const chromeLoc = !tscLoc ? e.match(/:\s*(\d+):(\d+)\b/) : null;
    const lineNo = tscLoc ? Number(tscLoc[1]) : chromeLoc ? Number(chromeLoc[1]) : null;
    if (!lineNo) continue;
    for (let i = Math.max(0, lineNo - 1 - window); i < Math.min(lines.length, lineNo + window); i++) keep.add(i);
  }
  const kept = [...keep].sort((a, b) => a - b);
  const out: string[] = [];
  let prev = -1;
  for (const idx of kept) {
    if (prev >= 0 && idx > prev + 1) out.push(`… (${idx - prev - 1} line(s) omitted) …`);
    out.push(`${String(idx + 1).padStart(4)} | ${lines[idx]}`);
    prev = idx;
  }
  // Mark the tail when lines after the last kept line were omitted too —
  // otherwise a header-only view silently drops the whole file body.
  if (prev >= 0 && prev < lines.length - 1) {
    out.push(`… (${lines.length - 1 - prev} line(s) omitted) …`);
  }
  return { source: out.join('\n'), truncated: true };
}

/**
 * REGENERATE-with-errors-in-context prompt (round-2+ escalation): the generic
 * repair prompt failed on this file once, so stop line-patching and REWRITE
 * the whole file against a LINE-NUMBERED copy of its current content with each
 * compiler error annotated at its exact (line, column). Giving the model the
 * numbered source it is editing prevents the drift that a raw error list
 * allows (TS2339 'Property x does not exist' is only fixable when the model
 * can see the exact line that references x).
 */
export function buildRegenerateWithErrorsPrompt(
  request: string,
  file: PlannedFile,
  currentContent: string,
  errors: string[],
  allFiles: PlannedFile[]
): string {
  const { source: numbered, truncated: contentTruncated } = buildErrorFocusedNumberedSource(currentContent, errors);
  const targets = (file.uses || []).map(u => {
    const t = allFiles.find(x => normalizeContractPath(x.path) === normalizeContractPath(u.from));
    return `  ${u.from} exports: ${t?.exports?.length ? t.exports.join(', ') : '(unknown — declared nowhere)'}`;
  });
  const targetBlock = targets.length
    ? `\n\n━━━ IMPORT TARGETS (may ONLY reference these declared members) ━━━\n${targets.join('\n')}`
    : '';
  const truncated = contentTruncated
    ? `\n\nNOTE: the file is large — the numbered view shows the header plus a window around each error line (omitted regions are marked with ellipses). Every error below points at a visible line — fix it exactly there.`
    : '';
  return `User request: ${request}\n\nThe file ${file.path} STILL does not compile after a previous repair attempt. Rewrite the ENTIRE file so it compiles — do not patch, rewrite.\n\n━━━ CURRENT CONTENT (LINE-NUMBERED) ━━━\n${numbered}${truncated}\n\n━━━ COMPILER ERRORS (line:col point into the numbered content above) ━━━\n${errors.join('\n')}${targetBlock}\n\n━━━ TASK ━━━\nProduce a COMPLETE rewritten ${file.path} that compiles cleanly. For every error above: find the exact line it points to, fix the actual cause (missing import, wrong member name, wrong argument count, undeclared symbol, shape mismatch), and keep the file's purpose intact. Cross-file members MUST come from an import backed by the IMPORT TARGETS declared exports — never invent a member a target does not export, and never import from a file that does not exist (TS2307).\n\n  Return ONLY the file's raw code — no markdown fences, no JSON wrapper, no commentary.`;
}

/**
 * BEHAVIORAL-repair prompt: the generated HTML passed tsc (or had no TS) but
 * FAILED the headless-Chrome smoke gate — console/page errors, errors thrown
 * by the page's own primary interactions (fill input + Enter, click primary
 * control), or a blank page. This is the "compiles but doesn't work" class
 * that no type gate can see. The model rewrites the ENTIRE HTML file against
 * a line-numbered copy with every smoke error in context.
 */
export function buildRenderSmokeRepairPrompt(
  request: string,
  file: PlannedFile,
  currentContent: string,
  smokeErrors: string[],
  detail: string
): string {
  const { source: numbered, truncated: contentTruncated } = buildErrorFocusedNumberedSource(currentContent, smokeErrors);
  const truncated = contentTruncated
    ? `\n\nNOTE: the file is large — the numbered view shows the header plus a window around each error line (omitted regions are marked with ellipses). Every error below points at a visible line — fix it exactly there.`
    : '';
  return `User request: ${request}\n\nThe generated HTML app ${file.path} LOADS but FAILS behavioral checks in headless Chrome — it is the "compiles but doesn't work" class: an error, a crash on interaction, or a blank page. Rewrite the ENTIRE file so it both renders AND behaves.\n\n━━━ SMOKE-GATE FAILURE (what Chrome saw) ━━━\n${detail || '(no detail)'}${smokeErrors.length ? `\n${smokeErrors.join('\n')}` : ''}\n\n━━━ CURRENT CONTENT (LINE-NUMBERED) ━━━\n${numbered}${truncated}\n\n━━━ TASK ━━━\nProduce a COMPLETE rewritten ${file.path} that: (1) loads with ZERO console/page errors, (2) actually WORKS when used — the primary action (form submit, button click, search, add, send) must do something visible with no thrown exception, and (3) is not a blank page (real rendered content). Common root causes to check: a function referenced by an inline onclick/onkeydown that is never defined, calling a DOM method on null (element missing because the JS runs before the DOM or the id is wrong), an unguarded undefined variable, a missing closing tag that breaks the whole script section, or an event listener attached to an element that doesn't exist.\n\n  Return ONLY the file's raw HTML — no markdown fences, no JSON wrapper, no commentary.`;
}

/**
 * Repair prompt for the CLI behavioral gate (non-HTML apps). The generated
 * program passed tsc but crashed or produced no output when actually executed
 * — the "compiles but doesn't work" class for terminal apps. The model gets
 * the runtime error (SyntaxError/ReferenceError/exit-code) with line context
 * and rewrites the ENTRY file.
 */
export function buildCliSmokeRepairPrompt(
  request: string,
  file: PlannedFile,
  currentContent: string,
  smokeErrors: string[],
  detail: string
): string {
  const { source: numbered, truncated: contentTruncated } = buildErrorFocusedNumberedSource(currentContent, smokeErrors);
  const truncated = contentTruncated
    ? `\n\nNOTE: the file is large — the numbered view shows the header plus a window around each error line (omitted regions are marked with ellipses). Every error below points at a visible line — fix it exactly there.`
    : '';
  return `User request: ${request}\n\nThe generated CLI app ${file.path} COMPILES but FAILS when actually executed — it is the "compiles but doesn't work" class for terminal apps: it crashes at startup, or runs and prints NOTHING (a stub). Rewrite the ENTIRE file so the program actually runs and does the job the request describes.\n\n━━━ CLI SMOKE-GATE FAILURE (what happened when it was executed) ━━━\n${detail || '(no detail)'}${smokeErrors.length ? `\n${smokeErrors.join('\n')}` : ''}\n\n━━━ CURRENT CONTENT (LINE-NUMBERED) ━━━\n${numbered}${truncated}\n\n━━━ TASK ━━━\nProduce a COMPLETE rewritten ${file.path} that when executed: (1) starts with ZERO thrown errors, (2) handles its CLI arguments / reads its input, (3) produces REAL output — it must print the results of the user's request, never exit silently. Common root causes to check: importing a TYPE-ONLY member (interface/type/class as a value) from a sibling file — types are erased at runtime, so import only real values or use \"import type\"; referencing an undefined symbol; a stub body that returns an empty array / does nothing; unguarded null/undefined dereference. If another generated file must export a runtime value this file imports, keep the import AND make sure the symbol is actually exported there, or adjust the import to what the other file really exports.\n\n  Return ONLY the file's raw code — no markdown fences, no JSON wrapper, no commentary.`;
}

// ─── GAP #5: whole-project repair pass (cross-file interface drift) ─────────
// Per-file repair rewrites each erroring file in isolation — it can NEVER
// reconcile cross-file drift like TS2554 (main.ts calls minimax(board, 2) while
// game-logic.ts declares minimax(state, depth, maxPlayer)): whichever side is
// rewritten alone, the other side's interface still disagrees. This pass
// rewrites ALL erroring files PLUS the planned files they import from TOGETHER
// in one call, so signatures and call sites are aligned in a single shot.

/**
 * Select the whole-project repair set: every file with residual errors PLUS
 * the planned files those files import from (the "other side" of the drift —
 * often tsc-clean itself, e.g. game-logic.ts when main.ts's call site is the
 * only erroring line). Capped at `maxFiles` so the single rewrite call stays
 * within output-token budget. Pure function — unit-testable.
 */
export function selectWholeProjectRepairFiles(
  working: Array<{ path: string; content: string }>,
  errByFile: Map<string, string[]>,
  contractFiles: PlannedFile[],
  maxFiles = 3
): Array<{ path: string; content: string; errors: string[] }> {
  const out: Array<{ path: string; content: string; errors: string[] }> = [];
  // byKey is dual-keyed (full normalized path AND basename) — the gate's
  // errByFile adds errors under BOTH forms, and tsc reports absolute paths,
  // so the erroring-file lookup must succeed for any of those spellings.
  const byKey = new Map<string, { path: string; content: string }>();
  for (const f of working) {
    const key = normalizeContractPath(f.path);
    byKey.set(key, f);
    byKey.set(normalizeContractPath(key.split('/').pop() || ''), f);
  }
  const seen = new Set<string>();
  // 1) Every erroring file (matched by full path key OR basename). Keys are
  //    normalized the same way as byKey so both normalized and raw keys work.
  //    `seen` tracks the RESOLVED file path (not the raw key) so the same file
  //    can't be added twice via different key spellings.
  for (const [rawKey, errs] of errByFile) {
    if (out.length >= maxFiles) break;
    const key = normalizeContractPath(rawKey);
    const f = byKey.get(key) || byKey.get(normalizeContractPath(key.split('/').pop() || ''));
    if (!f || seen.has(f.path)) continue;
    seen.add(f.path);
    out.push({ ...f, errors: errs });
  }
  if (!out.length) return out;
  // 2) The import targets of the erroring files — the OTHER side of the drift.
  //    Matched by path, basename, or extensionless basename (./game-logic vs
  //    src/game-logic.ts). Iterated LIVE (index-based, not a snapshot) so a
  //    newly added target's own imports are also scanned — a transitive chain
  //    (main -> game-logic -> types) pulls in all involved files, up to the cap.
  const planned = new Map<string, PlannedFile>();
  for (const cf of contractFiles) {
    const base = cf.path.split('/').pop() || '';
    planned.set(normalizeContractPath(cf.path), cf);
    planned.set(normalizeContractPath(base), cf);
    planned.set(normalizeContractPath(base.replace(/\.(?:[jt]sx?|m[jt]s)$/, '')), cf);
  }
  for (let i = 0; i < out.length && out.length < maxFiles; i++) {
    const rf = out[i];
    for (const imp of extractImports(rf.content)) {
      if (out.length >= maxFiles) break;
      if (!imp.from.startsWith('.')) continue; // sibling planned files only
      const from = imp.from.replace(/^\.\//, '');
      const target = planned.get(normalizeContractPath(imp.from))
        || planned.get(normalizeContractPath(from))
        || planned.get(normalizeContractPath(from.split('/').pop() || ''))
        || planned.get(normalizeContractPath((from.split('/').pop() || '').replace(/\.(?:[jt]sx?|m[jt]s)$/, '')));
      if (!target) continue;
      const tk = normalizeContractPath(target.path);
      if (seen.has(target.path) || out.length >= maxFiles) continue;
      const tf = byKey.get(tk) || byKey.get(normalizeContractPath(target.path.split('/').pop() || ''));
      if (!tf) continue;
      seen.add(target.path);
      out.push({ ...tf, errors: errByFile.get(tk) || errByFile.get(normalizeContractPath(target.path.split('/').pop() || '')) || [] });
    }
  }
  return out;
}

/**
 * Build the whole-project repair prompt: all involved files (line-numbered),
 * every compiler error across them, and the project contracts (exports must
 * NOT be renamed — that breaks importers). The model rewrites ALL files
 * together and returns JSON {"files": {path: content}}. Exported for tests.
 */
export function buildWholeProjectRepairPrompt(
  request: string,
  repairFiles: Array<{ path: string; content: string; errors: string[] }>,
  allErrors: string[],
  contractFiles: PlannedFile[]
): string {
  const sections = repairFiles.map((f, i) => {
    // Error-focused source: large files keep the header + a window around each
    // error line instead of a blind prefix — a drift error in the middle of a
    // big file is now VISIBLE (the old substring(0,8000) hid it).
    const { source: numbered, truncated: contentTruncated } = buildErrorFocusedNumberedSource(f.content, f.errors);
    const truncNote = contentTruncated
      ? `\n\nNOTE: file is large — the view shows the header plus a window around each error line (omitted regions marked with ellipses); every error below points at a visible line.`
      : '';
    return `━━━ FILE ${i + 1}/${repairFiles.length}: ${f.path} (CURRENT, LINE-NUMBERED) ━━━\n${numbered}${truncNote}\n\n━━━ ERRORS IN ${f.path} ━━━\n${f.errors.length ? f.errors.join('\n') : '(none — included because its interface is the other side of the drift)'}`;
  }).join('\n\n');
  const contracts = contractFiles.map(cf => {
    const usesList = cf.uses || [];
    const uses = usesList.length
      ? usesList.map(u => `    ${u.from} -> ${u.members.join(', ')}`).join('\n')
      : '    (none)';
    return `  ${cf.path}\n    exports: ${cf.exports?.length ? cf.exports.join(', ') : '(none)'}\n    uses:\n${uses}`;
  }).join('\n');
  return `User request: ${request}\n\nThe generated project STILL does not compile after per-file repair attempts. The errors below are CROSS-FILE INTERFACE DRIFT: a call site in one file disagrees with the signature or type declared in a file it imports from (e.g. TS2554 wrong argument count, TS2339 property does not exist, TS2322/TS2345 type mismatch). These CANNOT be fixed by rewriting one file alone — the interfaces must be reconciled TOGETHER in a single pass.\n\nBelow are ALL files involved in the drift (current content, line-numbered) and ALL compiler errors. Rewrite EVERY file listed so the whole set compiles as one consistent project. You may change a function's signature, parameter list, return type, OR the call sites that use it — but you MUST keep the exported member NAMES declared in the contracts below (renaming an export breaks its importers). Prefer the smaller, cleaner side of each mismatch, but both files must agree.\n\n━━━ FILES TO REWRITE (ALL OF THEM, TOGETHER) ━━━\n${sections}\n\n━━━ ALL COMPILER ERRORS ━━━\n${allErrors.join('\n')}\n\n━━━ PROJECT CONTRACTS (declared exports — do NOT rename these) ━━━\n${contracts}\n\n━━━ TASK ━━━\nReturn ONLY valid JSON (no markdown fences, no commentary):\n{"files": {"<path>": "<COMPLETE rewritten content>", ...}}\nEvery key in \"files\" must be one of the file paths listed above, with its FULL rewritten content. Rewriting a file is optional ONLY if you leave it byte-identical; otherwise every listed file must be present.`;
}

/**
 * Run the bounded whole-project repair pass. Fired only when residual errors
 * involve ≥2 files (erroring files + import targets) after the per-file loop
 * spent its budget — cross-file drift needs at least two sides. At most 2
 * attempts, each followed by an independent tsc re-check; stops early when a
 * round changes nothing. Returns updated files + verdict + rounds consumed.
 */
async function runWholeProjectRepair(
  request: string,
  working: Array<{ path: string; content: string }>,
  contractFiles: PlannedFile[],
  exportDir: string,
  tscVerdict: { errors: string[]; status: 'clean' | 'errors' | 'skipped' | 'unavailable' },
  timeoutMs: number
): Promise<{
  files: Array<{ path: string; content: string }>;
  verdict: { errors: string[]; status: 'clean' | 'errors' | 'skipped' | 'unavailable' };
  rounds: number;
}> {
  const files = working;
  let verdict = tscVerdict;
  let rounds = 0;
  const buildErrByFile = (errs: string[]): Map<string, string[]> => {
    const m = new Map<string, string[]>();
    const add = (key: string, e: string) => {
      if (!key) return;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(e);
    };
    for (const e of errs) {
      const match = e.match(/^([^:]+)\s*\(/);
      if (!match) continue;
      const absPath = match[1].trim();
      const rel = absPath.startsWith(exportDir)
        ? absPath.slice(exportDir.length).replace(/^[/\\]+/, '')
        : (absPath.split(/[\\/]/).pop() || '');
      add(normalizeContractPath(rel), e);
      add(normalizeContractPath(absPath.split(/[\\/]/).pop() || ''), e);
    }
    return m;
  };
  let repairSet = selectWholeProjectRepairFiles(files, buildErrByFile(verdict.errors), contractFiles, 3);
  // Fire when ≥2 files are involved (true cross-file drift) OR when a single
  // stubborn file carries a drift-class error (TS2554 arity, TS2339 shape,
  // TS2322/TS2345 assignability, TS2440 shadowed import, TS2588 const
  // reassignment) — those re-roll identically under per-file regen, so give the
  // model the whole-project view (ALL errors + full contracts) as the last pass.
  const driftClass = /error\s+TS(2554|2339|2322|2345|2305|2459|2614|2440|2588|2564|2551|2304|2305)/;
  const hasDrift = verdict.errors.some(e => driftClass.test(e));
  if (repairSet.length < 2 && !hasDrift) {
    // No cross-file involvement and no drift-class survivor — per-file repair
    // already handled what this pass could do; don't spend the call.
    return { files, verdict, rounds };
  }
  if (!repairSet.length) {
    return { files, verdict, rounds };
  }
  console.warn(`[codePlanner] whole-project repair: ${repairSet.length} file(s) involved in cross-file drift — rewriting together`);
  emitCodegenProgress({ phase: 'validating', percent: 92, message: `Cross-file drift: repairing ${repairSet.length} files together…` });
  // Adaptive budget: base 2 rounds; a 3rd round is granted ONLY when the
  // repair set stays small (1-2 files — a focused drift, cheap to re-roll)
  // AND the previous round made progress (strictly fewer errors). Wide or
  // stalled repairs stop at the base budget so we don't spend calls on
  // diminishing returns.
  let prevErrorCount = verdict.errors.length;
  let errorsImproved = false;
  while (shouldRunNextWholeProjectRound({ rounds, repairSetSize: repairSet.length, errorsImproved, remainingErrors: verdict.errors.length })) {
    rounds += 1;
    const prompt = buildWholeProjectRepairPrompt(request, repairSet, verdict.errors, contractFiles);
    // Dedicated system prompt: this pass must RETURN MULTI-FILE JSON, so the
    // single-file FILE_WRITE_PROMPT ("return ONLY the file's raw code") would
    // actively fight the output contract and make the model emit raw
    // concatenated code instead of {"files": {...}}.
    const raw = await translator.reason(prompt, WHOLE_PROJECT_SYSTEM_PROMPT, { maxTokens: 8192, timeoutMs });
    const cleaned = cleanLLMResponse(raw);
    const parsed = extractJSON<{ files?: Record<string, string> }>(cleaned);
    let changed = false;
    if (parsed && parsed.files && typeof parsed.files === 'object') {
      for (const [p, content] of Object.entries(parsed.files)) {
        if (typeof content !== 'string' || !content.trim()) continue;
        const key = normalizeContractPath(p);
        const cf = files.find(f => normalizeContractPath(f.path) === key
          || normalizeContractPath(f.path.split('/').pop() || '') === key);
        if (!cf || content === cf.content) continue;
        // Never invent files or overwrite unrelated ones — only the repair set.
        if (!repairSet.some(r => normalizeContractPath(r.path) === normalizeContractPath(cf.path))) continue;
        // Strip markdown fences the model may have wrapped each value in (the
        // per-file paths do this too — a fence inside a written file corrupts it).
        const stripped = content.replace(/^```(?:\w+)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        cf.content = stripped;
        fs.writeFileSync(safeJoin(exportDir, cf.path), stripped, 'utf-8');
        changed = true;
      }
    }
    if (!changed) {
      console.warn(`[codePlanner] whole-project repair: round ${rounds} produced no usable JSON rewrite — stopping`);
      break;
    }
    verdict = await runTscCheck(exportDir, files);
    // Adaptive-budget bookkeeping: did this round actually shrink the errors?
    errorsImproved = verdict.errors.length < prevErrorCount;
    prevErrorCount = verdict.errors.length;
    // The erroring file set may have shifted — re-select for the next attempt.
    repairSet = selectWholeProjectRepairFiles(files, buildErrByFile(verdict.errors), contractFiles, 3);
  }
  if (rounds > 0) {
    console.log(`[codePlanner] whole-project repair: ${rounds} round(s), ${verdict.errors.length} remaining tsc error(s) [gate: ${verdict.status}]`);
  }
  return { files, verdict, rounds };
}

/**
 * Adaptive whole-project repair budget. Base budget is 2 rounds; a 3rd round
 * is granted only for a FOCUSED drift (1-2 files — re-rolls are cheap and
 * small sets are the ones that can actually converge) that is still MAKING
 * PROGRESS (the previous round strictly reduced the error count). Wide sets
 * (3+ files), stalled/regressed repairs, and clean verdicts all stop — don't
 * burn LLM calls on diminishing returns.
 */
export function shouldRunNextWholeProjectRound(opts: {
  rounds: number;
  repairSetSize: number;
  errorsImproved: boolean;
  remainingErrors: number;
}): boolean {
  if (opts.remainingErrors <= 0) return false;
  if (opts.rounds < 2) return true;
  // Round 3 (and only round 3) is adaptive: focused set + improvement only.
  return opts.rounds < 3
    && opts.repairSetSize >= 1 && opts.repairSetSize <= 2
    && opts.errorsImproved;
}

interface WrittenFile {
  path: string;
  content: string;
  status: 'written' | 'skipped' | 'error';
  error?: string;
}

// ─── System Prompts ──────────────────────────────────────────────────────

const PLAN_PROMPT = `You are an expert software architect working in an interactive CLI mode.

Your job is to plan what code needs to be written for the user's request.

RULES:
1. First, think through what the user needs step by step
2. List every file that needs to be created with its path and a brief summary
3. Ask any clarifying questions needed before writing code
4. Be specific about file paths, languages, and what each file does
5. If the user hasn't specified important details (language, framework), ask
6. CRITICAL: the "reasoning" field must contain YOUR OWN step-by-step analysis of THIS SPECIFIC request, written in your own words. NEVER copy the example text below verbatim — it is only a structural example, not content to repeat.

OUTPUT FORMAT — Return ONLY valid JSON (no markdown, no code fences):
{
  "reasoning": "Example placeholder — replace with your own analysis of the user's specific request",
  "files": [
    { "path": "src/main.ts", "summary": "Entry point: parses args, orchestrates the app", "language": "typescript", "exports": ["run", "main"], "uses": [{ "from": "src/todo.ts", "members": ["TodoItem", "addTodo"] }] },
    { "path": "src/todo.ts", "summary": "Todo item type and CRUD operations", "language": "typescript", "exports": ["TodoItem", "addTodo", "listTodos"], "uses": [] },
    { "path": "src/storage.ts", "summary": "File-based JSON storage for todos", "language": "typescript", "exports": ["loadTodos", "saveTodos"], "uses": [{ "from": "src/todo.ts", "members": ["TodoItem"] }] }
  ],
  "questions": [
    { "key": "storage", "question": "How should todos be stored?", "options": ["JSON file", "SQLite database"], "type": "choice" },
    { "key": "interface", "question": "What kind of interface do you want?", "options": ["Terminal (CLI)", "Web app", "Desktop app"], "type": "choice" }
  ]
}

FILE CONTRACT SCHEMA — every file MUST declare its cross-file API surface:
{
  "exports": ["MemberA", "MemberB"],   // every public member (function, class, type, constant) THIS file defines
  "uses": [{ "from": "src/todo.ts", "members": ["TodoItem", "addTodo"] }]  // members imported from OTHER planned files; [] if none
}
RULES:
- "exports" lists ONLY members the file actually declares (no imports, no externals).
- "uses" entries must name a planned file in "from" and ONLY members that file's "exports" contains.
- If a file imports nothing, set "uses": []. Every file must have BOTH fields.
- The generated code must exactly honor these contracts — that is what makes the app compile.

QUESTION SCHEMA — Each question is an OBJECT, not a string:
{
  "key": "short-unique-id",       // used to map the user's answer back to this question
  "question": "The actual question text",
  "options": ["Choice A", "Choice B", "Choice C"],  // 2-5 concrete options when it's a choice; omit for free-form
  "type": "choice" | "text"      // "choice" when options are given, "text" for open-ended
}
Give the user CONCRETE OPTIONS whenever the question is between alternatives (interface style, language, database, AI difficulty) — options get rendered as radio buttons in the UI and produce far better answers than free text.

IMPORTANT: If the request is clear enough that no questions are needed, set questions to an empty array.
If you need answers before proceeding, put your structured questions in the array.`;

const WRITE_PROMPT = `You are an expert software engineer writing dense, production-quality code. The user wants to build something, and we've already planned the files and answered any questions.

Now, generate the actual COMPLETE code for EVERY file in the plan.

RULES:
1. Every file must be COMPLETE — working code, no placeholders, no TODOs
2. Files must properly import from each other
3. Include proper error handling, input validation, and edge cases
4. Follow best practices for the language
5. Each file must be production-quality

COMPACTNESS (MANDATORY):
6. Write DENSE, CONCISE code. NO boilerplate comments, NO verbose docstrings, NO explanatory comments, NO dead code.
7. Comment only where non-obvious (e.g. a tricky algorithm). Prefer expressive identifiers over comments.
8. Skip padding blank lines. Merge short statements where idiomatic. Use the smallest complete implementation that still handles errors and edge cases.
9. BUDGET: keep every file as compact as possible while COMPLETE (aim for ~80–300 lines). The ENTIRE response must fit the output limit — compactness is a hard requirement, not a preference.
10. HONOR THE FILE CONTRACTS in the plan: only import members listed in the exporting file's "exports". NEVER call, instantiate, or reference a member that isn't declared there — undeclared cross-file references are the #1 compile failure.
11. IMPORTS (MANDATORY): every member a file uses from another planned file MUST be imported at the top of that file (e.g. import { TodoItem } from './todo'). Referencing a sibling's symbol with NO import statement is a compile failure — never omit imports.

OUTPUT FORMAT — Return ONLY a single valid JSON object. NO markdown, NO code fences, NO commentary before or after:
{"files":[{"path":"src/main.ts","content":"import { TodoApp } from './todo';\\n\\nconst app = new TodoApp();\\napp.run();"}]}

⚠️ CRITICAL: The JSON must be COMPLETE — a truncated or unclosed JSON is a total failure. If you run low on space, TRIM ONLY comments and non-essential embellishments — NEVER drop core logic or leave the JSON unclosed.`;

/**
 * Build a plan prompt with the user's global UI preference injected.
 * This tells the LLM whether to default to CLI, GUI, or ask.
 */
function getPlanPromptWithPreference(preference: UiPreference): string {
  const preferenceInjection =
    preference === 'cli'
      ? `

━━━ GLOBAL UI PREFERENCE ━━━
The user has set their preference to: CLI-ONLY.
This means you MUST generate terminal/command-line apps by default.
DO NOT ask about CLI vs GUI — assume CLI.
Every "ui" node should generate terminal I/O code (stdin/stdout), not graphical interfaces.`
      : preference === 'gui'
        ? `

━━━ GLOBAL UI PREFERENCE ━━━
The user has set their preference to: GUI-ONLY.
This means you MUST generate graphical/web apps by default.
DO NOT ask about CLI vs GUI — assume a graphical interface.
Every "ui" node should generate GUI code, not terminal I/O.
For interactive GUI apps (games, drag-and-drop UIs, tools, dashboards) prefer a SINGLE self-contained HTML file (HTML + CSS + JS, no build step) — the app previews projects directly in the browser. Only use React/SwiftUI/etc. when the user explicitly asks for that stack.`
        : `

━━━ FORMAT NOTE ━━━
If the user wants an interactive GUI app (game, drag-and-drop UI, tool, dashboard, player, editor, viewer), the plan MUST include an index.html entry file — a SINGLE self-contained HTML page (HTML + CSS + JS inline, no build step) that renders the complete interface, because the app previews projects directly in the browser. Plan the GUI as an index.html plus any logic files it calls; never plan a GUI app with zero HTML. For simple/backend tools, plain code files are fine. Only ask about CLI vs GUI when it genuinely changes the architecture.`; // 'ask' — light guidance, LLM still asks

  return PLAN_PROMPT + preferenceInjection;
}

// GAP #5 whole-project repair: MULTI-FILE JSON output contract. This pass
// rewrites several files together, so its system prompt must demand a
// {"files": {path: content}} JSON payload — the single-file FILE_WRITE_PROMPT
// ("return ONLY the file's raw code") would fight that contract and make the
// model emit raw concatenated code instead.
const WHOLE_PROJECT_SYSTEM_PROMPT = `You are an expert software engineer repairing a generated project whose files have drifted out of sync with each other (call sites disagree with signatures, types disagree across files).

You will be given a set of files with their current contents (line-numbered), the compiler errors, and the project's planned contracts.

RULES:
1. Rewrite the requested files so the WHOLE project compiles together — signatures, call sites, and types must agree across files.
2. NEVER rename an exported member declared in the contracts (it would break its importers). You MAY change a signature, parameter list, return type, or call site — but the export names stay.
3. Do NOT invent new files, and do not rewrite files that weren't listed.
4. Every listed file must be present in your output, COMPLETE and production-quality — no placeholders, no TODOs.
5. Return ONLY a single valid JSON object (no markdown fences, no commentary) shaped exactly like:
{"files": {"src/main.ts": "<complete file content>", "src/game-logic.ts": "<complete file content>"}}`;

const FILE_WRITE_PROMPT = `You are an expert software engineer. Write ONE complete file for a project.

Return ONLY the raw file content. NO markdown, NO code fences, NO JSON wrapper, NO explanations — just the code. The code itself must be complete and production-quality.

COMPACTNESS: write DENSE code — no boilerplate comments, no verbose docstrings, minimal whitespace. Comment only where non-obvious. Prefer expressive identifiers over comments.`;

/**
 * Chunked-mode variant of WRITE_PROMPT: the model writes ONLY the files listed
 * in THIS CHUNK (the user prompt names them), never the whole plan. Keeps the
 * per-call output small so the chunked loop never approaches the token cap.
 */
const CHUNK_WRITE_PROMPT = `You are an expert software engineer writing dense, production-quality code, one chunk at a time.

The project has already been planned, and other files may already exist on disk.

RULES:
1. Write COMPLETE, working code ONLY for the file(s) listed in THIS CHUNK — never other files of the plan, never new unplanned files.
2. Every file must be COMPLETE — working code, no placeholders, no TODOs
3. Import from already-written files ONLY the members listed in their declared exports (see ALREADY-WRITTEN FILES and the FILE CONTRACTS).
4. NEVER reference a member that isn't declared in the exporting file's exports, and NEVER import from a file that isn't listed as already-written or in THIS CHUNK — undeclared cross-file references are the #1 compile failure.
5. Include proper error handling, input validation, and edge cases.

COMPACTNESS (MANDATORY):
6. Write DENSE, CONCISE code. NO boilerplate comments, NO verbose docstrings, NO explanatory comments, NO dead code.
7. Comment only where non-obvious. Prefer expressive identifiers over comments.
8. Keep every file as compact as possible while COMPLETE (aim for ~80–300 lines).

OUTPUT FORMAT — Return ONLY a single valid JSON object. NO markdown, NO code fences, NO commentary before or after:
{"files":[{"path":"src/main.ts","content":"..."}]}

⚠️ CRITICAL: The JSON must be COMPLETE — a truncated or unclosed JSON is a total failure. If you run low on space, TRIM ONLY comments and non-essential embellishments — NEVER drop core logic or leave the JSON unclosed.`;

/**
 * Sanitize a user-provided intent override (untrusted frontend JSON from the
 * editable UNDERSTOOD INTENT card) into an IntentSpec. Returns null when the
 * input carries nothing usable, so the caller falls back to extractIntent.
 * Never throws.
 */
function normalizeIntentOverride(v: unknown): IntentSpec | null {
  if (!v || typeof v !== 'object') return null;
  const obj = v as Record<string, unknown>;
  const str = (x: unknown): string => (typeof x === 'string' ? x.trim() : '');
  const goal = str(obj.goal);
  const targetUser = str(obj.targetUser);
  const uiStyle = str(obj.uiStyle);
  const language = str(obj.language);
  let coreFeatures: string[] = [];
  if (Array.isArray(obj.coreFeatures)) {
    coreFeatures = obj.coreFeatures.filter((f): f is string => typeof f === 'string' && f.trim().length > 0).map(f => f.trim());
  } else if (typeof obj.coreFeatures === 'string' && obj.coreFeatures.trim()) {
    coreFeatures = obj.coreFeatures.split(',').map(s => s.trim()).filter(Boolean);
  }
  coreFeatures = [...new Set(coreFeatures)].slice(0, 6);
  if (!goal && !targetUser && !uiStyle && !language && !coreFeatures.length) return null;
  return { goal, targetUser, coreFeatures, uiStyle, language };
}

// ─── Fast-coder intent refinement (roadmap Phase 3) ───────────────────────
// The rule-based extractor is deterministic and free, but genuinely ambiguous
// requests ("something to help my family plan trips") leave language / uiStyle /
// coreFeatures empty. When the spec is LOW-CONFIDENCE, a fast-coder call fills
// the gaps before planning. Zero cost on the common path (no call at all).

const FAST_INTENT_TIMEOUT_MS = 20_000;

/** Compact prompt asking the fast model to fill only the unknown intent fields. */
function buildIntentRefinePrompt(request: string, spec: IntentSpec): string {
  const known = [
    spec.goal ? `Goal: ${spec.goal}` : 'Goal: (unknown)',
    spec.targetUser ? `Target user: ${spec.targetUser}` : 'Target user: (unknown)',
    spec.coreFeatures.length ? `Core features: ${spec.coreFeatures.join(', ')}` : 'Core features: (unknown)',
    spec.uiStyle ? `UI style: ${spec.uiStyle}` : 'UI style: (unknown)',
    spec.language ? `Preferred language: ${spec.language}` : 'Preferred language: (unknown)',
  ].join('\n');
  return `The user asked to build something, but some intent fields could not be determined by rules. Fill in ONLY the fields marked (unknown), based on the request. Keep the fields that are already filled exactly as-is.

USER REQUEST: ${request}

CURRENT INTENT:
${known}

Return ONLY a single valid JSON object (no markdown, no fences) with exactly these keys, every value a string except coreFeatures which is an array of short strings (max 6):
{"goal":"...","targetUser":"...","coreFeatures":["..."],"uiStyle":"...","language":"..."}
Use "" for fields you truly cannot infer.`;
}

/**
 * Roadmap Phase 3: refine a low-confidence rule-based intent with the fast coder
 * (reasonFast — GPU1 0.5B → GPU0 1.5B → CPU → 7B fallback chain) before planning.
 * Returns the spec UNCHANGED when confidence is fine (common path — zero LLM
 * cost) or when the refinement fails / times out (never throws).
 */
async function refineIntentWithFastCoder(request: string, spec: IntentSpec, timeoutMs: number = FAST_INTENT_TIMEOUT_MS): Promise<IntentSpec> {
  if (!isLowConfidenceIntent(spec)) return spec;
  const prompt = buildIntentRefinePrompt(request, spec);
  try {
    // reasonFast has no timeout param — race it so a stuck fallback chain can't
    // eat the plan route's budget; '' on timeout/error -> parse fails -> fallback.
    const raw = await new Promise<string>((resolve) => {
      const timer = setTimeout(() => { clearTimeout(timer); resolve(''); }, timeoutMs);
      translator.reasonFast(prompt, { maxTokens: 400 }).then(
        (v) => { clearTimeout(timer); resolve(v || ''); },
        () => { clearTimeout(timer); resolve(''); }
      );
    });
    const parsed = raw ? extractJSON<IntentSpec>(raw) : null;
    const refined = normalizeIntentOverride(parsed);
    if (!refined) {
      console.warn('[codePlanner] intent refinement: fast-coder output unparseable, keeping rule-based spec');
      return spec;
    }
    const merged = mergeIntentSpecs(spec, refined);
    console.log(`[codePlanner] intent refined via fast-coder: goal="${merged.goal}" lang="${merged.language}" ui="${merged.uiStyle}"`);
    return merged;
  } catch (err) {
    console.warn('[codePlanner] intent refinement failed, keeping rule-based spec:', err);
    return spec;
  }
}

/**
 * Resolve the intent spec the way every route/generator sees it: a user-corrected
 * override (editable card, Phase 4) wins; otherwise the rule-based extractor, with
 * a fast-coder refinement pass filling gaps on low-confidence requests (Phase 3).
 */
async function resolveIntent(request: string, intentOverride?: unknown): Promise<IntentSpec> {
  const override = normalizeIntentOverride(intentOverride);
  if (override) return override;
  return refineIntentWithFastCoder(request, extractIntent(request));
}

/**
 * Generate code for a plan's files, with a per-file fallback and an optional
 * CHUNKED mode that never hits the token cap.
 *
 * Pass 0 — chunked (when chunkSize is set): split the dependency-ordered files
 * into small groups; each chunk is generated in its OWN LLM call (far under the
 * one-shot cap), written to the export dir, tsc-checked on the ACCUMULATED
 * files, and repaired (errors fed back to the model) before the next chunk.
 * Pass 1 — one-shot: every file in a single JSON response (fast, but can be
 * truncated when the total output exceeds the model's context window).
 * Pass 2 — per-file: if the JSON failed to parse, generate each planned file in
 * its own request with raw-code output. Small responses always fit the window,
 * so this is the reliability net that stops "LLM response was not valid JSON".
 */
async function generatePlanFiles(
  request: string,
  plan: CodePlan | null,
  answers: Record<string, string> | undefined,
  timeoutMs: number,
  libraryMode?: unknown,
  chunkSize?: unknown,
  intentOverride?: unknown
): Promise<{ files: Array<{ path: string; content: string }>; mode: 'one-shot' | 'per-file' | 'chunked'; exportDir?: string; repairRounds?: number; tscErrors?: number; tscVerified?: boolean; compileStatus?: string; tscFallback?: boolean; contractViolations?: number; intent?: IntentSpec; libraryContext?: string; renderSmoke?: { status: string; errors: string[]; detail: string }; cliSmoke?: { status: string; errors: string[]; detail: string } } | null> {
  // Resolve answer keys back to the original question text so the prompt reads
  // naturally ("Q: What interface? / A: Web") instead of raw keys ("Q: q1 / A: Web").
  const questionByKey = new Map((plan?.questions || []).map(q => [q.key, q.question]));
  const answersText = answers && typeof answers === 'object'
    ? Object.entries(answers).map(([key, a]) => `Q: ${questionByKey.get(key) || key}\nA: ${a}`).join('\n')
    : '(no additional answers provided)';
  // Phase 1: normalize the plan's per-file export/uses contracts up front, and
  // surface any plan-time contract violations (a file using a member the target
  // file never declares) BEFORE anything is generated.
  // GUI-entry enforcement also runs here with the ANSWERS — a request that the
  // planner thought was CLI-only becomes GUI when the user answers "Graphical
  // user interface", so the write path still gets its index.html.
  const contractFiles = ensureGuiEntryFile(normalizeFileContracts(plan?.files), request, answers);
  const fileList = contractFiles.map((f: PlannedFile, i: number) =>
    `[${i + 1}] ${f.path} (${f.language}) — ${f.summary}`
  ).join('\n');
  const contractsSection = buildFileContractsSection(contractFiles);
  for (const violation of checkContractConsistency(contractFiles)) {
    console.warn(`[codePlanner] contract violation: ${violation}`);
  }

  // Part 3: the writer also sees the structured intent (one-shot + per-file).
  // A user-corrected intent from the editable UI card (Phase 4) REPLACES the
  // auto-extraction; low-confidence requests get a fast-coder refinement (Phase 3).
  // The effective spec is also RETURNED so routes can persist it in the training
  // sidecar (Phase 2) — capturing what generation actually used, not the raw body.
  const effectiveIntent = await resolveIntent(request, intentOverride);
  const intentSection = formatIntentSection(effectiveIntent);

  // Part 2b: the one-shot ALSO gets the dominant node type's library context.
  const dominant = getDominantNodeType(contractFiles);
  const libMode = normalizeLibraryMode(libraryMode); // 'goal' | 'hybrid' | 'dominant' (A/B switchable)
  // Phase 2b fidelity: capture the EXACT library block injected into the write
  // prompt (caps + strategy) so the training sidecar matches what the model saw.
  const effectiveLibrary = getLibraryContextBlock(request, dominant, libMode);

  // Chunked mode: when a chunkSize is requested, generate files in small groups
  // (each LLM call well under the one-shot cap), writing each chunk to disk and
  // tsc-checking + repairing the accumulated files before the next chunk.
  // AUTO-CHUNK SAFETY: even without an explicit chunkSize, a plan this large
  // cannot fit in a single one-shot response (each file ~1-3k tokens), so we
  // default to chunked mode with a small chunk size rather than truncating.
  const explicitChunk = normalizeChunkSize(chunkSize);
  // AUTO-CHUNK SAFETY: even without an explicit chunkSize, a plan too large
  // for a single one-shot response must chunk — see estimateAutoChunkSize for
  // the P1 token-based rule (>6 files OR >6k est. output tokens). explicitChunk
  // wins via the `??` below; estimateAutoChunkSize only decides the default.
  const estTokens = estimatePlanOutputTokens(contractFiles);
  const autoChunkSize = estimateAutoChunkSize(contractFiles);
  const chunkSizeN = explicitChunk ?? autoChunkSize;
  if (chunkSizeN) {
    if (!explicitChunk) console.log(`[codePlanner] Plan has ${contractFiles.length} files (~${estTokens} est. output tokens) — auto-chunking (${chunkSizeN}/chunk) to avoid one-shot truncation`);
    const chunked = await generateChunkedFiles(request, intentSection, fileList, contractsSection, answersText, contractFiles, dominant, libMode, timeoutMs, chunkSizeN);
    return chunked ? { ...chunked, intent: effectiveIntent, libraryContext: effectiveLibrary } : null;
  }

  // Pass 1 — one-shot multi-file JSON. This single opaque LLM call can take
  // minutes (13k max tokens at ~30-50 tok/s), so broadcast phase progress + a
  // "still working" heartbeat — otherwise the UI is silent the whole time.
  const fullPrompt = `User request: ${request}\n\n${intentSection}\n\n━━━ PLAN ━━━\nFiles to create:\n${fileList || '(no files specified — infer what files are needed)'}\n\n${contractsSection}\n\n━━━ USER ANSWERS ━━━\n${answersText}\n${isGuiRequest(request, answers) ? `\n${GUI_WIDGET_SECTION}\n${APP_QUALITY_RULES}` : ''}\n\n━━━ TASK ━━━\nGenerate complete, working code for EVERY file. Each file must be production-quality with proper imports, error handling, and best practices.\n\nHONOR THE FILE CONTRACTS ABOVE: only import members listed in the exporting file's "exports". NEVER reference a member that isn't declared there — undeclared cross-file references are the #1 compile failure.\n\nIMPORTS (MANDATORY): every member this file uses from another planned file MUST be imported at the top of the file (e.g. import { TodoItem } from './todo'). A file that references a sibling's symbol with no import statement is a total failure — never omit imports.\n\nCOMPACTNESS: Write DENSE code — no boilerplate comments, no verbose docstrings, minimal whitespace. Prefer expressive identifiers over comments. Keep every file tight but complete; the whole response must fit the output budget.\n\nIMPORTANT: Write the ACTUAL file content. Not stubs, not placeholders — real working code.\n\nReturn ONLY valid JSON with a "files" array, where each entry has "path" and "content".`;
  const allPaths = contractFiles.map(f => f.path);
  emitCodegenProgress({
    phase: 'generating',
    percent: 8,
    generatingNodes: allPaths,
    message: `Generating ${contractFiles.length} file(s) in one shot — this can take a few minutes…`,
  });
  const heartbeat = startProgressHeartbeat(15_000, 12, 35, allPaths, 'Still generating code…');
  let response: string;
  try {
    response = await translator.reason(fullPrompt, getWritePromptWithContext(request, dominant, libMode), { maxTokens: 13000, timeoutMs });
  } finally {
    clearInterval(heartbeat);
  }
  const cleaned = cleanLLMResponse(response);
  const result = extractJSON<{ files: Array<{ path?: string; content?: string }> }>(cleaned);
  const oneShot = (result?.files || []).filter((f): f is { path: string; content: string } =>
    !!f && typeof f.path === 'string' && typeof f.content === 'string'
  );
  if (oneShot.length > 0) {
    console.log(`[codePlanner] one-shot: ${oneShot.length} file(s) parsed from a single response (libraryMode=${libMode})`);
    emitCodegenProgress({ phase: 'validating', percent: 40, generatingNodes: allPaths, message: `One-shot returned ${oneShot.length}/${contractFiles.length} file(s) — validating contracts…` });
    if (dominant) console.log(`[codePlanner] one-shot context: nodeType=${resolveOneShotNodeType(dominant)}/${dominant.language || 'any'} (libraryMode=${libMode})`);
    // GUI-entry guarantee: the one-shot may have omitted the injected index.html
    // (it wasn't in the LLM's original plan). Generate just that one file
    // per-file so the preview always has an interface to render. The check
    // requires a NON-EMPTY .html — a blank index.html from the model counts as
    // missing (it would render an empty page).
    if (isGuiRequest(request, answers) && !oneShot.some(f => /\.html?$/i.test(f.path) && (f.content || '').trim().length > 0)) {
      const guiEntry = contractFiles.find(f => /\.html?$/i.test(f.path));
      if (guiEntry) {
        console.warn('[codePlanner] one-shot omitted the GUI entry file — generating index.html per-file');
        const prompt = `User request: ${request}\n\n${intentSection}\n\n━━━ FILE CONTRACT ━━━\n${buildPerFileContractBlock(guiEntry, contractFiles)}\n\n━━━ USER ANSWERS ━━━\n${answersText}\n${GUI_WIDGET_SECTION}\n${APP_QUALITY_RULES}\n\n━━━ TASK ━━━\nWrite the COMPLETE, production-quality content for the file: ${guiEntry.path}\nLanguage: html\nPurpose: ${guiEntry.summary}\n\nThis is the app's ONLY GUI entry — the single self-contained HTML page the browser preview renders. Build the FULL interface here with inline CSS + JS, wired to the app's logic. Use the WIDGET TEMPLATES above verbatim — copy the exact element structure, never invent new element types. Return ONLY the file's raw code — no markdown fences, no JSON wrapper, no commentary.`;
        const raw = await translator.reason(prompt, getFileWritePromptWithContext(guiEntry), { maxTokens: 4096, timeoutMs });
        let content = cleanLLMResponse(raw);
        const wrapped = extractJSON<{ content?: string }>(content);
        if (wrapped && typeof wrapped.content === 'string') content = wrapped.content;
        else content = content.replace(/^```(?:\w+)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        if (content) {
          // The model may have returned index.html with blank content (it stays
          // in oneShot since the filter only checks typeof). Replace that blank
          // entry rather than push a duplicate path.
          const blankIdx = oneShot.findIndex(f => /\.html?$/i.test(f.path) && !(f.content || '').trim());
          if (blankIdx >= 0) oneShot[blankIdx] = { path: guiEntry.path, content };
          else oneShot.push({ path: guiEntry.path, content });
        }
      }
    }
    // Phase 1 closure + 1b partial gate + Phase 5 tsc gate on the one-shot path:
    // verify the GENERATED code against the declared contracts, fill any missing
    // planned files, and compile-check with bounded repair — all before returning.
    const finalOneShot = await finalizeGeneratedFiles(request, oneShot, contractFiles, intentSection, answersText, fileList, timeoutMs);
    // Codegen-depth fallback: when the one-shot tsc gate leaves residual compile
    // errors, auto-retry in CHUNKED mode (the per-chunk build/check/repair loop
    // that avoids both the one-shot truncation and the per-file-isolation failure
    // modes). Bounded to a single retry and only for multi-file plans — a
    // single-file plan gets nothing from chunking, and a non-errors verdict
    // (tscErrors === 0, status 'skipped'/'unavailable') never triggers it.
    if (finalOneShot.tscErrors > 0 && contractFiles.length >= 2) {
      console.warn(`[codePlanner] one-shot gate left ${finalOneShot.tscErrors} tsc error(s) — auto-fallback to chunked generation`);
      emitCodegenProgress({ phase: 'generating', percent: 45, generatingNodes: contractFiles.map(f => f.path), message: `One-shot compile gate failed (${finalOneShot.tscErrors} error(s)) — retrying in chunked mode…` });
      const chunkSizeFallback = Math.max(1, Math.min(4, contractFiles.length));
      const chunked = await generateChunkedFiles(request, intentSection, fileList, contractsSection, answersText, contractFiles, dominant, libMode, timeoutMs, chunkSizeFallback);
      if (chunked) {
        // The failed one-shot wrote to its own export dir — chunked wrote a
        // fresh one. Remove the orphaned dir (exports/ is generated output).
        try {
          const staleDir = finalOneShot.exportDir;
          const exportsRoot = pathModule.join(process.cwd(), 'exports');
          if (staleDir && staleDir.startsWith(exportsRoot)) fs.rmSync(staleDir, { recursive: true, force: true });
        } catch { /* non-fatal — an orphan export dir is harmless */ }
        return { ...chunked, tscFallback: true, intent: effectiveIntent, libraryContext: effectiveLibrary };
      }
      console.warn('[codePlanner] chunked fallback produced nothing — keeping the one-shot result (best effort)');
    }
    return { files: finalOneShot.files, mode: 'one-shot', exportDir: finalOneShot.exportDir, repairRounds: finalOneShot.repairRounds, tscErrors: finalOneShot.tscErrors, tscVerified: finalOneShot.tscVerified, compileStatus: finalOneShot.compileStatus, contractViolations: finalOneShot.contractViolations, intent: effectiveIntent, libraryContext: effectiveLibrary, renderSmoke: finalOneShot.renderSmoke, cliSmoke: finalOneShot.cliSmoke };
  }
  console.warn('[codePlanner] One-shot JSON unparseable. Response sample:', JSON.stringify(cleaned).substring(0, 200));

  // Pass 2 — per-file fallback
  if (!contractFiles.length) {
    console.warn('[codePlanner] One-shot JSON unparseable and no planned files to fall back on');
    return null;
  }
  console.warn(`[codePlanner] One-shot JSON unparseable — generating ${contractFiles.length} file(s) individually`);
  emitCodegenProgress({ phase: 'generating', percent: 42, generatingNodes: contractFiles.map(f => f.path), message: 'One-shot unparseable — falling back to per-file generation…' });
  const files: Array<{ path: string; content: string }> = [];
  for (let fi = 0; fi < contractFiles.length; fi++) {
    const f = contractFiles[fi];
    emitCodegenProgress({
      phase: 'generating',
      batch: fi,
      totalBatches: contractFiles.length,
      generatingNodes: [f.path],
      percent: 45 + Math.round((fi / Math.max(1, contractFiles.length)) * 18),
      message: `Generating ${f.path}…`,
    });
    const contractBlock = buildPerFileContractBlock(f, contractFiles);
    // Match html files by language OR path (case-insensitive) so GUI entries
    // always get the widget templates — consistent with the chunked path.
    const isHtmlFile = f.language?.toLowerCase() === 'html' || /\.html?$/i.test(f.path);
    const prompt = `User request: ${request}\n\n${intentSection}\n\n━━━ PROJECT PLAN ━━━\n${fileList}\n\n${contractBlock}\n\n━━━ USER ANSWERS ━━━\n${answersText}\n${isHtmlFile ? `\n${GUI_WIDGET_SECTION}\n${APP_QUALITY_RULES}` : ''}\n\n━━━ TASK ━━━\nWrite the COMPLETE, production-quality content for the file: ${f.path}\nLanguage: ${f.language}\nPurpose: ${f.summary}\n\nImport from the other planned files ONLY the members declared in this file's contract above (from the exporting files' "exports"). NEVER reference an undeclared member.${isHtmlFile ? ' For GUI files, copy the WIDGET TEMPLATES above verbatim AND follow the APP QUALITY RULES — use native <video>/<audio> for media, never a <div> placeholder.' : ''} Return ONLY the file's raw code — no markdown fences, no JSON wrapper, no commentary.`;
    const raw = await translator.reason(prompt, getFileWritePromptWithContext(f), { maxTokens: 4096, timeoutMs });
    let content = cleanLLMResponse(raw);
    const wrapped = extractJSON<{ content?: string }>(content);
    if (wrapped && typeof wrapped.content === 'string') content = wrapped.content;
    else content = content.replace(/^```(?:\w+)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    if (content) files.push({ path: f.path, content });
  }
  if (!files.length) return null;
  // Phase 1 closure + Phase 5 tsc gate on the per-file fallback path too.
  const finalPerFile = await finalizeGeneratedFiles(request, files, contractFiles, intentSection, answersText, fileList, timeoutMs);
  return { files: finalPerFile.files, mode: 'per-file', exportDir: finalPerFile.exportDir, repairRounds: finalPerFile.repairRounds, tscErrors: finalPerFile.tscErrors, tscVerified: finalPerFile.tscVerified, compileStatus: finalPerFile.compileStatus, contractViolations: finalPerFile.contractViolations, intent: effectiveIntent, libraryContext: effectiveLibrary, renderSmoke: finalPerFile.renderSmoke, cliSmoke: finalPerFile.cliSmoke };
}

/**
 * Chunked incremental generation — the build/check/repair loop.
 *
 * Files are ordered by dependency (import targets first), split into chunks of
 * `chunkSize`, and each chunk is generated in its own LLM call. Every chunk is
 * written to the export dir immediately, then tsc runs on the ACCUMULATED
 * files; any errors trigger a repair pass for the failing files (errors fed
 * back to the model) before the next chunk starts. Returns the exportDir so the
 * route doesn't re-write (files are already on disk when this resolves).
 */
async function generateChunkedFiles(
  request: string,
  intentSection: string,
  fileList: string,
  contractsSection: string,
  answersText: string,
  contractFiles: PlannedFile[],
  dominant: { type: string; language: string } | null,
  libMode: LibraryMode,
  timeoutMs: number,
  chunkSize: number
): Promise<{ files: Array<{ path: string; content: string }>; mode: 'chunked'; exportDir: string; repairRounds: number; tscErrors: number; tscVerified: boolean; compileStatus: 'clean' | 'errors' | 'skipped' | 'unavailable'; renderSmoke?: { status: string; errors: string[]; detail: string }; cliSmoke?: { status: string; errors: string[]; detail: string } } | null> {
  const ordered = orderFilesByDependency(contractFiles);
  const chunks = chunkFiles(ordered, chunkSize);
  const exportDir = getExportDir(request);
  let files: Array<{ path: string; content: string }> = [];
  let repairRounds = 0;
  const total = chunks.length;

  for (let ci = 0; ci < total; ci++) {
    const chunk = chunks[ci];
    const chunkNo = ci + 1;
    emitCodegenProgress({
      phase: 'generating',
      batch: ci,
      totalBatches: total,
      generatingNodes: chunk.map(f => f.path),
      percent: Math.min(80, Math.round(((ci + 1) / total) * 70)),
      message: `Generating chunk ${chunkNo}/${total} (${chunk.length} file(s))…`,
    });
    const prompt = buildChunkPrompt(request, intentSection, fileList, contractsSection, answersText, files, chunk, chunkNo, total);
    const response = await translator.reason(prompt, getWritePromptWithContext(request, dominant, libMode, CHUNK_WRITE_PROMPT), { maxTokens: 8192, timeoutMs });
    const cleaned = cleanLLMResponse(response);
    const result = extractJSON<{ files: Array<{ path?: string; content?: string }> }>(cleaned);
    const chunkFiles = (result?.files || []).filter((f): f is { path: string; content: string } =>
      !!f && typeof f.path === 'string' && typeof f.content === 'string'
    );

    // This chunk's JSON failed -> per-file raw-code fallback for THIS chunk only.
    if (!chunkFiles.length) {
      console.warn(`[codePlanner] chunk ${chunkNo}/${total} JSON unparseable — per-file fallback for this chunk`);
      for (const f of chunk) {
        const contractBlock = buildPerFileContractBlock(f, contractFiles);
        const p = `User request: ${request}\n\n${intentSection}\n\n━━━ PROJECT PLAN ━━━\n${fileList}\n\n${contractBlock}\n\n━━━ USER ANSWERS ━━━\n${answersText}\n\n━━━ TASK ━━━\nWrite the COMPLETE, production-quality content for the file: ${f.path}\nLanguage: ${f.language}\nPurpose: ${f.summary}\n\nImport from the already-written files ONLY the members declared in their contracts above. NEVER reference an undeclared member or an unplanned file. Return ONLY the file's raw code — no markdown fences, no JSON wrapper, no commentary.`;
        const raw = await translator.reason(p, getFileWritePromptWithContext(f), { maxTokens: 4096, timeoutMs });
        let content = cleanLLMResponse(raw);
        const wrapped = extractJSON<{ content?: string }>(content);
        if (wrapped && typeof wrapped.content === 'string') content = wrapped.content;
        else content = content.replace(/^```(?:\w+)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        if (content) chunkFiles.push({ path: f.path, content });
      }
    }

    // Buffer step: write this chunk to the export dir immediately. Only accept
    // files that belong to THIS chunk's planned paths — a stray invented or
    // later-chunk file in the JSON must not sneak onto disk early.
    const chunkPathSet = new Set(chunk.map(f => normalizeContractPath(f.path)));
    const acceptedChunkFiles = chunkFiles.filter(cf => chunkPathSet.has(normalizeContractPath(cf.path)));
    if (acceptedChunkFiles.length !== chunkFiles.length) {
      console.warn(`[codePlanner] chunk ${chunkNo}/${total}: dropped ${chunkFiles.length - acceptedChunkFiles.length} unplanned file(s) from the response`);
    }
    for (const cf of acceptedChunkFiles) {
      const fullPath = safeJoin(exportDir, cf.path);
      fs.mkdirSync(pathModule.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, cf.content, 'utf-8');
      files.push(cf);
    }

    // Build/check -> repair -> RE-CHECK loop (capped rounds per chunk): tsc on
    // the ACCUMULATED files, feed errors back for the failing files, re-run tsc
    // until clean or the cap is hit — the "build, check, repeat" the user asked
    // for, verified within the chunk instead of only at the very end.
    const MAX_REPAIR_ROUNDS_PER_CHUNK = 4; // was 2 — chase mechanical classes to 0
    let chunkVerdict = await runTscCheck(exportDir, files);
    let repairRound = 0;
    while (chunkVerdict.errors.length && repairRound < MAX_REPAIR_ROUNDS_PER_CHUNK) {
      repairRound += 1;
      repairRounds += 1;
      let chunkRoundChanged = false;
      console.warn(`[codePlanner] chunk ${chunkNo}/${total}: ${chunkVerdict.errors.length} tsc error(s) — repair round ${repairRound}`);
      // Percent is CHUNK-RELATIVE (same base as the generating event + the
      // repair increment) so the progress bar never bounces backwards.
      emitCodegenProgress({ phase: 'validating', percent: Math.min(95, Math.round(((ci + 1) / total) * 70) + repairRound * 6), message: `Fixing ${chunkVerdict.errors.length} compile error(s) in chunk ${chunkNo}/${total}…` });
      // tsc reports ABSOLUTE paths (we pass them); map export-dir-relative -> errors
      // using the same normalized-path key as cf.path. Key by BOTH the relative
      // path and the basename so a prefix mismatch can't silently skip repair.
      const errByFile = new Map<string, string[]>();
      const addErr = (key: string, e: string) => {
        if (!key) return;
        if (!errByFile.has(key)) errByFile.set(key, []);
        errByFile.get(key)!.push(e);
      };
      for (const e of chunkVerdict.errors) {
        const m = e.match(/^([^:]+)\s*\(/);
        if (!m) continue;
        const absPath = m[1].trim();
        const rel = absPath.startsWith(exportDir)
          ? absPath.slice(exportDir.length).replace(/^[/\\]+/, '')
          : (absPath.split(/[\\/]/).pop() || '');
        addErr(normalizeContractPath(rel), e);
        addErr(normalizeContractPath(absPath.split(/[\\/]/).pop() || ''), e);
      }
      // Repair ONLY the files named in the errors (matched by path OR basename).
      for (const cf of files) {
        const cfPathKey = normalizeContractPath(cf.path);
        const cfBaseKey = normalizeContractPath(cf.path.split('/').pop() || '');
        const fileErrs = errByFile.get(cfPathKey) || errByFile.get(cfBaseKey);
        if (!fileErrs || !fileErrs.length) continue;
        const planned = contractFiles.find(t => t.path === cf.path) || { path: cf.path, summary: '', language: '' };
        // Deterministic first pass: drop phantom npm-dependency imports
        // (TS2307 for a package that isn't installed) — zero LLM calls, no
        // body changes. Remaining undefined symbols stay in the error list and
        // the regenerate round below fixes them.
        const stripped = stripPhantomPackageImports(cf.content);
        if (stripped && stripped !== cf.content) {
          fs.writeFileSync(safeJoin(exportDir, cf.path), stripped, 'utf-8');
          cf.content = stripped;
          chunkRoundChanged = true;
          console.warn(`[codePlanner] chunk ${chunkNo}/${total}: ${cf.path} phantom npm-dependency imports removed deterministically (no LLM call)`);
          continue;
        }
        // Missing-return (TS2355/TS7030) and void-return (TS2322-void)
        // deterministic fixes — same zero-LLM policy as the one-shot gate.
        if (fileErrs.some(e => /error\s+TS(2355|7030)/.test(e))) {
          const missingRet = applyDeterministicMissingReturnFix(cf.content, fileErrs);
          if (missingRet && missingRet !== cf.content) {
            fs.writeFileSync(safeJoin(exportDir, cf.path), missingRet, 'utf-8');
            cf.content = missingRet;
            chunkRoundChanged = true;
            console.warn(`[codePlanner] chunk ${chunkNo}/${total}: ${cf.path} TS2355/TS7030 missing-return fixed deterministically (no LLM call)`);
            continue;
          }
        }
        if (fileErrs.some(e => /error\s+TS2322:.*not assignable to type '(Promise<)?void'/.test(e))) {
          const voidRet = applyDeterministicVoidReturnFix(cf.content, fileErrs);
          if (voidRet && voidRet !== cf.content) {
            fs.writeFileSync(safeJoin(exportDir, cf.path), voidRet, 'utf-8');
            cf.content = voidRet;
            chunkRoundChanged = true;
            console.warn(`[codePlanner] chunk ${chunkNo}/${total}: ${cf.path} TS2322-void return fixed deterministically (no LLM call)`);
            continue;
          }
        }
        // Regenerate-with-errors-in-context from round 1 (same policy as the
        // one-shot gate): the model rewrites the whole file against a
        // line-numbered copy with each error at its exact line — never line-
        // patches a file that already failed once.
        const repairPrompt = buildRegenerateWithErrorsPrompt(request, planned, cf.content, fileErrs, contractFiles);
        const raw = await translator.reason(repairPrompt, FILE_WRITE_PROMPT, { maxTokens: 4096, timeoutMs });
        let content = cleanLLMResponse(raw);
        const wrapped = extractJSON<{ content?: string }>(content);
        if (wrapped && typeof wrapped.content === 'string') content = wrapped.content;
        else content = content.replace(/^```(?:\w+)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        if (content && content !== cf.content) {
          fs.writeFileSync(safeJoin(exportDir, cf.path), content, 'utf-8');
          cf.content = content;
          chunkRoundChanged = true;
        }
      }
      // RE-CHECK: verify the repair actually fixed things within this chunk.
      chunkVerdict = await runTscCheck(exportDir, files);
      // A repair round that changed nothing means the remaining errors are
      // unfixable by the current prompts — stop, don't burn the chunk cap.
      if (!chunkRoundChanged) break;
    }
  }

  let finalVerdict = await runTscCheck(exportDir, files);
  // GAP #5 — whole-project repair pass: cross-chunk drift (an earlier chunk's
  // file exports a signature a later chunk calls wrong) survives per-chunk
  // repair because each chunk is fixed in isolation. Rewrite all involved
  // files together, bounded, before shipping.
  if (finalVerdict.errors.length > 0) {
    const wholeProject = await runWholeProjectRepair(request, files, contractFiles, exportDir, finalVerdict, timeoutMs);
    files = wholeProject.files;
    finalVerdict = wholeProject.verdict;
    repairRounds += wholeProject.rounds;
  }
  const tscErrors = finalVerdict.errors.length;
  // Behavioral gates (chunked path): one-shot auto-fallbacks land here, so the
  // app must be verified too — AND repaired, exactly like the one-shot path.
  // tsc can't see single-file HTML OR whether a CLI actually runs, so run the
  // appropriate probe and feed a FAILED verdict into the SAME bounded repair
  // loop the finalize path uses (previously chunked only REPORTED the verdict
  // and shipped a broken app with no retry — the reviewer-flagged gap).
  const { renderSmoke, cliSmoke } = await runBehavioralSmokeGates({
    request,
    files,
    contractFiles,
    exportDir,
    timeoutMs,
    tag: 'chunked',
    canRepair: () => true, // chunked has its own per-chunk budgets; smoke gets its own 2-round cap
    consumeRepair: () => {},
  });
  console.log(`[codePlanner] chunked: ${files.length} file(s) in ${total} chunk(s), ${repairRounds} repair round(s), ${tscErrors} remaining tsc error(s) [gate: ${finalVerdict.status}]`);
  return files.length ? { files, mode: 'chunked', exportDir, repairRounds, tscErrors, tscVerified: finalVerdict.status === 'clean' || finalVerdict.status === 'errors', compileStatus: finalVerdict.status, renderSmoke, cliSmoke } : null;
}

/** Write generated files into a dedicated exports/<slug>-<ts>/ dir (path-safe). */
/**
 * Make the GUI entry file truly self-contained before writing to disk.
 *
 * The preview iframe renders via `srcdoc` — it has NO filesystem, so a
 * generated index.html that references `<script src="/game.ts">` or
 * `<link href="/styles.css">` fails to load those files and renders a
 * BLANK WHITE page. Small models frequently emit external refs despite the
 * "inline everything" instruction. This deterministically replaces such
 * references with inline `<script>`/`<style>` blocks pulled from the sibling
 * generated files, so the GUI entry always works in the preview regardless of
 * what the model wrote.
 */
// inlineExternalScriptRefs + stripTypeScript now live in ../ai/guiShared.ts
// (re-exported above) — they are shared with the canvas path (fileGenerator).

function writeFilesToExport(request: string, files: Array<{ path: string; content: string }>) {
  // Guarantee the GUI entry is self-contained before it hits disk (see
  // inlineExternalScriptRefs) — external <script src>/<link href> refs render
  // a blank page in the srcdoc preview iframe.
  inlineExternalScriptRefs(files);

  const exportDir = getExportDir(request);
  const written: WrittenFile[] = [];
  for (const file of files) {
    try {
      const fullPath = safeJoin(exportDir, file.path);
      fs.mkdirSync(pathModule.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, file.content, 'utf-8');
      written.push({ path: file.path, content: file.content, status: 'written' });
    } catch (err: any) {
      written.push({ path: file.path, content: file.content, status: 'error', error: err.message });
    }
  }
  return { written, exportDir };
}

// ─── Training-data loop (roadmap Phase 2) ─────────────────────────────────
// Every generation drops a `_training.json` metadata sidecar next to its export
// dir (request + intent + questions/answers + plan). scripts/capture-verified-pairs.py
// is the GATE: it runs tsc on each export and only converts tsc-clean files into
// training rows, so the model learns from WORKING code. Best-effort — a sidecar
// failure must never fail a generation.

interface TrainingSidecarMeta {
  request: string;
  intent?: unknown;
  plan: CodePlan | null;
  answers?: Record<string, string> | undefined;
  mode: string;
  repairRounds?: number;
  tscErrors?: number;
  /** The library context actually retrieved for this request (see getLibraryContext). */
  libraryContext?: string;
  files: string[];
}

function writeTrainingSidecar(exportDir: string, meta: TrainingSidecarMeta): void {
  try {
    // NOTE (fidelity): meta.libraryContext is the one-shot EFFECTIVE library
    // block (goal-based, or the 900+900 hybrid, or dominant-mode node-type).
    // When generation fell back to per-file, each file actually saw the
    // per-file node-type context (1500 cap) instead — an accepted approximation.
    const planFiles = (meta.plan?.files || []).map(f => ({
      path: f.path,
      summary: f.summary,
      language: f.language,
      exports: f.exports || [],
    }));
    const sidecar = {
      version: 1,
      createdAt: new Date().toISOString(),
      request: meta.request,
      intent: meta.intent ?? null,
      questions: (meta.plan?.questions || []).map(q => ({ key: q.key, question: q.question, options: q.options || [] })),
      answers: meta.answers || {},
      planFiles,
      mode: meta.mode,
      repairRounds: meta.repairRounds ?? 0,
      tscErrors: meta.tscErrors ?? 0,
      libraryContext: meta.libraryContext ?? null,
      files: meta.files,
    };
    fs.writeFileSync(pathModule.join(exportDir, '_training.json'), JSON.stringify(sidecar, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[codePlanner] training sidecar write failed (non-fatal):', err);
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────

/**
 * POST /api/reason/plan-code
 * Body: { request: string, context?: string }
 * Returns: { plan: CodePlan }
 *
 * Takes a user request to build something, generates a plan with
 * the files to create and questions to ask the user.
 */
codePlannerRoutes.post('/plan-code', async (req: Request, res: Response) => {
  try {
    const { request, context, scale } = req.body;
    if (!request || typeof request !== 'string') {
      return res.status(400).json({ error: 'request is required' });
    }

    const scaleN = normalizeScale(scale);
    if (scaleN) console.log(`[codePlanner/plan] Scale override requested: ${scaleN}`);
    const preference = loadPreference().preference;
    const planSystemPrompt = getPlanPromptWithContext(request, preference, scaleN);

    // Part 3: normalize the raw request into a structured spec BEFORE planning,
    // so the planner sees a clean understanding of what the user asked for.
    // Phase 3: low-confidence specs get a fast-coder refinement pass first.
    const spec = await resolveIntent(request);
    const intentSection = formatIntentSection(spec);

    const fullPrompt = context
      ? `User request: ${request}\n\n${intentSection}\n\nContext:\n${context}\n\nPlan the files needed and ask any clarifying questions.`
      : `User request: ${request}\n\n${intentSection}\n\nPlan the files needed and ask any clarifying questions.`;

    // Phase 1: every planned file now carries exports/uses contracts (~15-25
    // tokens/file), so give the plan output real headroom.
    const response = await translator.reason(fullPrompt, planSystemPrompt, { maxTokens: 4096, timeoutMs: PLAN_TIMEOUT_MS });
    let cleaned = cleanLLMResponse(response);

    // Parse JSON from response
    let parsed = extractJSON<CodePlan>(cleaned);
    // Truncation repair: a plan JSON cut at max_tokens used to degrade to a
    // reasoning-only fallback. If the reply is JSON-shaped but unparseable,
    // re-ask ONCE for the complete document at a larger budget.
    if (!parsed && cleaned.trim().startsWith('{')) {
      const retryRaw = await translator.reason(
        `${fullPrompt}\n\nYour previous plan JSON was truncated before it finished. Return the COMPLETE plan JSON object — every field closed, valid JSON, no markdown, no commentary.`,
        planSystemPrompt,
        { maxTokens: 8192, timeoutMs: PLAN_TIMEOUT_MS },
      );
      const retryCleaned = cleanLLMResponse(retryRaw);
      const retried = extractJSON<CodePlan>(retryCleaned);
      if (retried) {
        cleaned = retryCleaned;
        parsed = retried;
      }
    }
    // Phase 1: normalize per-file export/uses contracts (drops pathless files,
    // sanitizes untrusted LLM JSON) + structured questions. GUI-entry
    // enforcement runs here so the plan shown to the user already lists the
    // index.html that makes the app viewable.
    const plan = parsed
      ? { ...parsed, files: ensureGuiEntryFile(normalizeFileContracts(parsed.files), request), questions: normalizeQuestions(parsed.questions) }
      : null;

    if (!plan || !plan.files || !Array.isArray(plan.files)) {
      console.warn('[codePlanner] Failed to parse plan from LLM response:', cleaned.substring(0, 200));
      // Fallback: return raw response as reasoning with no structured plan
      return res.json({
        success: true,
        plan: {
          reasoning: cleaned,
          files: [],
          questions: [],
        },
        raw: cleaned,
      });
    }

    res.json({ success: true, plan, intent: spec });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Code plan failed';
    // Match on error NAME (incl. cause.name): the OpenAI SDK may wrap our abort in
    // APIConnectionError, so the 'AbortError'/'TimeoutError' marker can live in .cause.
    // Match on error NAME (incl. cause) — Node 24 rejects with 'TimeoutError', which the SDK may
    // wrap in APIConnectionError (marker in .cause) or rethrow as APIUserAbortError ('Request was
    // aborted.'). Anchored phrase match so a genuine upstream 'connect ETIMEDOUT' is not
    // misclassified as our own safety timeout.
    const errMsg = String((error as any)?.message || '');
    const timedOut = /abort|timeout/i.test(`${(error as any)?.name || ''} ${(error as any)?.cause?.name || ''}`) || /^Request was aborted\.?$/i.test(errMsg);
    if (timedOut) {
      console.error(`[codePlanner/plan] Timed out after ${PLAN_TIMEOUT_MS / 1000}s:`, msg);
      return res.status(504).json({ error: `Planning timed out after ${PLAN_TIMEOUT_MS / 1000}s — try a shorter request`, timeout: true });
    }
    console.error('[codePlanner/plan] Error:', msg);
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/reason/write-code
 * Body: { request: string, plan: CodePlan, answers: Record<string, string>, intent?: Partial<IntentSpec> }
 * Returns: { written: WrittenFile[], files: Array<{path,content}>, summary: string }
 *   - `written`: per-file records with status ('written' | 'skipped' | 'error')
 *   - `files`: the generated files ({path, content}) — the array consumers
 *     expecting a files list should read (P0 API papercut, fixed Aug 7 2026)
 *
 * Takes the plan and user's answers, generates actual code for all files,
 * and writes them to disk. `intent` (optional) is the user-corrected spec from
 * the editable UNDERSTOOD INTENT card — it replaces the auto-extracted one.
 */
codePlannerRoutes.post('/write-code', async (req: Request, res: Response) => {
  try {
    const { request, plan, answers, libraryMode, chunkSize, intent, scale } = req.body;
    if (!request || !plan) {
      return res.status(400).json({ error: 'request and plan are required' });
    }

    // Large/enterprise plans auto-chunk when the caller didn't pick a chunk
    // size — a one-shot write of 30+ files would truncate at the token cap.
    const scaleN = normalizeScale(scale);
    if (scaleN && !chunkSize) console.log(`[codePlanner/write] Scale ${scaleN} — defaulting to chunked generation`);
    const gen = await generatePlanFiles(request, plan, answers, WRITE_TIMEOUT_MS, libraryMode, chunkSize ?? (scaleN === 'large' || scaleN === 'enterprise' ? 4 : undefined), intent);
    if (!gen) {
      return res.json({
        success: false,
        error: 'Failed to generate code — the model returned an unusable response',
      });
    }

    // Chunked mode already wrote each chunk to its export dir during the
    // build/check/repair loop; the one-shot/per-file paths are finalized in
    // generatePlanFiles too (partial gate + contract verify + tsc gate) and
    // return their exportDir. When an exportDir is present, files are ALREADY
    // on disk — never re-write (the route only writes when generation returned
    // bare files, which no path does anymore).
    let written: WrittenFile[] = [];
    let exportDir = '';
    if (gen.exportDir) {
      exportDir = gen.exportDir;
      written = gen.files.map(f => ({ path: f.path, content: f.content, status: 'written' as const }));
    } else {
      const w = writeFilesToExport(request, gen.files);
      written = w.written;
      exportDir = w.exportDir;
    }

    const successCount = written.filter(w => w.status === 'written').length;
    const remainingTsc = gen.tscErrors ?? 0;
    const fallbackNote = gen.tscFallback ? ' — retried in chunked mode' : '';
    const modeSuffix = gen.mode === 'per-file'
      ? ' (per-file mode)'
      : gen.mode === 'chunked'
        ? ` (chunked mode, ${gen.repairRounds ?? 0} repair round(s))`
        : gen.contractViolations
          ? ` (${gen.contractViolations} contract violation(s))`
          : '';
    // #1 codegen-depth: a surviving compile error must be surfaced, never
    // hidden behind a ✅ — the independent tsc gate is the authority.
    const summary = successCount > 0
      ? remainingTsc > 0
        ? `⚠️ Wrote ${successCount} file${successCount > 1 ? 's' : ''} — ${remainingTsc} compile error(s) remain${modeSuffix}${gen.contractViolations ? ` (${gen.contractViolations} contract violation(s))` : ''}${fallbackNote}`
        : `✅ Wrote ${successCount} file${successCount > 1 ? 's' : ''} successfully${modeSuffix}${fallbackNote}`
      : '❌ Failed to write any files';

    // Phase 2 (training-data loop): persist the metadata sidecar so the capture
    // script can turn tsc-clean exports into training pairs. Best-effort.
    if (successCount > 0) {
      writeTrainingSidecar(exportDir, {
        request, intent: gen.intent ?? intent, plan, answers,
        mode: gen.mode,
        repairRounds: gen.repairRounds,
        tscErrors: gen.tscErrors,
        libraryContext: gen.libraryContext ?? getLibraryContext(request),
        files: written.filter(w => w.status === 'written').map(w => w.path),
      });
      // Phase 2b (shared learning loop): fold this verified export into the SAME
      // verified-generations.jsonl the canvas path writes to. Fire-and-forget —
      // the tsc gate + dedupe run in the background, never blocking the response.
      void captureVerifiedSidecar(exportDir).catch((err) =>
        console.warn('[codePlanner] verified sidecar capture failed (non-fatal):', err)
      );
    }

    emitCodegenProgress({ phase: 'done', percent: 100, message: summary });
    res.json({
      success: true,
      written,
      // P0 API fix (Aug 7 2026): consumers expecting a `files` array now get
      // one — the successfully-written files as {path, content} (uniform with
      // `written`'s statuses: an entry that errored on disk is never listed).
      // `written` (with per-file status) stays for backward compatibility.
      files: written.filter(w => w.status === 'written').map(w => ({ path: w.path, content: w.content })),
      summary,
      exportDir,
      mode: gen.mode,
      repairRounds: gen.repairRounds ?? 0,
      tscErrors: gen.tscErrors ?? 0,
      compileStatus: gen.compileStatus ?? (remainingTsc > 0 ? 'errors' : 'clean'),
      contractViolations: gen.contractViolations ?? 0,
      // 3D/graphics gate: headless-Chrome render verdict for HTML entries
      // ({ status: 'passed'|'failed'|'skipped'|'unavailable', errors, detail }).
      renderSmoke: gen.renderSmoke,
      // CLI behavioral gate: tsx-execution verdict for non-HTML entries.
      cliSmoke: gen.cliSmoke,
      totalFiles: gen.files.length,
      writtenCount: successCount,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Code write failed';
    // Match on error NAME (incl. cause.name): the OpenAI SDK may wrap our abort in
    // APIConnectionError, so the 'AbortError'/'TimeoutError' marker can live in .cause.
    // Match on error NAME (incl. cause) — Node 24 rejects with 'TimeoutError', which the SDK may
    // wrap in APIConnectionError (marker in .cause) or rethrow as APIUserAbortError ('Request was
    // aborted.'). Anchored phrase match so a genuine upstream 'connect ETIMEDOUT' is not
    // misclassified as our own safety timeout.
    const errMsg = String((error as any)?.message || '');
    const timedOut = /abort|timeout/i.test(`${(error as any)?.name || ''} ${(error as any)?.cause?.name || ''}`) || /^Request was aborted\.?$/i.test(errMsg);
    if (timedOut) {
      console.error(`[codePlanner/write] Timed out after ${WRITE_TIMEOUT_MS / 1000}s:`, msg);
      emitCodegenProgress({ phase: 'done', percent: 100, message: '❌ Code generation timed out' });
      return res.status(504).json({ error: `Code generation timed out after ${WRITE_TIMEOUT_MS / 1000}s — try fewer files or a simpler request`, timeout: true });
    }
    console.error('[codePlanner/write] Error:', msg);
    emitCodegenProgress({ phase: 'done', percent: 100, message: '❌ Code generation failed' });
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/reason/interactive
 * Full interactive flow in a single call:
 *   1. LLM plans, asks questions
 *   2. User provides answers via the request
 *   3. LLM generates code
 *   4. Code is written to disk
 *
 * This is for when the user provides enough detail upfront
 * and doesn't need the back-and-forth.
 *
 * Body: { request: string, context?: string, autoWrite?: boolean }
 */
codePlannerRoutes.post('/interactive', async (req: Request, res: Response) => {
  try {
    const { request, context, autoWrite, libraryMode, chunkSize, intent, scale } = req.body;
    if (!request) {
      return res.status(400).json({ error: 'request is required' });
    }

    // Step 1: Generate a plan
    const scaleN = normalizeScale(scale);
    if (scaleN) console.log(`[codePlanner/interactive] Scale override requested: ${scaleN}`);
    const preference = loadPreference().preference;
    const planSystemPrompt = getPlanPromptWithContext(request, preference, scaleN);

    // Part 3: structured intent, injected into the interactive plan prompt too.
    // Phase 3: low-confidence specs get a fast-coder refinement pass first.
    const spec = await resolveIntent(request);
    const planPrompt = context
      ? `User request: ${request}\n\n${formatIntentSection(spec)}\n\nAdditional context:\n${context}\n\nPlan the code needed. If you need clarifying info, ask questions.`
      : `User request: ${request}\n\n${formatIntentSection(spec)}\n\nPlan the code needed. If you need clarifying info, ask questions.`;

    // Phase 1: plan output now includes exports/uses contracts — extra headroom.
    const planResponse = await translator.reason(planPrompt, planSystemPrompt, { maxTokens: 4096, timeoutMs: PLAN_TIMEOUT_MS });
    let planCleaned = cleanLLMResponse(planResponse);
    let parsedPlan = extractJSON<CodePlan>(planCleaned);
    // Truncation repair: re-ask once for the COMPLETE plan JSON at a larger
    // budget when the first reply was cut off mid-JSON.
    if (!parsedPlan && planCleaned.trim().startsWith('{')) {
      const retryRaw = await translator.reason(
        `${planPrompt}\n\nYour previous plan JSON was truncated before it finished. Return the COMPLETE plan JSON object — every field closed, valid JSON, no markdown, no commentary.`,
        planSystemPrompt,
        { maxTokens: 8192, timeoutMs: PLAN_TIMEOUT_MS },
      );
      const retryCleaned = cleanLLMResponse(retryRaw);
      const retried = extractJSON<CodePlan>(retryCleaned);
      if (retried) {
        planCleaned = retryCleaned;
        parsedPlan = retried;
      }
    }
    // Phase 1: normalize per-file export/uses contracts + structured questions.
    const plan = parsedPlan
      ? { ...parsedPlan, files: normalizeFileContracts(parsedPlan.files), questions: normalizeQuestions(parsedPlan.questions) }
      : null;

    if (!plan || !plan.files) {
      return res.json({
        success: true,
        step: 'plan',
        error: 'Could not create a structured plan',
        raw: planCleaned,
        questions: [],
        files: [],
        reasoning: planCleaned,
        intent: spec,
      });
    }

    // If there are questions and this isn't auto-write, return the plan for user input
    if (plan.questions && plan.questions.length > 0 && !autoWrite) {
      return res.json({
        success: true,
        step: 'questions',
        plan,
        needsAnswers: true,
        intent: spec,
      });
    }

    // Step 2: Generate the actual code (no questions, or auto-write). Reuse the
    // plan-time refined spec (Phase 3) as the override so the write path sees the
    // SAME intent the plan showed — a body-provided (Phase 4 card) intent wins.
    // Large/enterprise plans auto-chunk when the caller didn't pick a chunk size.
    const gen = await generatePlanFiles(request, plan, undefined, WRITE_TIMEOUT_MS, libraryMode, chunkSize ?? (scaleN === 'large' || scaleN === 'enterprise' ? 4 : undefined), intent || spec);
    if (!gen) {
      return res.json({
        success: true,
        step: 'write',
        error: 'Failed to generate code',
        plan,
      });
    }

    // Chunked mode already wrote each chunk incrementally; the one-shot/per-file
    // paths return their exportDir from finalizeGeneratedFiles (files on disk).
    let written: WrittenFile[] = [];
    let exportDir = '';
    if (gen.exportDir) {
      exportDir = gen.exportDir;
      written = gen.files.map(f => ({ path: f.path, content: f.content, status: 'written' as const }));
    } else {
      const w = writeFilesToExport(request, gen.files);
      written = w.written;
      exportDir = w.exportDir;
    }

    const successCount = written.filter(w => w.status === 'written').length;
    const remainingTsc = gen.tscErrors ?? 0;
    const fallbackNote = gen.tscFallback ? ' — retried in chunked mode' : '';
    const modeSuffix = gen.mode === 'per-file'
      ? ' (per-file mode)'
      : gen.mode === 'chunked'
        ? ` (chunked mode, ${gen.repairRounds ?? 0} repair round(s))`
        : gen.contractViolations
          ? ` (${gen.contractViolations} contract violation(s))`
          : '';
    // #1 codegen-depth: a surviving compile error must be surfaced, never
    // hidden behind a ✅ — the independent tsc gate is the authority.
    const summaryMsg = remainingTsc > 0
      ? `⚠️ Wrote ${successCount} file${successCount > 1 ? 's' : ''} — ${remainingTsc} compile error(s) remain${modeSuffix}${gen.contractViolations ? ` (${gen.contractViolations} contract violation(s))` : ''}${fallbackNote}`
      : `✅ Wrote ${successCount} file${successCount > 1 ? 's' : ''} successfully${modeSuffix}${fallbackNote}`;

    // Phase 2 (training-data loop): persist the metadata sidecar (reuses the
    // plan-time refined spec so the capture row matches what was generated).
    if (successCount > 0) {
      writeTrainingSidecar(exportDir, {
        request, intent: gen.intent ?? intent ?? spec, plan,
        answers: undefined,
        mode: gen.mode,
        repairRounds: gen.repairRounds,
        tscErrors: gen.tscErrors,
        libraryContext: gen.libraryContext ?? getLibraryContext(request),
        files: written.filter(w => w.status === 'written').map(w => w.path),
      });
      // Phase 2b (shared learning loop): same fire-and-forget capture as the
      // interactive write path — one loop for both chat and canvas pipelines.
      void captureVerifiedSidecar(exportDir).catch((err) =>
        console.warn('[codePlanner] verified sidecar capture failed (non-fatal):', err)
      );
    }

    emitCodegenProgress({ phase: 'done', percent: 100, message: summaryMsg });
    res.json({
      success: true,
      step: 'done',
      plan,
      written,
      // P0 API fix (Aug 7 2026): same `files` array as /write-code so both
      // write paths share the client contract (successfully-written only).
      files: written.filter(w => w.status === 'written').map(w => ({ path: w.path, content: w.content })),
      exportDir,
      mode: gen.mode,
      repairRounds: gen.repairRounds ?? 0,
      tscErrors: gen.tscErrors ?? 0,
      compileStatus: gen.compileStatus ?? (remainingTsc > 0 ? 'errors' : 'clean'),
      summary: summaryMsg,
      totalFiles: gen.files.length,
      writtenCount: successCount,
      intent: spec,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Interactive code failed';
    // Match on error NAME (incl. cause.name): the OpenAI SDK may wrap our abort in
    // APIConnectionError, so the 'AbortError'/'TimeoutError' marker can live in .cause.
    // Match on error NAME (incl. cause) — Node 24 rejects with 'TimeoutError', which the SDK may
    // wrap in APIConnectionError (marker in .cause) or rethrow as APIUserAbortError ('Request was
    // aborted.'). Anchored phrase match so a genuine upstream 'connect ETIMEDOUT' is not
    // misclassified as our own safety timeout.
    const errMsg = String((error as any)?.message || '');
    const timedOut = /abort|timeout/i.test(`${(error as any)?.name || ''} ${(error as any)?.cause?.name || ''}`) || /^Request was aborted\.?$/i.test(errMsg);
    if (timedOut) {
      console.error(`[codePlanner/interactive] Timed out after ${WRITE_TIMEOUT_MS / 1000}s:`, msg);
      emitCodegenProgress({ phase: 'done', percent: 100, message: '❌ Code generation timed out' });
      return res.status(504).json({ error: `Code generation timed out after ${WRITE_TIMEOUT_MS / 1000}s — try fewer files or a simpler request`, timeout: true });
    }
    console.error('[codePlanner/interactive] Error:', msg);
    emitCodegenProgress({ phase: 'done', percent: 100, message: '❌ Code generation failed' });
    res.status(500).json({ error: msg });
  }
});

// ─── Helper: Extract JSON from LLM response ────────────────────────────

function extractJSON<T>(text: string): T | null {
  if (!text) return null;
  const clean = text.replace(/^\uFEFF/, '').trim();

  // 1) Direct parse
  try { return JSON.parse(clean) as T; } catch {}

  // 2) Code fences (json or any language)
  for (const f of [...clean.matchAll(/```(?:\w+)?\s*\n?([\s\S]*?)```/g)]) {
    try { return JSON.parse(f[1].trim()) as T; } catch {}
  }

  // 3) Balanced-brace scan from the first '{' — recovers prose-wrapped and
  //    truncated-but-balanced JSON (the most common small-model failure).
  const start = clean.indexOf('{');
  if (start !== -1) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < clean.length; i++) {
      const ch = clean[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(clean.slice(start, i + 1)) as T; } catch {}
        }
      }
    }
    // 4) Last resort: tail from the first '{' to the end
    try { return JSON.parse(clean.slice(start)) as T; } catch {}
  }
  return null;
}
