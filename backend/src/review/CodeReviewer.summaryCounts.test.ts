/**
 * Severity counts must not under-report the findings the review itself shows.
 *
 * DEDUP_TASK asks the model to "keep the HIGHEST severity comment" per group of
 * duplicates, but the keep-set is the MODEL's answer and nothing reconciles it
 * with the per-file findings. Measured live on a real Go export: the dedup pass
 * merged away a `critical` missing-import finding, so the result reported
 * `criticalCount: 0` while `perFile` still displayed that critical and scored
 * the file `fail` — and the build's `summary.reviewCritical` (which the
 * generation route now reports) read 0.
 *
 * The contract test: `comments` stays the deduplicated list, the summary counts
 * every finding in `perFile`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const LLM = vi.hoisted(() => ({ reviewPayload: {} as Record<string, any> }));

vi.mock('../ai/translator.js', () => {
  class AITranslator {
    async reason(prompt: string): Promise<string> {
      if (prompt.includes('deduplication assistant')) {
        // The model keeps ONLY the first (lowest-severity) comment.
        return '{"keep":[0]}';
      }
      const name = /- \*\*File\*\*: (\S+)/.exec(prompt)?.[1] || '';
      return JSON.stringify(LLM.reviewPayload[name] ?? { comments: [], summary: 'nothing' });
    }
  }
  return { AITranslator, askOtherLlm: async () => '', askConductor: async () => '', classifyCodeComplexity: () => 'simple', ModelTier: {} };
});

import { codeReviewer } from './CodeReviewer.js';

function comment(content: string, severity: string) {
  return { content, severity, category: 'bug', startLine: 1, endLine: 1 };
}

describe('CodeReviewResult.summary vs the deduplicated comment list', () => {
  beforeEach(() => {
    LLM.reviewPayload = {
      'formatter.go': { comments: [comment('strings is used but not imported', 'critical')], summary: 'missing import' },
      'parser.go': {
        comments: [
          comment('style: prefer := over var', 'low'),
          comment('naming could be clearer', 'info'),
          comment('consider a doc comment', 'low'),
        ],
        summary: 'minor style notes',
      },
    };
  });

  it('counts every finding, even one the dedup pass merged away', async () => {
    const review = await codeReviewer.reviewAll(
      [
        { fileName: 'formatter.go', code: 'package main', nodeId: 'n1', nodeLabel: 'Formatter', language: 'go' },
        { fileName: 'parser.go', code: 'package main', nodeId: 'n2', nodeLabel: 'Parser', language: 'go' },
      ],
      { projectName: 'csv2json' },
      { enablePlan: false },
    );

    // The flat list is deduplicated (the model kept one comment)...
    expect(review.comments).toHaveLength(1);
    // ...but the severity counts describe all four findings the review found,
    // including the critical the model merged away.
    expect(review.summary.totalComments).toBe(4);
    expect(review.summary.criticalCount).toBe(1);
    expect(review.summary.lowCount).toBe(2);
    expect(review.summary.infoCount).toBe(1);
    expect(review.perFile.flatMap((pf) => pf.comments)).toHaveLength(4);
  });
});
