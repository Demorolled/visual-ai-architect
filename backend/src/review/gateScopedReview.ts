/**
 * gateScopedReview — the post-generation AI code review, narrowed to what the
 * compile gate actually flagged.
 *
 * Why it is scoped. `routes/generation.ts` used to run `codeReviewer.reviewAll`
 * over EVERY generated file and was then switched off as "redundant and slow
 * with the local 7B model". Both halves of that objection are answered with
 * scope rather than absence:
 *
 *   - NON-TS BUILDS ONLY. A TS/JS build is already covered by the static
 *     CodeScanner (Step 1) plus tsc; the reviewer earns its cost on the
 *     languages tsc cannot read, where the compile gate is the only other
 *     verdict. A build with no non-TS gate reviews nothing.
 *   - GATE-FLAGGED FILES ONLY. `collectGateFlaggedFiles` attributes the gate's
 *     own error lines back to the files they name, so the reviewer reads the
 *     two files `go build` rejected instead of all forty. A clean non-TS build
 *     reviews nothing at all.
 *
 * Review only. By the time this runs the bounded gate repair loop has already
 * run; re-generating a file behind it would undo the repairs it proved. The
 * auto-fix path stays on demand via POST /api/review/and-fix.
 */

import {
  codeReviewer,
  toReviewableFiles,
  type BatchConfig,
  type CodeReviewResult,
  type ReviewableFile,
} from './CodeReviewer.js';
import { resolveGateLanguage, type LanguageGate } from '../sandbox/nonTsCompileGate.js';
import { groupGateErrorsByFile, groupStubFailuresByFile } from '../sandbox/nonTsRepair.js';

// ─── Scope: which files the gate flagged ───────────────────────────────────

/**
 * Rows that share the `languageGates` array but are NOT a language gate: the
 * hardcoded-secret scan and the duplicate-declaration scan append their own
 * rows (see `runProjectGates`). They must not count as "a non-TS build" and
 * they get no language-wide fallback — see `collectGateFlaggedFiles`.
 */
export const PSEUDO_GATE_LANGUAGES: ReadonlySet<string> = new Set([
  'hardcoded-secret',
  'duplicate-definitions',
]);

/** A staged file, as the gate saw it. */
export interface StagedGateFile {
  /** Scaffold-relative path the gate compiled (`scaffoldRelPath`). */
  path: string;
  /** Bare file name as the export/generator reports it. */
  fileName: string;
  nodeId: string;
  nodeLabel: string;
  language: string;
  /** Unused by the attribution itself; required by the shared matcher. */
  content: string;
}

/** A file the gates flagged, with the gate's own words for why. */
export interface GateFlaggedFile {
  nodeId: string;
  fileName: string;
  nodeLabel: string;
  language: string;
  reasons: string[];
}

/** True when at least one real (non-TS, non-pseudo) language gate ran. */
export function isNonTsGateBuild(languageGates: Array<{ language: string; clean: boolean }>): boolean {
  return languageGates.some((g) => !PSEUDO_GATE_LANGUAGES.has(g.language));
}

/**
 * Does this gate line actually NAME the file, the way a diagnostic or a stub
 * failure does — `converter/converter.go:41:9: undefined: csv`,
 * `Program.cs(5,9): error CS0103`, `word_counter.py: count_words is a stub`?
 *
 * The shared matcher also attributes a line that merely CONTAINS a normalized
 * path: a Go package banner (`# pkg/converter`) matches the shallowest
 * `converter.go` through its normalized pass. That is useful context for a
 * repair prompt, but it is not a FLAG — a review scoped by it would read a file
 * the compiler never complained about. A line that names no file this way is
 * covered by the per-language fallback below instead of by a guess.
 */
