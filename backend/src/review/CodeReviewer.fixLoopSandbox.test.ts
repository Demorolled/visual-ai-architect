/**
 * The reviewer's fix loop against the REAL sandbox.
 *
 * `CodeReviewer.fixFromReview` feeds review findings into
 * `sandbox/errorCorrection.runErrorCorrection`, which validates each attempt
 * with `runSandbox` — a SINGLE-FILE check (see `sandbox/dockerRunner.ts`
 * `LOCAL_TOOL_CHECK`). `CodeReviewer.fixFromReview.test.ts` covers the loop's
 * branching with that call mocked; this file covers what the real check does to
 * it, because the two answer different questions:
 *
 *   A/B/C — the loop still works: valid code is accepted with no model call, a
 *           broken file converges on one good fix, and non-convergence is
 *           reported as a failure rather than as a fix.
 *   D     — its measured blind spot: a CORRECT file that imports a sibling is
 *           rejected, because the check stages that one file into a temp module
 *           named `sandbox` where its siblings do not exist. Three model calls
 *           are spent and the caller is told the fix failed. This is why the
 *           gate-scoped post-generation review (review/gateScopedReview.ts) is
 *           review-only: wiring this loop in behind the gate would "fix"
 *           correct multi-file code. If the sandbox ever learns to stage the
 *           project, D flips and must be updated with it.
 *
 * The LLM is stubbed (deterministic); the toolchain, the fix loop and the
 * sandbox are real. Skipped when Go is not installed.
 */

import { describe, it, expect, vi } from 'vitest';
import { execSync } from 'node:child_process';

const LLM = vi.hoisted(() => ({ text: '', calls: 0 }));

vi.mock('../ai/translator.js', () => {
  class AITranslator {
    async reason(): Promise<string> {
      LLM.calls += 1;
      return LLM.text;
    }
  }
  return { AITranslator, askOtherLlm: async () => '', askConductor: async () => '', classifyCodeComplexity: () => 'simple', ModelTier: {} };
});

import { codeReviewer, type CodeReviewResult, type ReviewableFile } from './CodeReviewer.js';

function goInstalled(): boolean {
  try { execSync('go version', { stdio: 'ignore' }); return true; } catch { return false; }
}
const hasGo = goInstalled();

const CONTEXT = { projectName: 'csv2json', appGoal: 'convert a csv file to json' };

/** A review whose only finding is critical, so the fix branch always runs. */
function criticalReview(fileName: string): CodeReviewResult {
  return {
    success: true,
    comments: [],
    summary: { filesReviewed: 1, totalComments: 1, criticalCount: 1, highCount: 0, mediumCount: 0, lowCount: 0, infoCount: 0 },
    perFile: [{
      fileName,
      nodeLabel: fileName,
      nodeId: 'n1',
      score: 'fail',
      summary: 'one issue',
      comments: [{
        path: fileName,
        content: 'hand-rolled CSV parsing instead of encoding/csv',
        severity: 'critical',
        category: 'bug',
        startLine: 41,
        endLine: 41,
      }],
    }],
  };
}

function goFile(code: string): ReviewableFile {
  return { fileName: 'converter.go', language: 'go', nodeId: 'n1', nodeLabel: 'CSV Converter', code };
}

/** Missing the `encoding/csv` import — the `undefined: csv` class of failure. */
const BROKEN_GO = [
  'package main',
  '',
  'import "os"',
  '',
  'func main() {',
  '\tr := csv.NewReader(os.Stdin)',
  '\t_ = r',
  '}',
].join('\n');

const VALID_GO = [
  'package main',
  '',
  'import (',
  '\t"encoding/csv"',
  '\t"os"',
  ')',
  '',
  'func main() {',
  '\tr := csv.NewReader(os.Stdin)',
  '\t_ = r',
  '}',
].join('\n');

describe('fixFromReview → runErrorCorrection against the real sandbox', () => {
  it.skipIf(!hasGo)('accepts already-valid code without spending a model call', async () => {
    LLM.calls = 0;
    LLM.text = VALID_GO;
    const fixes = await codeReviewer.fixFromReview([goFile(VALID_GO)], criticalReview('converter.go'), CONTEXT);

    expect(fixes[0]).toMatchObject({ success: true, fixAttempts: 0 });
    expect(LLM.calls).toBe(0);
  });

  it.skipIf(!hasGo)('converges on one good fix for a broken file', async () => {
    LLM.calls = 0;
    LLM.text = VALID_GO;
    const fixes = await codeReviewer.fixFromReview([goFile(BROKEN_GO)], criticalReview('converter.go'), CONTEXT);

    expect(fixes[0].success).toBe(true);
    expect(fixes[0].fixedCode).toContain('encoding/csv');
  });

  it.skipIf(!hasGo)('reports a fix that never validates as a failure', async () => {
    LLM.calls = 0;
    LLM.text = BROKEN_GO; // the model keeps returning the same broken file
    const fixes = await codeReviewer.fixFromReview([goFile(BROKEN_GO)], criticalReview('converter.go'), CONTEXT);

    expect(fixes[0].success).toBe(false);
    expect(LLM.calls).toBe(3); // maxFixAttempts
  });

  it.skipIf(!hasGo)('KNOWN BLIND SPOT: rejects a correct file whose sibling only exists in the project', async () => {
    // The real export shape — a node file importing a sibling package. The check
    // stages this ONE file into `go mod init sandbox`, so the import cannot
    // resolve and the loop cannot converge no matter what the model returns.
    const multiFile = [
      'package main',
      '',
      'import (',
      '\t"csv2json/converter"',
      '\t"encoding/csv"',
      '\t"os"',
      ')',
      '',
      'func main() {',
      '\t_ = csv.NewReader(os.Stdin)',
      '\tconverter.Parse("a,b")',
      '}',
    ].join('\n');

    LLM.calls = 0;
    LLM.text = multiFile; // the model returns the file unchanged — it is already correct
    const fixes = await codeReviewer.fixFromReview([goFile(multiFile)], criticalReview('converter.go'), CONTEXT);

    // False "unfixable", and the caller gets the file back unmodified.
    expect(fixes[0].success).toBe(false);
    expect(fixes[0].fixAttempts).toBe(3);
    expect(fixes[0].fixedCode).toBe(multiFile);
  });
});
