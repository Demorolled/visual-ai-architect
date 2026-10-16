/**
 * reaCli — REA ("reverse engineer anything") as a VACA-side process tool.
 *
 * VACA's Deep Scan has one job: take whatever the user dropped and produce a
 * node tree for the canvas. The local LLM path (`/api/scan/deep`) *invents* an
 * architecture from file contents; REA *measures* one from the artifact itself
 * and returns it as evidence-backed JSON. This module is the boundary: it runs
 * the pinned CLI from `node_modules` and hands back a parsed envelope.
 *
 * Measured contract (rea-agents 6.5.0, verified on this machine rather than
 * assumed from the docs):
 *   - `--format json` is the flag. The README's `--json` is not one; the CLI
 *     rejects unknown options, and `--token-limit` cannot be combined with
 *     `--format json` at all ("Token windows cannot preserve structured output").
 *   - **stdout carries exactly ONE JSON object** — the result envelope, or a
 *     structured failure envelope. Progress does NOT share stdout.
 *   - **stderr carries NDJSON progress** (`{"rea_progress":{phase,completed,
 *     total,message,sequence}}`), one object per line. It is diagnostic only.
 *   - A failure still comes back as a well-formed envelope:
 *     `{error, code, category, message, retryable, remediation:{action}, details}`
 *     — e.g. pointing a universal probe at a directory returns
 *     `code: "target_unavailable"` with a `remediation` naming the right command
 *     for that target class. That is why routing mistakes can be reported
 *     honestly instead of guessed at. A failure envelope does NOT always carry
 *     an `error` field (the missing-engine case is `{code, category, message,
 *     retryable, remediation, details}` only), which is why `isReaFailure`
 *     identifies one by shape rather than by that single key.
 *   - `--filter-output <paths>` selects the keys to emit, and it applies to
 *     SUCCESS AND FAILURE alike: asking only for graph keys turned a large
 *     envelope into `{}` — the failure envelope was silently erased, which would
 *     have turned "Ghidra is not installed" into "no files to map". The filter
 *     below therefore names the graph keys AND the failure keys together.
 *   - `doctor` is the readiness source: `scope_checks[]` entries carry
 *     `{name, ok, classification, detail, remediation}`, where a missing engine
 *     is `classification: "missing_analysis_engine"` with REA's own remediation
 *     text. VACA does not maintain a second, drifting table of install advice.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// This backend is ESM, so `__dirname` does not exist at runtime. Same pattern as
// tools/tools/ServiceTools.ts and utils/chatToolRunner.ts.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** The REA package version this integration was written and measured against. */
export const REA_PINNED_VERSION = '6.5.0';

/** The package's `bin.rea` entry, relative to the package root. */
const REA_ENTRY_REL = 'scripts/rea.mjs';

/**
 * The keys Deep Scan actually reads, plus the keys a failure envelope uses.
 *
 * Measured, not guessed: without this, `rea analyze` on this repo's own
 * `frontend/src` emitted a **112 MB** envelope (106 MB of it
 * `normalized_result.semantic_graph`, which no mapping rule touches) and a small
 * app's envelope is dominated by the same raw dumps. The same list keeps
 * `code`/`message`/`remediation` so a refusal still arrives intact.
 */
export const DEEP_SCAN_FILTER_OUTPUT = [
  // Failure envelope (both shapes: with and without `error`).
  'error',
  'code',
  'category',
  'message',
  'retryable',
  'remediation',
  'details',
  // What the analysis mapper reads.
  'normalized_result.graph',
  'normalized_result.summary',
  'normalized_result.statistics',
  'normalized_result.limitations',
  'normalized_result.input_path',
  'normalized_result.format',
  'subject',
  'provider',
  'operation',
  'evidence_id',
  // What the SOURCE-GRAPH mapper reads (`rea import-reference-source`, used for
  // non-JavaScript source trees). These keys share nothing with the envelope
  // above, so a filter naming only the envelope keys reduced a Java scan to
  // `{}` — live, through the app, it read as "no application files to map".
  'schema',
  'authority',
  'root_alias',
  'root_sha256',
  'inventory_state',
  'entries',
  'relationships',
  'parse_failures',
  'exclusions',
  'languages',
  'manifests',
  'vcs',
  'provenance',
  'limitations',
].join(',');

export interface ReaProgress {
  phase?: string;
  completed?: number;
  total?: number;
  message?: string;
  sequence?: number;
}

/** The structured failure REA returns instead of an envelope. */
export interface ReaFailure {
  /** Present on routing/policy refusals, absent on capability refusals. */
  error?: string;
  code?: string;
  category?: string;
  message?: string;
  retryable?: boolean;
  remediation?: { action?: string } | string | null;
  details?: Record<string, unknown>;
}

export interface ReaEnvelope {
  evidence_id?: string;
  subject?: {
    name?: string;
    local_path?: string;
    format?: string;
    architecture?: unknown;
    digest?: { sha256?: string };
  };
  provider?: { id?: string; name?: string; version?: string };
  operation?: string;
  normalized_result?: Record<string, unknown>;
  raw_result?: unknown;
}

