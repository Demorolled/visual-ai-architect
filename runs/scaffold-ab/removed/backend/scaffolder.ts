/**
 * scaffolder.ts — the per-file SCAFFOLD LLM step.
 *
 * VACA plans an app as a set of files with declared exports, then writes each
 * file. Nothing in that pipeline ever asked a model to PLAN a single file
 * before writing it — the writer went straight from "here is the node/plan" to
 * code, and the measured cost is cross-file drift (wrong module names, invented
 * siblings, exports that don't line up). This module adds that missing step.
 *
 * The task format and system prompt are copied VERBATIM from the acceptance
 * gate (scripts/eval_acceptance.py) so the runtime call is the SAME task the
 * role is scored on — otherwise a scaffold model could pass the gate and still
 * be called wrong in production. Both write paths inject it:
 *   - layers/fileGenerator.ts   (canvas/blueprint per-node writes)
 *   - routes/codePlanner.ts     (chat per-file one-shot + chunked writes)
 *
 * OFF BY DEFAULT: gated by `features.scaffold` in backend/llm-config.json (or
 * VACA_SCAFFOLD=1/0). When off, isScaffoldEnabled() returns false and callers
 * skip the extra LLM call entirely — existing builds are byte-identical.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/** Copy of eval_acceptance.py's SYS_SCAFFOLD — MUST stay identical. */
export const SYS_SCAFFOLD =
  'You are a VACA scaffold author. VACA plans an app as a set of files with declared ' +
  'exports, then writes each file. Given the TASK (a file to recreate) and the ' +
  'PREVIOUS scaffold, propose a REFINED scaffold: what the module must expose, its ' +
  'internal structure, how it fits the app\'s other files, and what to verify before ' +
  'answering.';

export interface ScaffoldSpec {
  /** Target file path, e.g. "src/notes.ts". */
  file: string;
  lang?: string;
  /** Symbols the module must export. */
  expectedExports?: string[];
  /** Every sibling file in the app plan (for "how it fits the others"). */
  appPlan?: string[];
  /** The user's app request. */
  request?: string;
  /** What this specific file is for. */
  summary?: string;
}

export interface ScaffoldResult {
  file: string;
  scaffold: string;
}

type ReasonFn = (
  prompt: string,
  system?: string,
  opts?: { maxTokens?: number; temperature?: number; timeoutMs?: number; role?: string },
) => Promise<string>;

// Regenerating an identical scaffold (retry rounds, chunk overlap) should not
// cost another LLM call. Keyed on the exact task the model would see.
const scaffoldCache = new Map<string, string>();

/** Test hook — clear the per-process scaffold cache. */
export function clearScaffoldCache(): void {
  scaffoldCache.clear();
}

/**
 * Is the scaffold step on? Precedence: VACA_SCAFFOLD env (1/0) then
 * llm-config.json `features.scaffold`. Default false — opt-in per build box.
 */
export function isScaffoldEnabled(): boolean {
  const env = process.env.VACA_SCAFFOLD;
  if (env === '1' || env === 'true') return true;
  if (env === '0' || env === 'false') return false;
  try {
    const configPath = path.resolve(__dirname, '..', '..', 'llm-config.json');
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return Boolean(cfg?.features?.scaffold);
  } catch {
    return false;
  }
}

function slugId(file: string): string {
  return file.replace(/[^A-Za-z0-9_.-]/g, '-') || 'file';
}

/**
 * The TASK line — the same shape tasks.txt carries, so the runtime prompt and
 * the accepted/trained format are the same string.
 */
export function buildScaffoldTask(spec: ScaffoldSpec): string {
  const parts = [`id=${slugId(spec.file)} file=${spec.file} lang=${spec.lang || 'typescript'}`];
  const plan = (spec.appPlan || []).filter(Boolean);
  if (plan.length) parts.push('app plan: ' + plan.join(', '));
  const exports = (spec.expectedExports || []).filter(Boolean);
  if (exports.length) parts.push('expected exports: ' + exports.join(', '));
  let task = spec.request || 'a VACA app';
  if (spec.summary) task = `${task} :: ${spec.summary}`;
  parts.push('task: ' + task);
  return parts.join(' | ');
}

