/**
 * Tests for the gate-scoped post-generation review.
 *
 * The behaviour under test is the SCOPE rule — the reviewer must run on the
 * files the compile/stub gate flagged of a non-TS build, and must not run (nor
 * spend a model call) anywhere else. The reviewer itself is mocked: `reviewAll`
 * would otherwise hit the real local LLM.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./CodeReviewer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./CodeReviewer.js')>();
  return {
    ...actual,
    codeReviewer: { reviewAll: vi.fn() },
  };
});

import { codeReviewer, type CodeReviewResult } from './CodeReviewer.js';
import {
  collectGateFlaggedFiles,
  isNonTsGateBuild,
  reviewGateFlaggedNonTsBuild,
  type GateFlaggedFile,
  type StagedGateFile,
} from './gateScopedReview.js';

const reviewAll = codeReviewer.reviewAll as unknown as ReturnType<typeof vi.fn>;

// ─── Fixtures ──────────────────────────────────────────────────────────────

const CONVERTER_GO = 'converter/converter.go' as const;
const MAIN_GO = 'main.go' as const;
const COUNTER_PY = 'word_counter.py' as const;

const staged: StagedGateFile[] = [
  { path: CONVERTER_GO, content: 'package converter', fileName: 'converter.go', nodeId: 'n1', nodeLabel: 'CSV Converter', language: 'go' },
  { path: MAIN_GO, content: 'package main', fileName: 'main.go', nodeId: 'n2', nodeLabel: 'CLI Entry', language: 'go' },
  { path: COUNTER_PY, content: 'def count_words():\n    return 0', fileName: 'word_counter.py', nodeId: 'n3', nodeLabel: 'Word Counter', language: 'python' },
];

/** The real shape of a Go gate failure: `go build ./...` stderr, one error per line. */
const GO_COMPILE_ERROR = [
  '# vaca-nonts-x/converter',
  'converter/converter.go:41:9: undefined: csv',
  'converter/converter.go:12:2: "encoding/csv" imported and not used',
].join('\n');

/** A gate failure that names NO file — the go.mod module line. */
const GO_MODULE_ERROR = 'malformed import path "a 3d chess game": invalid char \' \'';

function makeReview(total = 2, critical = 1, high = 0): CodeReviewResult {
  return {
    comments: [],
    summary: { filesReviewed: 1, totalComments: total, criticalCount: critical, highCount: high, mediumCount: 0, lowCount: 0, infoCount: 0 },
    perFile: [],
    success: true,
  };
}

const FLAGGED: GateFlaggedFile[] = [
  { nodeId: 'n1', fileName: 'converter.go', nodeLabel: 'CSV Converter', language: 'go', reasons: ['undefined: csv'] },
];

const FILES = staged.map((s) => ({
  fileName: s.fileName,
  code: s.content,
  nodeId: s.nodeId,
  nodeLabel: s.nodeLabel,
  language: s.language,
}));

// ─── Attribution: which files did the gate flag? ───────────────────────────

