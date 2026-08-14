/**
 * CodeReviewer — AI-powered code review for generated code.
 *
 * Implements the OpenCodeReview scan methodology:
 *   1. PLAN_TASK — Per-file pre-scan to identify focus areas
 *   2. MAIN_TASK — Review each file with plan as context
 *   3. DEDUP_TASK — LLM-based comment deduplication across files
 *   4. SUMMARY_TASK — Aggregate results with stats
 *
 * Also supports:
 *   - Batch strategy: group files by language for focused reviews
 *   - Concurrency: process files in parallel with configurable pool
 *   - Token budgeting: track and cap total LLM usage
 *   - Auto-fix: feed critical/high review findings into error correction
 *
 * Uses VACA's existing AITranslator (the same LLM used for generation),
 * so no additional LLM configuration is needed.
 */

import { AITranslator } from '../ai/translator.js';
import { runErrorCorrection } from '../sandbox/errorCorrection.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ReviewComment {
  /** File path relative to project root */
  path: string;
  /** The review comment text describing the issue */
  content: string;
  /** Severity level */
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  /** Category of the issue */
  category: 'bug' | 'security' | 'performance' | 'maintainability' | 'style' | 'documentation' | 'best-practice';
  /** Start line in the file (0 if not applicable) */
  startLine: number;
  /** End line in the file (0 if not applicable) */
  endLine: number;
  /** Optional suggestion code */
  suggestionCode?: string;
  /** Optional existing code snippet for context */
  existingCode?: string;
  /** Node ID that generated this file */
  nodeId?: string;
  /** Node label */
  nodeLabel?: string;
}

export interface CodeReviewResult {
  /** All review comments across all files */
  comments: ReviewComment[];
  /** Summary stats */
  summary: {
    filesReviewed: number;
    totalComments: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    infoCount: number;
  };
  /** Per-file review results */
  perFile: PerFileReview[];
  /** Whether the review completed successfully */
  success: boolean;
  /** Error message if review failed */
  error?: string;
  /** Token usage tracking */
  tokenBudget?: {
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
    estimatedTotalTokens: number;
    maxBudget: number;
  };
}

export interface PerFileReview {
  fileName: string;
  nodeLabel: string;
  nodeId: string;
  comments: ReviewComment[];
  score: 'pass' | 'warning' | 'fail';
  summary: string;
}

export interface ReviewableFile {
  fileName: string;
  code: string;
  nodeId: string;
  nodeLabel: string;
  language: string;
}

/** Per-file focus area produced by the PLAN_TASK pre-pass */
interface ReviewPlan {
  fileName: string;
  focusAreas: string[];
  estimatedComplexity: 'low' | 'medium' | 'high';
}

/** Batch configuration for review strategies */
export interface BatchConfig {
  /** How to batch files: all-together, by-language, or no batching */
  strategy: 'all' | 'by-language' | 'none';
  /** Max concurrent file reviews */
  concurrency: number;
  /** Max estimated total tokens before stopping (0 = unlimited) */
  maxTokensBudget: number;
  /** Whether to run the PLAN_TASK pre-pass */
  enablePlan: boolean;
  /** Whether to run LLM-based DEDUP_TASK (vs simple hash dedup) */
  enableLlmDedup: boolean;
}

export const DEFAULT_BATCH_CONFIG: BatchConfig = {
  strategy: 'by-language',
  concurrency: 4,
  maxTokensBudget: 100_000,
  enablePlan: true,
  enableLlmDedup: true,
};

/** Result of the review+fix pipeline */
export interface ReviewAndFixResult {
  review: CodeReviewResult;
  fixes: Array<{
    fileName: string;
    nodeLabel: string;
    originalCode: string;
    fixedCode: string;
    fixAttempts: number;
    success: boolean;
  }>;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const MAX_RETRIES = 2;
const PLAN_MAX_TOKENS = 512;
const REVIEW_MAX_TOKENS = 2048;
const DEDUP_MAX_TOKENS = 1024;
const ESTIMATED_CHARS_PER_TOKEN = 4;

// ─── Helper: Async concurrency pool ────────────────────────────────────────

/**
 * Process items with a concurrency-limited async pool.
 * Ensures at most `concurrency` tasks run simultaneously.
 */
async function asyncPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ─── Main Class ────────────────────────────────────────────────────────────

export class CodeReviewer {
  private ai: AITranslator;
  private tokenBudgetUsed: number = 0;
  private tokenBudgetCap: number = 0;