/** The exact user prompt the gate sends (eval_acceptance.py scaffold role). */
export function buildScaffoldPrompt(spec: ScaffoldSpec, previous = '(none)'): string {
  return `TASK: ${buildScaffoldTask(spec)}\nPREV_SCAFFOLD: ${previous}`;
}

// A scaffold is prose written for a human: it usually ends with a fenced
// ```typescript example. Injected into the write prompt that example reads as
// "the file so far", so the writer CONTINUES it instead of writing the file.
// Measured in the A/B: 23/197 outputs were class-body fragments, and 62/197
// teacher scaffolds had an ODD fence count (a truncated, never-closed example).
// This keeps only the exports/types contract so the block can never look like an
// unfinished file. Mirrored in scripts/eval_acceptance.py (trim_scaffold) —
// keep the two regexes in sync.
const FENCE = /```[\s\S]*?```/g;
const FENCE_OPEN = /```[\s\S]*$/;
const HEAD_MARK = /^\s*(?:#{1,6}|\*{1,2}|[-*+]|\d+[.)])\s*/;
const SYMBOL = /`[^`\n]{1,40}`/;
const EXPORTISH = /\b(?:exports?|interface|type|class|function|const|enum)\b/;

/**
 * Reduce a scaffold to its exports/types contract — no code, no prose.
 * Drops every fenced code block (and everything after an unterminated one),
 * then keeps only lines naming a symbol or declaring an export/type.
 */
export function trimScaffold(text: string, maxChars = 600): string {
  let t = (text || '').replace(FENCE, '').replace(FENCE_OPEN, '');
  t = t.replace(/^\s*```.*$/gm, '');
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of t.split('\n')) {
    const s = raw.replace(HEAD_MARK, '').trim().replace(/^\*+|\*+$/g, '').trim();
    if (!s) continue;
    if (!SYMBOL.test(s) && !EXPORTISH.test(s)) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  let body = out.join('\n');
  if (body.length > maxChars) body = body.slice(0, maxChars).replace(/\n[^\n]*$/, '');
  return body;
}

/** Wrap a derived scaffold for injection into a code-write prompt. */
export function formatScaffoldSection(scaffold: string): string {
  const body = trimScaffold(scaffold);
  if (!body) return '';
  return (
    '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
    'REFINED SCAFFOLD (scaffold stage — build TO this chart)\n' +
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
    body + '\n' +
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  );
}

/**
 * Generate one file's scaffold. Never throws — a scaffold failure must never
 * block a build; the caller falls back to writing without the section.
 */
export async function generateScaffold(
  reason: ReasonFn,
  spec: ScaffoldSpec,
  opts?: { maxTokens?: number; timeoutMs?: number },
): Promise<string | null> {
  const prompt = buildScaffoldPrompt(spec);
  const key = crypto.createHash('sha1').update(prompt).digest('hex');
  const cached = scaffoldCache.get(key);
  if (cached) return cached;
  try {
    const out = await reason(prompt, SYS_SCAFFOLD, {
      maxTokens: opts?.maxTokens ?? 600,
      temperature: 0,
      timeoutMs: opts?.timeoutMs,
      role: 'scaffold',
    });
    const text = (out || '').trim();
    if (!text) return null;
    scaffoldCache.set(key, text);
    return text;
  } catch (err: any) {
    console.warn('[scaffolder] scaffold generation failed (writing without it):', err?.message || err);
    return null;
  }
}

/**
 * Convenience: scaffold every planned file, returning the non-empty results.
 * Sequential on purpose — the scaffold model is a small local model and
 * parallel calls contend for the same GPU.
 */
export async function scaffoldFiles(
  reason: ReasonFn,
  specs: ScaffoldSpec[],
  opts?: { maxTokens?: number; timeoutMs?: number },
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const spec of specs) {
    const scaffold = await generateScaffold(reason, spec, opts);
    if (scaffold) out.set(spec.file, scaffold);
  }
  return out;
}