function lineNamesFile(line: string, filePath: string): boolean {
  if (!filePath) return false;
  let at = line.indexOf(filePath);
  while (at !== -1) {
    // `:12:3` (most compilers), `:12` , `(12,3)` (dotnet), `: detail` (stub).
    if (/^[:(](?:\d|\s|$)/.test(line.slice(at + filePath.length))) return true;
    at = line.indexOf(filePath, at + 1);
  }
  return false;
}

/**
 * Attribute the gates' failures to the files they name.
 *
 * Attribution reuses the repair loop's own matcher (`groupGateErrorsByFile`),
 * so the file the reviewer is handed is the file the repair loop would have
 * repaired — one derivation of "which file is this error about", not two.
 *
 * A failing gate whose output names NO file still flags every file of that
 * language: a Go module-path error (`malformed import path "a 3d chess game"`)
 * or a project-level "no entry point" is a whole-language failure with no
 * file in the message, and dropping it would silently review nothing on a
 * build that does not compile.
 */
export function collectGateFlaggedFiles(
  staged: StagedGateFile[],
  languageGates: LanguageGate[],
  stubFailures: string[],
): GateFlaggedFile[] {
  const byPath = new Map<string, string[]>();
  const append = (path: string, reasons: string[]) => {
    const list = byPath.get(path) || [];
    list.push(...reasons);
    byPath.set(path, list);
  };

  for (const [path, lines] of groupGateErrorsByFile(languageGates, staged)) {
    const named = lines.filter((line) => lineNamesFile(line, path));
    if (named.length > 0) append(path, named);
  }
  for (const [path, reasons] of groupStubFailuresByFile(stubFailures, staged)) {
    append(path, reasons);
  }

  for (const gate of languageGates) {
    if (gate.clean || PSEUDO_GATE_LANGUAGES.has(gate.language)) continue;
    const own = staged.filter((s) => resolveGateLanguage(s.language, s.path) === gate.language);
    if (own.length === 0) continue;
    // Only when NOTHING of this language was attributed: one unattributed
    // failure must not drag in the language's files that named themselves.
    if (own.some((s) => byPath.has(s.path))) continue;
    for (const s of own) {
      append(s.path, [`${gate.language} gate failed (no file named): ${gate.errors[0] ?? 'see gate output'}`]);
    }
  }

  // Kept in the caller's file order so the review scope is stable to assert on.
  return staged
    .filter((s) => byPath.has(s.path))
    .map((s) => ({
      nodeId: s.nodeId,
      fileName: s.fileName,
      nodeLabel: s.nodeLabel,
      language: s.language,
      reasons: byPath.get(s.path)!,
    }));
}

// ─── Running the reviewer over that scope ──────────────────────────────────

/**
 * Kill switch for packaged/offline deployments, mirroring
 * `VACA_SKIP_RUNTIME_SMOKE`: without a reachable local model the reviewer can
 * only add latency.
 */
export function isGateScopedReviewEnabled(): boolean {
  const v = process.env.VACA_SKIP_CODE_REVIEW;
  return v !== '1' && v !== 'true';
}

/** A generated file, as the generation result reports it. */
export interface ReviewableGeneratedFile {
  fileName: string;
  code: string;
  nodeId: string;
  nodeLabel: string;
  language: string;
}

export interface GateScopedReviewOptions {
  /** The gate verdicts from the generation result. */
  languageGates: LanguageGate[];
  /** The flagged files from the generation result (`gateFlaggedFiles`). */
  flaggedFiles: GateFlaggedFile[];
  /** The generated files themselves (source of the code to review). */
  files: ReviewableGeneratedFile[];
  projectName: string;
  appGoal?: string;
  /** Overrides the scoped defaults below. */
  config?: Partial<BatchConfig>;
}

export interface GateScopedReviewOutcome {
  /** The review, or null when the reviewer did not run. */
  review: CodeReviewResult | null;
  /** Why no review was produced (null when one was). */
  skipped: string | null;
  /** Bare file names the review covered — the contract callers assert on. */
  reviewedFiles: string[];
}

/**
 * A scoped review is a handful of files that all failed the SAME gate, so the
 * defaults differ from the full-project ones: two concurrent reviews, and the
 * cross-file LLM dedup pass off (it costs a call and would dedup findings
 * across unrelated files).
 */
const SCOPED_DEFAULTS: Partial<BatchConfig> = {
  concurrency: 2,
  enableLlmDedup: false,
};

/**
 * Review the gate-flagged files of a non-TS build. Never throws: a reviewer
 * failure is reported as `skipped` (with `review: null`) so it can never fail
 * a generation request.
 */
export async function reviewGateFlaggedNonTsBuild(
  opts: GateScopedReviewOptions,
): Promise<GateScopedReviewOutcome> {
  if (!isGateScopedReviewEnabled()) {
    return { review: null, skipped: 'disabled via VACA_SKIP_CODE_REVIEW', reviewedFiles: [] };
  }

  if (!isNonTsGateBuild(opts.languageGates)) {
    return {
      review: null,
      skipped: 'no non-TS language gate ran — TS/JS builds keep the static CodeScanner alone',
      reviewedFiles: [],
    };
  }

  if (opts.flaggedFiles.length === 0) {
    return {
      review: null,
      skipped: 'the non-TS gates passed — no gate-flagged file to review',
      reviewedFiles: [],
    };
  }

  // Only files the gate flagged AND the generator still has code for.
  const targets: ReviewableFile[] = toReviewableFiles(
    opts.flaggedFiles
      .map((flagged) =>
        opts.files.find((f) => f.nodeId === flagged.nodeId || f.fileName === flagged.fileName),
      )
      .filter((f): f is ReviewableGeneratedFile => !!f),
  );

  if (targets.length === 0) {
    return {
      review: null,
      skipped: 'gate-flagged files were not present in the generated file set',
      reviewedFiles: [],
    };
  }

  const reviewedFiles = targets.map((t) => t.fileName);
  try {
    const review = await codeReviewer.reviewAll(
      targets,
      { projectName: opts.projectName, appGoal: opts.appGoal },
      { ...SCOPED_DEFAULTS, ...opts.config },
    );
    return { review, skipped: null, reviewedFiles };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[gateScopedReview] reviewer failed (non-fatal): ${msg}`);
    return { review: null, skipped: `reviewer failed: ${msg}`, reviewedFiles };
  }
}