export interface ReaRun {
  /** True when REA produced an envelope (not a failure envelope, not a crash). */
  ok: boolean;
  envelope: ReaEnvelope | null;
  /** Present when REA refused the request — carries its own remediation. */
  failure: ReaFailure | null;
  stdout: string;
  stderr: string;
  progress: ReaProgress[];
  error: string | null;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
}

// ─── Locating the pinned CLI ───────────────────────────────────────────────

/**
 * Walk up from this module to find the installed REA entry. `backend` is an npm
 * workspace, so the package hoists to the REPO root's `node_modules` and is not
 * a sibling of `src/` — a fixed relative path would break on install layout
 * changes, so this searches upward the way Node's own resolution does.
 */
export function resolveReaEntry(startDir: string = __dirname): string | null {
  let dir = path.resolve(startDir);
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = path.join(dir, 'node_modules', 'rea-agents', REA_ENTRY_REL);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** True when the pinned CLI is on disk (does not run it). */
export function isReaInstalled(): boolean {
  return resolveReaEntry() !== null;
}

/** The exact command that installs what this integration needs. */
export function reaInstallHint(): string {
  return `npm install rea-agents@${REA_PINNED_VERSION} --workspace=backend`;
}

// ─── Parsing ───────────────────────────────────────────────────────────────

/** stderr is NDJSON progress; anything unparseable is ordinary logging. */
export function progressFromStderr(stderr: string): ReaProgress[] {
  const out: ReaProgress[] = [];
  for (const line of (stderr || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && parsed.rea_progress) {
        out.push(parsed.rea_progress as ReaProgress);
      }
    } catch {
      // Not JSON — a plain log line, ignored on purpose.
    }
  }
  return out;
}

/**
 * A failure envelope is identified by its SHAPE, not by its exit code and not by
 * the `error` key alone: REA returns `{error, code, …}` for an unroutable target
 * but `{code, category, message, retryable, remediation, details}` — no `error` —
 * when an analysis engine is missing. Testing only for `error` made the second
 * shape read as a successful scan of an artifact with nothing in it.
 *
 * A success envelope is the inverse: it always carries `normalized_result` and
 * `operation`, and never `code`/`error`.
 */
export function isReaFailure(value: unknown): value is ReaFailure {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.normalized_result !== undefined || typeof v.operation === 'string') return false;
  return typeof v.error === 'string' || typeof v.code === 'string';
}

/**
 * Split stdout into an envelope or a failure. stdout is ONE JSON object; a
 * non-JSON stdout is reported as an error rather than silently treated as
 * success (a crash message must never read as an empty architecture).
 */
export function parseReaStdout(stdout: string): {
  envelope: ReaEnvelope | null;
  failure: ReaFailure | null;
  error: string | null;
} {
  const text = (stdout || '').trim();
  if (!text) return { envelope: null, failure: null, error: 'rea produced no output' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Tolerate trailing noise: take the last complete JSON object on stdout.
    const lastLine = text.split(/\r?\n/).filter((l) => l.trim().startsWith('{')).pop();
    if (lastLine) {
      try {
        parsed = JSON.parse(lastLine);
      } catch {
        return { envelope: null, failure: null, error: `rea output was not JSON: ${text.slice(0, 200)}` };
      }
    } else {
      return { envelope: null, failure: null, error: `rea output was not JSON: ${text.slice(0, 200)}` };
    }
  }

  if (isReaFailure(parsed)) return { envelope: null, failure: parsed, error: null };
  if (parsed && typeof parsed === 'object') return { envelope: parsed as ReaEnvelope, failure: null, error: null };
  return { envelope: null, failure: null, error: 'rea output was not a JSON object' };
}

/** One-line human summary of a failure, including REA's own remediation. */
export function describeReaFailure(failure: ReaFailure | null): string {
  if (!failure) return 'REA failed';
  const remediation = typeof failure.remediation === 'string'
    ? failure.remediation
    : failure.remediation?.action;
  const parts = [failure.message || failure.error || failure.code || 'REA failed'];
  if (failure.code && parts[0] !== failure.code) parts.push(`(${failure.code})`);
  if (remediation && remediation !== parts[0]) parts.push(`— ${remediation}`);
  return parts.filter(Boolean).join(' ');
}

// ─── Running ───────────────────────────────────────────────────────────────

/** Additional arguments every invocation carries. */
function baseArgs(args: string[]): string[] {
  return args.includes('--format') ? args : [...args, '--format', 'json'];
}

/**
 * Run the pinned REA CLI. Never throws: every failure mode (not installed,
 * timeout, crash, structured refusal) is reported in the result so callers can
 * decide whether to stop or continue.
 */