  constructor() {
    this.ai = new AITranslator();
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Public API
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Review all generated files with the full OpenCodeReview pipeline:
   * PLAN_TASK → MAIN_TASK (batched + concurrent) → DEDUP_TASK → SUMMARY.
   *
   * This is the enhanced version that replaces the simple sequential loop.
   */
  async reviewAll(
    files: ReviewableFile[],
    projectContext: {
      projectName: string;
      appGoal?: string;
      targetOS?: string;
    },
    config?: Partial<BatchConfig>,
  ): Promise<CodeReviewResult> {
    if (files.length === 0) {
      return this.emptyResult();
    }

    const cfg: BatchConfig = { ...DEFAULT_BATCH_CONFIG, ...config };
    this.tokenBudgetUsed = 0;
    this.tokenBudgetCap = cfg.maxTokensBudget;

    // ── Phase 0: Batch files by language ──
    const batches = this.batchByLanguage(files, cfg.strategy);

    // ── Phase 1: PLAN_TASK — Identify focus areas per file ──
    const plans = cfg.enablePlan
      ? await this.runPlanPhase(files, projectContext, cfg)
      : new Map<string, ReviewPlan>();

    // ── Phase 2: MAIN_TASK — Review each batch with concurrency ──
    const perFile: PerFileReview[] = [];
    const allComments: ReviewComment[] = [];

    for (const [batchLabel, batchFiles] of batches) {
      if (this.isOverBudget()) {
        console.warn(`[CodeReviewer] Token budget exceeded — stopping batch "${batchLabel}"`);
        break;
      }

      const batchResults = await this.reviewBatch(
        batchFiles,
        projectContext,
        plans,
        cfg,
      );

      for (const result of batchResults) {
        perFile.push(result);
        allComments.push(...result.comments);
      }
    }

    // ── Phase 3: DEDUP_TASK — Deduplicate similar comments ──
    let dedupedComments: ReviewComment[];
    if (cfg.enableLlmDedup && allComments.length > 3) {
      dedupedComments = await this.deduplicateWithLLM(allComments);
    } else {
      dedupedComments = this.deduplicateSimple(allComments);
    }

    // ── Phase 4: SUMMARY — Aggregate results ──
    return this.buildResult(files.length, dedupedComments, perFile);
  }

  /**
   * Review files AND auto-fix critical/high issues found.
   * This connects the CodeReviewer output into the error-correction fix loop.
   *
   * Flow:
   *   1. Run reviewAll (with PLAN_TASK + concurrency)
   *   2. If critical/high comments found, extract the affected files
   *   3. Feed review comments + code into errorCorrection for each file
   *   4. Return review results + fix results
   */
  async reviewAndFix(
    files: ReviewableFile[],
    projectContext: {
      projectName: string;
      appGoal?: string;
      targetOS?: string;
    },
    reviewerConfig?: Partial<BatchConfig>,
    fixConfig?: {
      maxFixAttempts?: number;
      minSeverity?: 'critical' | 'high';
    },
  ): Promise<ReviewAndFixResult> {
    // Step 1: Run the full review pipeline
    const review = await this.reviewAll(files, projectContext, reviewerConfig);

    // Step 2-3: Fix critical/high findings via the shared fix loop.
    const fixes = await this.fixFromReview(files, review, projectContext, fixConfig);
    return { review, fixes };
  }

  /**
   * Run the auto-fix loop over an existing review result.
   *
   * Extracted from reviewAndFix so external review engines (e.g. the real
   * ocr CLI) can feed their own findings through the same error-correction
   * loop: files with critical (or high, when configured) comments are
   * regenerated via runErrorCorrection with the review comments as context.
   */
  async fixFromReview(
    files: ReviewableFile[],
    review: CodeReviewResult,
    projectContext: {
      projectName: string;
      appGoal?: string;
      targetOS?: string;
    },
    fixConfig?: {
      maxFixAttempts?: number;
      minSeverity?: 'critical' | 'high';
    },
  ): Promise<ReviewAndFixResult['fixes']> {
    // Find files with critical/high comments that need fixing
    const minSeverity = fixConfig?.minSeverity || 'critical';
    const fixableSeverities = new Set<string>(['critical']);
    if (minSeverity === 'high') fixableSeverities.add('high');

    const filesNeedingFix = new Map<string, { file: ReviewableFile; comments: ReviewComment[] }>();

    for (const pf of review.perFile) {
      const criticalComments = pf.comments.filter(c => fixableSeverities.has(c.severity));
      if (criticalComments.length === 0) continue;

      const file = files.find(f => f.fileName === pf.fileName);
      if (file) {
        filesNeedingFix.set(pf.fileName, { file, comments: criticalComments });
      }
    }

    if (filesNeedingFix.size === 0) {
      return [];
    }

    // Feed review comments + code into error correction for each file
    const maxAttempts = fixConfig?.maxFixAttempts || 3;
    const fixes: ReviewAndFixResult['fixes'] = [];

    for (const [fileName, { file, comments }] of filesNeedingFix) {
      // Build a fix prompt from the review comments
      const reviewSummary = comments
        .map(c => `[${c.severity.toUpperCase()}] ${c.content}`)
        .join('\n');

      // Use errorCorrection with the review comments as part of the context
      try {
        const fixResult = await runErrorCorrection({
          code: file.code,
          language: file.language,
          projectName: projectContext.projectName,
          goal: projectContext.appGoal || file.nodeLabel,
          maxAttempts,
          reviewComments: reviewSummary,
          reviewSeverity: minSeverity,
        });

        fixes.push({
          fileName: file.fileName,
          nodeLabel: file.nodeLabel,
          originalCode: file.code,
          fixedCode: fixResult.finalCode,
          fixAttempts: fixResult.attempts.length,
          success: fixResult.success,
        });

        if (fixResult.success) {
          console.log(`[CodeReviewer] ✅ Auto-fixed ${fileName} (${fixResult.attempts.length} attempts)`);
        } else {
          console.warn(`[CodeReviewer] ❌ Could not auto-fix ${fileName} after ${fixResult.attempts.length} attempts`);
        }
      } catch (err: any) {
        console.warn(`[CodeReviewer] Fix error for ${fileName}: ${err.message}`);
        fixes.push({
          fileName: file.fileName,
          nodeLabel: file.nodeLabel,
          originalCode: file.code,
          fixedCode: file.code,
          fixAttempts: 0,
          success: false,
        });
      }
    }

    return fixes;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Phase 0: Batch Strategy
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Group files into batches based on the configured strategy.
   */
  private batchByLanguage(
    files: ReviewableFile[],
    strategy: BatchConfig['strategy'],
  ): Map<string, ReviewableFile[]> {
    const batches = new Map<string, ReviewableFile[]>();

    if (strategy === 'all') {
      batches.set('all', [...files]);
      return batches;
    }

    for (const file of files) {
      const lang = file.language || 'typescript';
      const existing = batches.get(lang) || [];
      existing.push(file);
      batches.set(lang, existing);
    }

    return batches;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Phase 1: PLAN_TASK
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Run the PLAN_TASK pre-pass for all files.
   * For each file, does a lightweight LLM call to identify focus areas.
   * Runs concurrently (pool-based).
   */
  private async runPlanPhase(
    files: ReviewableFile[],
    projectContext: { projectName: string; appGoal?: string; targetOS?: string },
    config: BatchConfig,
  ): Promise<Map<string, ReviewPlan>> {
    const plans = new Map<string, ReviewPlan>();

    const planResults = await asyncPool(files, config.concurrency, async (file) => {
      if (this.isOverBudget()) return null;

      try {
        const plan = await this.planFile(file, projectContext);
        this.trackTokens(file, PLAN_MAX_TOKENS);
        return plan;
      } catch (err) {
        console.warn(`[CodeReviewer] PLAN_TASK failed for ${file.fileName}:`, err);
        return null;
      }
    });

    for (const plan of planResults) {
      if (plan) plans.set(plan.fileName, plan);
    }

    console.log(`[CodeReviewer] PLAN_TASK complete: ${plans.size}/${files.length} files planned`);
    return plans;
  }

  /**
   * PLAN_TASK: Lightweight LLM pre-scan to identify focus areas for a file.
   * Returns what to look for during the main review.
   */
  private async planFile(
    file: ReviewableFile,
    projectContext: { projectName: string; appGoal?: string; targetOS?: string },
  ): Promise<ReviewPlan> {
    const language = file.language || 'typescript';
    const maxCodeChars = 3000; // PLAN_TASK uses truncated code (just the structure)
    const truncatedCode = file.code.length > maxCodeChars
      ? file.code.substring(0, maxCodeChars) + '\n\n// ... truncated'
      : file.code;

    const goal = projectContext.appGoal ? ` (goal: ${projectContext.appGoal})` : '';

    const prompt = [
      `You are a code review planner. Quick-scan the following ${language} file from project "${projectContext.projectName}"${goal}.`,
      '',
      `## File: ${file.fileName}`,
      '## Node: ' + file.nodeLabel,
      '',
      'Your task: Identify 1-3 focus areas that the main review should pay attention to.',
      'Be specific about what patterns to check (e.g., "error handling for async operations", "SQL injection in raw queries").',
      '',
      'Return ONLY a JSON object with this structure (no markdown, no backticks):',
      '{',
      '  "focusAreas": ["area 1", "area 2", "area 3"],',
      '  "estimatedComplexity": "low|medium|high"',
      '}',
      '',
      '## Code to Scan:',
      '```',
      truncatedCode,
      '```',
    ].join('\n');

    const response = await this.ai.reason(prompt, undefined, { maxTokens: PLAN_MAX_TOKENS });
    const parsed = this.parsePlanResponse(response);

    return {
      fileName: file.fileName,
      focusAreas: parsed.focusAreas.length > 0 ? parsed.focusAreas : ['General code quality'],
      estimatedComplexity: parsed.estimatedComplexity || 'medium',
    };
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Phase 2: MAIN_TASK (Batch Review)
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Review a batch of files concurrently using the concurrency pool.
   */
  private async reviewBatch(
    files: ReviewableFile[],
    projectContext: { projectName: string; appGoal?: string; targetOS?: string },
    plans: Map<string, ReviewPlan>,
    config: BatchConfig,
  ): Promise<PerFileReview[]> {
    return asyncPool(files, config.concurrency, async (file) => {
      if (this.isOverBudget()) {
        return {
          fileName: file.fileName,
          nodeLabel: file.nodeLabel,
          nodeId: file.nodeId,
          comments: [],
          score: 'warning' as const,
          summary: 'Review skipped — token budget exceeded',
        };
      }

      const plan = plans.get(file.fileName);
      return this.reviewFileWithPlan(file, projectContext, plan);
    });
  }

  /**
   * Review a single file with optional PLAN_TASK context.
   * Uses retry logic for JSON parse failures.
   */
  private async reviewFileWithPlan(
    file: ReviewableFile,
    projectContext: { projectName: string; appGoal?: string; targetOS?: string },
    plan?: ReviewPlan,
  ): Promise<PerFileReview> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const isRetry = attempt > 0;
        const prompt = this.buildReviewPrompt(file, projectContext, isRetry, plan);
        const response = await this.ai.reason(prompt, undefined, { maxTokens: REVIEW_MAX_TOKENS });
        this.trackTokens(file, REVIEW_MAX_TOKENS);

        const parsed = this.parseReviewResponse(response);

        if (parsed.parseError) {
          throw new Error(parsed.parseError);
        }

        const hasCritical = parsed.comments.some(c => c.severity === 'critical');
        const hasHigh = parsed.comments.some(c => c.severity === 'high');

        const score: 'pass' | 'warning' | 'fail' = hasCritical
          ? 'fail'
          : hasHigh
            ? 'warning'
            : 'pass';

        return {
          fileName: file.fileName,
          nodeLabel: file.nodeLabel,
          nodeId: file.nodeId,
          comments: parsed.comments.map(c => ({
            ...c,
            path: file.fileName,
            nodeId: file.nodeId,
            nodeLabel: file.nodeLabel,
          })),
          score,
          summary: parsed.summary || `${parsed.comments.length} issue(s) found`,
        };
      } catch (err) {
        const isLastAttempt = attempt === MAX_RETRIES;
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        console.warn(`[CodeReviewer] Review attempt ${attempt + 1}/${MAX_RETRIES + 1} failed for ${file.fileName}: ${errMsg}`);
        if (isLastAttempt) {
          return {
            fileName: file.fileName,
            nodeLabel: file.nodeLabel,
            nodeId: file.nodeId,
            comments: [],
            score: 'warning',
            summary: `Review failed after ${attempt + 1} attempts: ${errMsg}`,
          };
        }
      }
    }
    throw new Error('reviewFile: exhausted retries without returning');
  }

  /**
   * Build the review prompt with optional PLAN_TASK context included.
   */
  private buildReviewPrompt(
    file: ReviewableFile,
    projectContext: { projectName: string; appGoal?: string; targetOS?: string },
    isRetry: boolean,
    plan?: ReviewPlan,
  ): string {
    const language = file.language || 'typescript';
    const maxCodeChars = 8000;
    const truncatedCode = file.code.length > maxCodeChars
      ? file.code.substring(0, maxCodeChars) +
        '\n\n// ... [' + (file.code.length - maxCodeChars) + ' more chars truncated]'
      : file.code;

    const strictJsonInstruction = isRetry
      ? '\n\nYOUR PREVIOUS RESPONSE WAS NOT VALID JSON. This time, output ONLY a raw JSON object, no markdown, no code fences, no backticks, no explanations. Every string must use double quotes. No trailing commas.'
      : '\n\nIMPORTANT: Return ONLY raw JSON. No markdown, no backticks, no code fences, no explanations before or after.';

    const goal = projectContext.appGoal
      ? ' (goal: ' + projectContext.appGoal + ')'
      : '';

    // ── Include PLAN_TASK focus areas if available ──
    const planSection = plan && plan.focusAreas.length > 0
      ? [
          '',
          '## Pre-Scan Focus Areas',
          'A pre-scan identified the following areas that deserve extra attention in this file:',
          ...plan.focusAreas.map((a: string) => `- ${a}`),
          plan.estimatedComplexity === 'high' ? '- ⚠️ This file was rated HIGH complexity — be particularly thorough.' : '',
          '',
        ].filter(Boolean).join('\n')
      : '';

    const lines: string[] = [];
    lines.push('You are an expert ' + language + ' code reviewer. Review the following source file from project "' + projectContext.projectName + '"' + goal + '.');
    lines.push('');
    lines.push('## File Info');
    lines.push('- **File**: ' + file.fileName);
    lines.push('- **Language**: ' + language);
    lines.push('- **Node**: ' + file.nodeLabel);
    lines.push(planSection);
    lines.push('## Instructions');
    lines.push('Check the code against these SPECIFIC patterns. Each pattern lists exact code signatures to look for:');
    lines.push('');
    lines.push('### SECURITY - Hardcoded Credentials & Secrets');
    lines.push('FLAG ALL of the following as HIGH or CRITICAL severity:');
    lines.push('- Hardcoded API keys: look for patterns like `API_KEY = "..."`, `apiKey: "..."`, `apikey="..."`');
    lines.push('- Secret tokens: `sk-...`, `pk-...`, `token`, `secret`, `password`, `passwd`, `pwd` assigned as string literals');
    lines.push('- Database connection strings with embedded credentials: `postgres://user:pass@...`');
    lines.push('- Private keys: `-----BEGIN RSA PRIVATE KEY-----`, `-----BEGIN EC PRIVATE KEY-----`');
    lines.push('- OAuth tokens, JWTs, session secrets hardcoded as string literals');
    lines.push('- AWS/cloud access keys: patterns like `AKIA...`, `aws_access_key_id`');
    lines.push('');
    lines.push('### MAINTAINABILITY - Debug Artifacts & Dead Code');
    lines.push('FLAG ALL of the following as MEDIUM or HIGH severity:');
    lines.push('- `console.log()` calls that appear to be debug logging (messages like "DEBUG", "debug", "log" with variable dumps)');
    lines.push('- `console.trace()`, `console.debug()`, `console.dir()` calls in production code');
    lines.push('- Commented-out code blocks (especially entire functions or large sections)');
    lines.push('- Unused functions, variables, or imports (functions that are defined but never called/referenced)');
    lines.push('- TODO/FIXME/HACK comments that indicate incomplete work');
    lines.push('');
    lines.push('### BUGS - Logic Errors & Crashes');
    lines.push('- Null/undefined dereferences: accessing properties without optional chaining or null checks');
    lines.push('- Off-by-one errors in array/string access or loop bounds');
    lines.push('- Missing error handling: async operations without try/catch or .catch()');
    lines.push('- Race conditions, promise chains without error propagation');
    lines.push('');
    lines.push('### PERFORMANCE - Inefficient Patterns');
    lines.push('- Nested loops (O(n²)+ complexity) that could use Map/Set lookups');
    lines.push('- Unnecessary object/array copies in hot paths');
    lines.push('- Memory leaks: event listeners not removed, closures holding large references');
    lines.push('');
    lines.push('### BEST PRACTICES');
    lines.push('- Non-idiomatic patterns for ' + language + ' (e.g., not using language-specific features)');
    lines.push('- Missing type annotations, `any` types where specific types are possible');
    lines.push('- Hardcoded magic numbers/strings that should be constants');
    lines.push('');
    lines.push('## Code to Review');
    lines.push('```');
    lines.push(truncatedCode);
    lines.push('```');
    lines.push('');
    lines.push('## Output Format');
    lines.push('Return your review as a JSON object with exactly this structure:');
    lines.push('');
    lines.push('{');
    lines.push('  "summary": "One-line summary of the files code quality",');
    lines.push('  "comments": [');
    lines.push('    {');
    lines.push('      "content": "Describe the issue clearly",');
    lines.push('      "severity": "critical|high|medium|low|info",');
    lines.push('      "category": "bug|security|performance|maintainability|style|documentation|best-practice",');
    lines.push('      "startLine": 42,');
    lines.push('      "endLine": 45,');
    lines.push('      "suggestionCode": "Optional fix suggestion",');
    lines.push('      "existingCode": "Optional problematic code snippet"');
    lines.push('    }');
    lines.push('  ]');
    lines.push('}');
    lines.push('');
    lines.push('Severity guidelines:');
    lines.push('- **critical**: Will definitely cause a crash, data loss, or security breach');
    lines.push('- **high**: Likely to cause issues in production, needs attention');
    lines.push('- **medium**: Potential issue, context-dependent, or improvement suggestion');
    lines.push('- **low**: Minor concern, style preference, nitpick');
    lines.push('- **info**: Observation, documentation suggestion');
    lines.push('');
    lines.push('CRITICAL RULES:');
    lines.push('- Output ONLY valid JSON - no markdown, no backticks, no code fences');
    lines.push('- Use double quotes for ALL strings');
    lines.push('- NO trailing commas after the last array element or object property');
    lines.push('- NO comments inside the JSON');
    lines.push('- Start and end with curly braces');
    lines.push('- If you find no issues, return {"summary":"Code looks clean","comments":[]}');
    lines.push(strictJsonInstruction);

    return lines.join('\n');
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Phase 3: DEDUP_TASK
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * LLM-based deduplication: groups similar comments across files.
   * Takes all comments and asks the LLM to merge duplicates.
   * Only runs when there are enough comments to make it worthwhile.
   */
  private async deduplicateWithLLM(comments: ReviewComment[]): Promise<ReviewComment[]> {
    if (comments.length <= 3) return comments;

    try {
      // Group comments by their content prefix for the LLM to analyze
      const commentSummary = comments.map((c, i) =>
        `[${i}] ${c.path}:${c.startLine}-${c.endLine} [${c.severity}] ${c.content.substring(0, 200)}`
      ).join('\n');

      const prompt = [
        'You are a code review deduplication assistant. I have review comments from multiple files.',
        'Group together comments that describe the SAME issue (same root cause, different file).',
        '',
        'For each group, keep the HIGHEST severity comment and discard/subsume the rest.',
        'Return your answer as a JSON object with this exact structure (no markdown, no backticks):',
        '{"keep": [1, 3]}',
        '',
        'Example: for 5 comments where indices 0,2,4 are duplicates of 1 and 3, return:',
        '{"keep": [1, 3]}',
        '',
        'CRITICAL: You MUST return an object with a "keep" array, NOT a bare array.',
        'Comments:',
        commentSummary,
      ].join('\n');

      const response = await this.ai.reason(prompt, undefined, { maxTokens: DEDUP_MAX_TOKENS });
      this.trackTokenEstimate(DEDUP_MAX_TOKENS);

      const parsed = this.parseDedupResponse(response);

      // Guard: if keep array is empty or parsing failed, fall back to simple dedup
      if (!parsed.keep || parsed.keep.length === 0) {
        console.warn('[CodeReviewer] DEDUP_TASK returned empty keep list — falling back to simple dedup');
        return this.deduplicateSimple(comments);
      }

      const keepSet = new Set(parsed.keep);
      const deduped = comments.filter((_, i) => keepSet.has(i));

      // Guard: ensure we don't lose ALL comments due to malformed LLM response
      if (deduped.length === 0) {
        console.warn('[CodeReviewer] DEDUP_TASK would have dropped all comments — falling back to simple dedup');
        return this.deduplicateSimple(comments);
      }

      console.log(`[CodeReviewer] DEDUP_TASK: ${comments.length} → ${deduped.length} comments (${comments.length - deduped.length} merged)`);
      return deduped;
    } catch (err) {
      console.warn('[CodeReviewer] DEDUP_TASK failed, falling back to simple dedup:', err);
    }

    return this.deduplicateSimple(comments);
  }

  /**
   * Simple hash-based deduplication (fallback when LLM dedup fails or is disabled).
   */
  private deduplicateSimple(comments: ReviewComment[]): ReviewComment[] {
    const seen = new Set<string>();
    const deduped: ReviewComment[] = [];

    for (const comment of comments) {
      const key = `${comment.path}:${comment.content.substring(0, 80)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(comment);
    }

    return deduped;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Token Budget Tracking
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Estimate token usage for a file and track it against the budget.
   */
  private trackTokens(file: ReviewableFile, outputTokens: number): void {
    const inputTokens = Math.ceil(file.code.length / ESTIMATED_CHARS_PER_TOKEN) + 500; // prompt overhead
    this.tokenBudgetUsed += inputTokens + outputTokens;
  }

  /**
   * Track token usage for non-file operations (like plan/dedup prompts).
   */
  private trackTokenEstimate(tokens: number): void {
    this.tokenBudgetUsed += tokens;
  }

  /**
   * Check if we've exceeded the token budget.
   */
  private isOverBudget(): boolean {
    return this.tokenBudgetCap > 0 && this.tokenBudgetUsed >= this.tokenBudgetCap;
  }

  /**
   * Get the token budget remaining.
   */
  private budgetRemaining(): number {
    return Math.max(0, this.tokenBudgetCap - this.tokenBudgetUsed);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Response Parsers
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Parse the PLAN_TASK response into focus areas.
   */
  private parsePlanResponse(response: string): { focusAreas: string[]; estimatedComplexity?: 'low' | 'medium' | 'high' } {
    const json = this.extractJSON(response);
    if (!json) return { focusAreas: [] };

    try {
      const parsed = JSON.parse(json);
      return {
        focusAreas: Array.isArray(parsed.focusAreas) ? parsed.focusAreas : [],
        estimatedComplexity: ['low', 'medium', 'high'].includes(parsed.estimatedComplexity)
          ? parsed.estimatedComplexity
          : 'medium',
      };
    } catch {
      return { focusAreas: [] };
    }
  }

  /**
   * Parse the DEDUP_TASK response into the keep-array.
   */
  private parseDedupResponse(response: string): { keep: number[] } {
    const json = this.extractJSON(response);
    if (!json) return { keep: [] };

    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed.keep) && parsed.keep.every((i: any) => typeof i === 'number')) {
        return { keep: parsed.keep };
      }
    } catch {
      // fall through
    }

    return { keep: [] };
  }

  /**
   * Aggressively extract and normalize JSON from an LLM response.
   * Handles multiple common malformations.
   */
  private extractJSON(raw: string): string | null {
    let text = raw.trim();

    // Strategy 1: Try direct parse first (fast path)
    try {
      JSON.parse(text);
      return text;
    } catch {
      // Continue to fallbacks
    }

    // Strategy 2: Extract content between ```json ... ``` or ``` ... ```
    const jsonPatterns = [
      /```(?:json)\s*\n?([\s\S]*?)\n?```/i,
      /```\s*\n?([\s\S]*?)\n?```/,
    ];

    for (const pattern of jsonPatterns) {
      const match = text.match(pattern);
      if (match) {
        const candidate = match[1].trim();
        const parsed = this.tryParseJSON(candidate);
        if (parsed !== null) return parsed;
      }
    }

    // Strategy 3: Find the first { or [ and extract balanced JSON
    const braceStarts: number[] = [];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{' || text[i] === '[') braceStarts.push(i);
    }

    for (const startIdx of braceStarts) {
      const startChar = text[startIdx];
      const endChar = startChar === '{' ? '}' : ']';
      let depth = 0;
      let inString = false;
      let escape = false;

      for (let i = startIdx; i < text.length; i++) {
        const ch = text[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"' && !escape) { inString = !inString; continue; }
        if (inString) continue;

        if (ch === startChar) depth++;
        if (ch === endChar) {
          depth--;
          if (depth === 0) {
            const candidate = text.substring(startIdx, i + 1);
            const parsed = this.tryParseJSON(candidate);
            if (parsed !== null) return parsed;
            break;
          }
        }
      }
    }

    // Strategy 4: Remove all non-JSON text before first JSON char
    const firstBrace = text.indexOf('{');
    const firstBracket = text.indexOf('[');
    const firstJsonChar = firstBrace >= 0 && firstBracket >= 0
      ? Math.min(firstBrace, firstBracket)
      : Math.max(firstBrace, firstBracket);

    if (firstJsonChar > 0) {
      text = text.substring(firstJsonChar);
      const parsed = this.tryParseJSON(text);
      if (parsed !== null) return parsed;
    }

    return null;
  }

  /**
   * Try to parse a JSON string, applying common fixes.
   */
  private tryParseJSON(text: string): string | null {
    const fixes = [
      (s: string) => s,
      (s: string) => s.replace(/,([\s\n]*[}\]])/g, '$1'),
      (s: string) => s.replace(/'/g, '"'),
      (s: string) => s.replace(/'/g, '"').replace(/,([\s\n]*[}\]])/g, '$1'),
      (s: string) => s.replace(/\bundefined\b/g, '"undefined"')
        .replace(/\bNaN\b/g, '"NaN"')
        .replace(/,'/g, ',"'),
      (s: string) => s.replace(/[\x00-\x1f\x7f]/g, '')
        .replace(/\s+/g, ' ')
        .replace(/,([\s\n]*[}\]])/g, '$1'),
    ];

    for (const fix of fixes) {
      try {
        const fixed = fix(text);
        JSON.parse(fixed);
        return fixed;
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Parse the AI's JSON response into structured review comments.
   */
  private parseReviewResponse(response: string): {
    comments: Omit<ReviewComment, 'path' | 'nodeId' | 'nodeLabel'>[];
    summary: string;
    parseError?: string;
  } {
    const normalizedJson = this.extractJSON(response);

    if (!normalizedJson) {
      return {
        comments: [],
        summary: 'Review parse error — response was not valid JSON',
        parseError: 'Could not extract valid JSON from LLM response',
      };
    }

    try {
      const parsed = JSON.parse(normalizedJson);

      const comments = Array.isArray(parsed)
        ? parsed
        : parsed.comments || [];

      const summary = typeof parsed.summary === 'string'
        ? parsed.summary
        : `${comments.length} issue(s) found`;

      if (!Array.isArray(comments)) {
        return {
          comments: [],
          summary: 'Review parse error — comments field is not an array',
          parseError: `Expected comments to be an array, got ${typeof comments}`,
        };
      }

      return {
        comments: comments.map((c: any) => ({
          content: typeof c.content === 'string' ? c.content : 'Review comment',
          severity: (['critical', 'high', 'medium', 'low', 'info'] as const).includes(c.severity)
            ? c.severity
            : 'low',
          category: (['bug', 'security', 'performance', 'maintainability', 'style', 'documentation', 'best-practice'] as const).includes(c.category)
            ? c.category
            : 'maintainability',
          startLine: typeof c.startLine === 'number' ? c.startLine : 0,
          endLine: typeof c.endLine === 'number' ? c.endLine : 0,
          suggestionCode: typeof c.suggestionCode === 'string' ? c.suggestionCode : undefined,
          existingCode: typeof c.existingCode === 'string' ? c.existingCode : undefined,
        })),
        summary,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown parse error';
      console.warn(`[CodeReviewer] JSON parse error: ${errMsg}`);
      return {
        comments: [],
        summary: 'Review parse error',
        parseError: `JSON.parse failed: ${errMsg}`,
      };
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Results Builder
  // ═════════════════════════════════════════════════════════════════════════

  private emptyResult(): CodeReviewResult {
    return {
      comments: [],
      summary: { filesReviewed: 0, totalComments: 0, criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0, infoCount: 0 },
      perFile: [],
      success: true,
    };
  }

  private buildResult(
    totalFiles: number,
    comments: ReviewComment[],
    perFile: PerFileReview[],
  ): CodeReviewResult {
    const criticalCount = comments.filter(c => c.severity === 'critical').length;
    const highCount = comments.filter(c => c.severity === 'high').length;
    const mediumCount = comments.filter(c => c.severity === 'medium').length;
    const lowCount = comments.filter(c => c.severity === 'low').length;
    const infoCount = comments.filter(c => c.severity === 'info').length;

    return {
      comments,
      summary: { filesReviewed: totalFiles, totalComments: comments.length, criticalCount, highCount, mediumCount, lowCount, infoCount },
      perFile,
      success: true,
      tokenBudget: {
        estimatedInputTokens: Math.floor(this.tokenBudgetUsed * 0.7),
        estimatedOutputTokens: Math.floor(this.tokenBudgetUsed * 0.3),
        estimatedTotalTokens: this.tokenBudgetUsed,
        maxBudget: this.tokenBudgetCap,
      },
    };
  }
}

/** Singleton instance for reuse across the app */
export const codeReviewer = new CodeReviewer();

/** Wrap generated files into the reviewable format */
export function toReviewableFiles(
  generatedFiles: Array<{
    fileName: string;
    code: string;
    nodeId: string;
    nodeLabel: string;
    language: string;
  }>
): ReviewableFile[] {
  return generatedFiles
    .filter(f => f.code && f.code.length > 0)
    .map(f => ({
      fileName: f.fileName,
      code: f.code,
      nodeId: f.nodeId,
      nodeLabel: f.nodeLabel,
      language: f.language || 'typescript',
    }));
}