describe('collectGateFlaggedFiles', () => {
  it('attributes a compile error to the file the compiler names, and only that file', () => {
    const flagged = collectGateFlaggedFiles(
      staged,
      [{ language: 'go', clean: false, errors: [GO_COMPILE_ERROR] }],
      [],
    );

    expect(flagged.map((f) => f.fileName)).toEqual(['converter.go']);
    expect(flagged[0].nodeId).toBe('n1');
    // The gate's own words travel with the file — that is what the reviewer is
    // handed as the reason to look at it.
    expect(flagged[0].reasons.join('\n')).toContain('undefined: csv');
    expect(flagged[0].reasons.join('\n')).toContain('imported and not used');
  });

  it('flags every file of a language whose failure names no file', () => {
    // A go.mod module-path error has no file in it. Dropping it would review
    // nothing on a build that does not compile.
    const flagged = collectGateFlaggedFiles(
      staged,
      [{ language: 'go', clean: false, errors: [GO_MODULE_ERROR] }],
      [],
    );

    expect(flagged.map((f) => f.fileName).sort()).toEqual(['converter.go', 'main.go']);
    expect(flagged.every((f) => f.reasons.join(' ').includes('no file named'))).toBe(true);
    // Python was clean — it must not be dragged in.
    expect(flagged.some((f) => f.fileName === 'word_counter.py')).toBe(false);
  });

  it('does NOT fall back to the language when a sibling named itself', () => {
    // One attributed failure must not pull in the rest of that language.
    const flagged = collectGateFlaggedFiles(
      staged,
      [{ language: 'go', clean: false, errors: [GO_COMPILE_ERROR] }],
      [],
    );
    expect(flagged.some((f) => f.fileName === 'main.go')).toBe(false);
  });

  it('attributes a stub/unimplemented failure to its file', () => {
    const flagged = collectGateFlaggedFiles(staged, [], ['word_counter.py: function count_words is a stub']);

    expect(flagged.map((f) => f.fileName)).toEqual(['word_counter.py']);
    expect(flagged[0].language).toBe('python');
  });

  it('flags nothing when every gate is clean', () => {
    const flagged = collectGateFlaggedFiles(
      staged,
      [{ language: 'go', clean: true, errors: [] }, { language: 'python', clean: true, errors: [] }],
      [],
    );
    expect(flagged).toEqual([]);
  });

  it('attributes a pseudo-gate row (hardcoded secret) but gives it no language fallback', () => {
    const flagged = collectGateFlaggedFiles(
      staged,
      [{ language: 'hardcoded-secret', clean: false, errors: ['converter/converter.go:7: AWS access key'] }],
      [],
    );
    expect(flagged.map((f) => f.fileName)).toEqual(['converter.go']);

    // Unattributed secret rows must NOT become "every file in the project".
    expect(collectGateFlaggedFiles(staged, [{ language: 'hardcoded-secret', clean: false, errors: ['2 secrets found'] }], [])).toEqual([]);
  });

  it('picks the longest matching path when one path is a suffix of another', () => {
    // `converter/converter.go` contains `converter.go`; the deeper file owns the
    // error. Guards the shared matcher's longest-match rule.
    const nested: StagedGateFile[] = [
      { path: CONVERTER_GO, content: '', fileName: 'converter.go', nodeId: 'n1', nodeLabel: 'A', language: 'go' },
      { path: 'converter.go', content: '', fileName: 'converter.go', nodeId: 'n9', nodeLabel: 'B', language: 'go' },
    ];
    const flagged = collectGateFlaggedFiles(
      nested,
      [{ language: 'go', clean: false, errors: [GO_COMPILE_ERROR] }],
      [],
    );
    expect(flagged.map((f) => f.nodeId)).toEqual(['n1']);
  });

  it('does not flag a file on a package banner alone', () => {
    // `# pkg/converter` matches the shallowest `converter.go` through the
    // matcher's normalized pass. Context for a repair prompt, not a flag.
    const shallow: StagedGateFile[] = [
      { path: 'converter.go', content: '', fileName: 'converter.go', nodeId: 'n9', nodeLabel: 'B', language: 'go' },
    ];
    const flagged = collectGateFlaggedFiles(
      shallow,
      [{ language: 'go', clean: false, errors: ['# vaca-nonts/converter'] }],
      [],
    );
    // Nothing named a file, so the honest answer is the language fallback —
    // never silently nothing on a build that failed to compile.
    expect(flagged.map((f) => f.nodeId)).toEqual(['n9']);
    expect(flagged[0].reasons.join(' ')).toContain('no file named');
  });

  it('accepts the dotnet diagnostic form `Program.cs(5,9)`', () => {
    const cs: StagedGateFile[] = [
      { path: 'Program.cs', content: '', fileName: 'Program.cs', nodeId: 'n4', nodeLabel: 'Entry', language: 'csharp' },
      { path: 'Board.cs', content: '', fileName: 'Board.cs', nodeId: 'n5', nodeLabel: 'Board', language: 'csharp' },
    ];
    const flagged = collectGateFlaggedFiles(
      cs,
      [{ language: 'csharp', clean: false, errors: ["Program.cs(5,9): error CS0103: The name 'args' does not exist"] }],
      [],
    );
    expect(flagged.map((f) => f.fileName)).toEqual(['Program.cs']);
    expect(flagged.some((f) => f.fileName === 'Board.cs')).toBe(false);
  });
});

