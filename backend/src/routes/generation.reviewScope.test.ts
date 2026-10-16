/**
 * POST /api/generate/:projectId/files — the gate-scoped AI review contract.
 *
 * The reviewer is switched back on for this route, but ONLY for a non-TS build
 * and ONLY on the files the compile gate flagged. This test drives the real
 * route (real express server, real response body) with the FileGenerator and
 * the reviewer's LLM mocked, and asserts what actually reaches the reviewer and
 * what the caller can read back:
 *
 *   non-TS build + gate-flagged file  → reviewAll(exactly that file), scope in the response
 *   TS/JS build                       → no review, scope.skipped says why
 *   non-TS build, gates clean         → no review, scope.skipped says why
 *   { codeReview: false }             → no review, opt-out recorded
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

// The generation pipeline itself is mocked: this test is about the review scope,
// not about generating code (that would need a model server).
const state = vi.hoisted(() => ({ result: null as any }));

vi.mock('../db/projects.js', () => {
  const store = new Map<string, any>();
  const caches = new Map<string, any>();
  return {
    projects: {
      getById: (id: string) => store.get(id),
      create: (p: any) => { store.set(p.id, p); return p; },
      delete: (id: string) => store.delete(id),
      setGenerationCache: (id: string, v: any) => { caches.set(id, v); },
      __store: store,
    },
    ProjectStore: class {},
  };
});

vi.mock('../layers/fileGenerator.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../layers/fileGenerator.js')>();
  return {
    ...actual,
    FileGenerator: class {
      async generateFiles() { return state.result; }
    },
  };
});

// Only the reviewer's LLM calls are stubbed (reviewAll); the rest of the review
// module — including `toReviewableFiles` and the gate-scoping rules — stays real
// so this test exercises the real path from the route to the reviewer.
vi.mock('../review/CodeReviewer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../review/CodeReviewer.js')>();
  return {
    ...actual,
    codeReviewer: { reviewAll: vi.fn() },
  };
});

import { generationRoutes } from './generation.js';
import { projects } from '../db/projects.js';
import { codeReviewer } from '../review/CodeReviewer.js';

const reviewAll = codeReviewer.reviewAll as unknown as ReturnType<typeof vi.fn>;

const PROJECT = {
  id: 'p-go',
  name: 'csv2json',
  targetOS: 'linux',
  edges: [],
  nodes: [
    { id: 'm1', type: 'master', data: { label: 'CSV to JSON', appGoal: 'convert a csv file to json' } },
    { id: 'n1', type: 'module', data: { label: 'CSV Converter', language: 'go' } },
  ],
};

/** A real Go gate failure, as `go build ./...` reports it. */
const GO_COMPILE_ERROR = [
  '# vaca/converter',
  'converter/converter.go:41:9: undefined: csv',
].join('\n');

/** What `generateFiles` returns for a Go build whose gate flagged one file. */
function goResult() {
  return {
    files: [
      { fileName: 'converter.go', language: 'go', code: 'package converter', nodeId: 'n1', nodeLabel: 'CSV Converter', errors: [], validated: true, dependencies: [], exports: [] },
      { fileName: 'main.go', language: 'go', code: 'package main', nodeId: 'n2', nodeLabel: 'Entry', errors: [], validated: true, dependencies: [], exports: [] },
    ],
    totalChars: 32,
    totalErrors: 0,
    validatedCount: 2,
    failedCount: 0,
    importGraph: {},
    tsCompileClean: false,
    contractViolations: 0,
    languageGates: [{ language: 'go', clean: false, errors: [GO_COMPILE_ERROR] }],
    gateFlaggedFiles: [
      { nodeId: 'n1', fileName: 'converter.go', nodeLabel: 'CSV Converter', language: 'go', reasons: ['undefined: csv'] },
    ],
    renderSmoke: null,
    cliSmoke: null,
  };
}

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/generate', generationRoutes);
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function generate(body: any = {}) {
  const res = await fetch(`${base}/api/generate/${PROJECT.id}/files`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ runtimeSmoke: false, ...body }),
  });
  return { status: res.status, body: await res.json() as any };
}

describe('POST /api/generate/:projectId/files — gate-scoped AI review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (projects as any).create(PROJECT);
    reviewAll.mockResolvedValue({
      comments: [],
      summary: { filesReviewed: 1, totalComments: 3, criticalCount: 1, highCount: 2, mediumCount: 0, lowCount: 0, infoCount: 0 },
      perFile: [],
      success: true,
    });
  });

  it('reviews ONLY the gate-flagged file of a non-TS build', async () => {
    state.result = goResult();
    const { status, body } = await generate();

    expect(status).toBe(200);
    expect(reviewAll).toHaveBeenCalledTimes(1);
    const [targets] = reviewAll.mock.calls[0];
    expect(targets.map((t: any) => t.fileName)).toEqual(['converter.go']);
    expect(targets[0].language).toBe('go');

    expect(body.codeReview?.summary.totalComments).toBe(3);
    expect(body.codeReviewScope).toMatchObject({
      skipped: null,
      reviewedFiles: ['converter.go'],
      flaggedFiles: ['converter.go'],
    });
    expect(body.summary.reviewIssues).toBe(3);
    expect(body.summary.reviewCritical).toBe(1);
    expect(body.summary.reviewHigh).toBe(2);
  });

  it('leaves a TS/JS build to the static scanner (no review call)', async () => {
    state.result = { ...goResult(), languageGates: [], gateFlaggedFiles: [] };
    const { status, body } = await generate();

    expect(status).toBe(200);
    expect(reviewAll).not.toHaveBeenCalled();
    expect(body.codeReview).toBeNull();
    expect(body.codeReviewScope.skipped).toContain('no non-TS language gate');
    expect(body.summary.reviewIssues).toBe(0);
  });

  it('reviews nothing when the non-TS gates passed', async () => {
    state.result = {
      ...goResult(),
      languageGates: [{ language: 'go', clean: true, errors: [] }],
      gateFlaggedFiles: [],
    };
    const { body } = await generate();

    expect(reviewAll).not.toHaveBeenCalled();
    expect(body.codeReviewScope.skipped).toContain('no gate-flagged file');
  });

  it('honours the per-request opt-out', async () => {
    state.result = goResult();
    const { body } = await generate({ codeReview: false });

    expect(reviewAll).not.toHaveBeenCalled();
    expect(body.codeReviewScope.skipped).toContain('disabled by request');
    // The flagged files are still reported, so a caller can review them itself.
    expect(body.codeReviewScope.flaggedFiles).toEqual(['converter.go']);
  });
});