export async function runRea(
  args: string[],
  opts: { timeoutMs?: number; cwd?: string; maxOutputBytes?: number; filterOutput?: string } = {},
): Promise<ReaRun> {
  const started = Date.now();
  const empty: Omit<ReaRun, 'error' | 'durationMs'> = {
    ok: false,
    envelope: null,
    failure: null,
    stdout: '',
    stderr: '',
    progress: [],
    exitCode: null,
    timedOut: false,
  };

  const entry = resolveReaEntry();
  if (!entry) {
    return {
      ...empty,
      error: `REA is not installed — run: ${reaInstallHint()}`,
      durationMs: Date.now() - started,
    };
  }

  const timeoutMs = opts.timeoutMs ?? 300_000;
  const maxOutputBytes = opts.maxOutputBytes ?? 64 * 1024 * 1024;
  const allArgs = baseArgs(args);
  if (opts.filterOutput) allArgs.push('--filter-output', opts.filterOutput);

  return new Promise<ReaRun>((resolve) => {
    const child = spawn(process.execPath, [entry, ...allArgs], {
      cwd: opts.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      // `detached` puts REA in its OWN process group, so a timeout can kill the
      // analysis workers it spawns instead of leaving them running (and so
      // `kill(-pid)` addresses that group rather than this process's).
      detached: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let truncated = false;
    let settled = false;

    const finish = (error: string | null, exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const parsed = error ? { envelope: null, failure: null, error: null } : parseReaStdout(stdout);
      // A structured refusal is a REA verdict, not a transport error — it keeps
      // its own error-code + remediation so the caller can pass it to the user.
      const failure = parsed.failure;
      resolve({
        ok: !error && !failure && !!parsed.envelope,
        envelope: parsed.envelope,
        failure,
        stdout,
        stderr,
        progress: progressFromStderr(stderr),
        error: error ?? parsed.error,
        exitCode,
        timedOut,
        durationMs: Date.now() - started,
      });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      // Kill the whole group: REA spawns analysis workers that outlive a bare
      // SIGTERM to the wrapper (the same reason the smoke gates kill groups).
      try { process.kill(-child.pid!, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch { /* already gone */ } }
      setTimeout(() => {
        try { process.kill(-child.pid!, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* already gone */ } }
      }, 3_000).unref?.();
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length >= maxOutputBytes) {
        truncated = true;
        return;
      }
      stdout += chunk.toString();
      if (stdout.length >= maxOutputBytes) truncated = true;
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < maxOutputBytes) stderr += chunk.toString();
    });
    child.on('error', (err) => finish(`could not start rea: ${err.message}`, null));
    child.on('close', (code) => {
      if (timedOut) {
        finish(`rea timed out after ${timeoutMs}ms`, code);
        return;
      }
      // A cut-off result is reported as a cut-off result. Letting it through
      // made truncation surface as `output was not JSON`, which reads like a
      // broken REA rather than a result too large to carry.
      if (truncated) {
        const size = maxOutputBytes >= 1024 * 1024
          ? `${Math.round(maxOutputBytes / (1024 * 1024))}MB`
          : `${Math.round(maxOutputBytes / 1024)}KB`;
        finish(
          `rea returned more than ${size} of JSON for this target — the result was cut off before it could be parsed. ` +
            'Point Deep Scan at the application directory rather than one enormous subtree.',
          code,
        );
        return;
      }
      // Exit code is NOT the verdict: the structured envelope is. A non-zero code
      // with a parseable envelope is still reported (with its code) because REA
      // uses non-zero exits for "analysis completed with a refusal envelope".
      finish(null, code);
    });
  });
}

// ─── Readiness (the install hint source) ───────────────────────────────────

export interface ReaCheck {
  name: string;
  ok: boolean;
  classification?: string;
  detail?: string;
  remediation?: string;
}

export interface ReaReadiness {
  /** REA installed AND its environment healthy for this target. */
  ready: boolean;
  installed: boolean;
  environmentHealthy: boolean;
  checks: ReaCheck[];
  /** Every missing requirement, each with REA's own remediation text. */
  blockers: ReaCheck[];
  error: string | null;
}

/**
 * Ask REA what is missing for a given target (`doctor`). This is where install
 * advice comes from — measured, not maintained by VACA.
 */
export async function reaReadiness(target?: string, opts: { timeoutMs?: number } = {}): Promise<ReaReadiness> {
  const args = ['doctor'];
  if (target) args.push('--target', target);
  const run = await runRea(args, { timeoutMs: opts.timeoutMs ?? 120_000 });

  if (!run.ok || !run.envelope) {
    return {
      ready: false,
      installed: isReaInstalled(),
      environmentHealthy: false,
      checks: [],
      blockers: [],
      error: run.error ?? describeReaFailure(run.failure),
    };
  }

  const env = run.envelope as Record<string, any>;
  const checks: ReaCheck[] = Array.isArray(env.scope_checks) ? env.scope_checks : [];
  const blockers = checks.filter((c) => !c.ok);
  return {
    ready: env.healthy === true,
    installed: true,
    environmentHealthy: env.environment_healthy === true,
    checks,
    blockers,
    error: null,
  };
}

/** Human-readable list of what to install, straight from REA's `doctor`. */
export function formatReadinessHint(readiness: ReaReadiness): string {
  if (readiness.error) return readiness.error;
  if (readiness.blockers.length === 0) return 'REA is ready.';
  return readiness.blockers
    .map((b) => `${b.name}: ${b.detail || b.classification || 'not ready'}${b.remediation ? ` — ${b.remediation}` : ''}`)
    .join('\n');
}