describe('isNonTsGateBuild', () => {
  it('is true only for a real gated language', () => {
    expect(isNonTsGateBuild([{ language: 'go', clean: true }])).toBe(true);
    expect(isNonTsGateBuild([{ language: 'hardcoded-secret', clean: false }])).toBe(false);
    expect(isNonTsGateBuild([{ language: 'duplicate-definitions', clean: false }])).toBe(false);
    expect(isNonTsGateBuild([])).toBe(false);
  });
});

// ─── Running the reviewer over that scope ──────────────────────────────────

describe('reviewGateFlaggedNonTsBuild', () => {
  beforeEach(() => {
    reviewAll.mockReset();
    reviewAll.mockResolvedValue(makeReview());
    delete process.env.VACA_SKIP_CODE_REVIEW;
  });

  afterEach(() => {
    delete process.env.VACA_SKIP_CODE_REVIEW;
  });

  const run = (overrides: Partial<Parameters<typeof reviewGateFlaggedNonTsBuild>[0]> = {}) =>
    reviewGateFlaggedNonTsBuild({
      languageGates: [{ language: 'go', clean: false, errors: [GO_COMPILE_ERROR] }],
      flaggedFiles: FLAGGED,
      files: FILES,
      projectName: 'csv2json',
      appGoal: 'convert a csv to json',
      ...overrides,
    });

  it('reviews exactly the gate-flagged files, once, for a non-TS build', async () => {
    const outcome = await run();

    expect(reviewAll).toHaveBeenCalledTimes(1);
    const [targets, context, config] = reviewAll.mock.calls[0];
    expect(targets.map((t: any) => t.fileName)).toEqual(['converter.go']);
    expect(targets[0].code).toContain('package converter');
    expect(context).toEqual({ projectName: 'csv2json', appGoal: 'convert a csv to json' });
    // Scoped defaults: a handful of files that all failed the same gate.
    expect(config).toMatchObject({ concurrency: 2, enableLlmDedup: false });

    expect(outcome.review?.summary.totalComments).toBe(2);
    expect(outcome.skipped).toBeNull();
    expect(outcome.reviewedFiles).toEqual(['converter.go']);
  });

  it('does not call the reviewer for a TS/JS build', async () => {
    const outcome = await run({ languageGates: [], flaggedFiles: [] });
    expect(reviewAll).not.toHaveBeenCalled();
    expect(outcome.review).toBeNull();
    expect(outcome.skipped).toContain('no non-TS language gate');
  });

  it('does not call the reviewer when the non-TS gates passed', async () => {
    const outcome = await run({
      languageGates: [{ language: 'go', clean: true, errors: [] }],
      flaggedFiles: [],
    });
    expect(reviewAll).not.toHaveBeenCalled();
    expect(outcome.skipped).toContain('no gate-flagged file');
  });

  it('maps a flagged file by nodeId when two files share a name', async () => {
    const outcome = await run({
      flaggedFiles: [{ nodeId: 'n2', fileName: 'main.go', nodeLabel: 'CLI Entry', language: 'go', reasons: ['x'] }],
    });
    const [targets] = reviewAll.mock.calls[0];
    expect(targets.map((t: any) => t.nodeLabel)).toEqual(['CLI Entry']);
    expect(targets[0].nodeId).toBe('n2');
    expect(outcome.reviewedFiles).toEqual(['main.go']);
  });

  it('reports a flagged file the generator no longer has as skipped, without calling the reviewer', async () => {
    const outcome = await run({
      flaggedFiles: [{ nodeId: 'gone', fileName: 'gone.go', nodeLabel: 'Gone', language: 'go', reasons: ['x'] }],
    });
    expect(reviewAll).not.toHaveBeenCalled();
    expect(outcome.skipped).toContain('not present in the generated file set');
  });

  it('never throws when the reviewer fails', async () => {
    reviewAll.mockRejectedValue(new Error('boom'));
    const outcome = await run();
    expect(outcome.review).toBeNull();
    expect(outcome.skipped).toContain('reviewer failed: boom');
    expect(outcome.reviewedFiles).toEqual(['converter.go']);
  });

  it('honours the VACA_SKIP_CODE_REVIEW kill switch', async () => {
    process.env.VACA_SKIP_CODE_REVIEW = '1';
    const outcome = await run();
    expect(reviewAll).not.toHaveBeenCalled();
    expect(outcome.skipped).toContain('VACA_SKIP_CODE_REVIEW');
  });
});
