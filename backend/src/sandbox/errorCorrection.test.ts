/**
 * The fix loop must never invent an error, and must never judge a language it
 * cannot read.
 *
 * `runSandbox` reports a language with no checker as `skipped: true, errors: []`
 * — "not validated", which is NOT "validated and broken" (see the `SandboxResult`
 * doc). The loop used to treat that as a failure with an empty error list, so it
 * pushed `'Unknown validation error'` at the model, re-detected the reply as
 * TypeScript (`detectLanguage`'s default) and spent the next round running tsc
 * against C#/Kotlin source. Measured live on a .cs file: 3 model calls, an
 * `npx --package typescript` install, and `success: false` with the file
 * unchanged. `windows → csharp` and `android → kotlin` reach this by default.
 *
 * The sandbox and the model are both stubbed here so the loop's decisions are
 * the only thing under test; the real toolchains are covered by
 * `review/CodeReviewer.fixLoopSandbox.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const sandbox = vi.hoisted(() => ({ results: [] as any[], calls: 0, detected: 0, langs: [] as string[] }));
const LLM = vi.hoisted(() => ({ calls: 0 }));

vi.mock('./dockerRunner.js', () => ({
  runSandbox: vi.fn(async (_code: string, language?: string) => {
    sandbox.calls += 1;
    sandbox.langs.push(language || '(none)');
    return sandbox.results.shift() ?? { success: true, output: '', errors: [], exitCode: 0 };
  }),
  // The loop's language re-detection: defaults to TypeScript for anything it
  // does not recognise, which is what produced the bogus TS diagnostics.
  detectLanguage: vi.fn(() => { sandbox.detected += 1; return 'typescript'; }),
}));

vi.mock('../ai/translator.js', () => {
  class AITranslator {
    async reason(): Promise<string> {
      LLM.calls += 1;
      return 'the "fixed" file the model returned';
    }
  }
  return { AITranslator, askOtherLlm: async () => '', askConductor: async () => '', classifyCodeComplexity: () => 'simple', ModelTier: {} };
});

import { runErrorCorrection } from './errorCorrection.js';

const CSHARP = 'using System;\nclass P { static void Main() { } }';

beforeEach(() => {
  sandbox.results = [];
  sandbox.calls = 0;
  sandbox.detected = 0;
  sandbox.langs = [];
  LLM.calls = 0;
});

describe('runErrorCorrection — a language the sandbox cannot check', () => {
  it('stops immediately instead of inventing an error, and spends no model call', async () => {
    sandbox.results = [{
      success: false,
      output: '',
      errors: [],
      exitCode: 0,
      skipped: true,
      reason: "Local sandbox has no checker for 'csharp' — this file was not validated.",
    }];

    const res = await runErrorCorrection({ code: CSHARP, language: 'csharp', projectName: 'p', goal: 'g' });

    expect(res.success).toBe(false);
    expect(res.attempts).toEqual([]);
    expect(LLM.calls).toBe(0);          // no repair rounds, so no fabricated prompt
    expect(sandbox.detected).toBe(0);   // and no TS re-detection of C# source
    expect(sandbox.calls).toBe(1);      // one probe, not one per attempt
    expect(res.finalCode).toBe(CSHARP); // the file is returned untouched
    expect(res.language).toBe('csharp'); // its language is never silently changed
  });

  it('still accepts valid code without a model call', async () => {
    sandbox.results = [{ success: true, output: '', errors: [], exitCode: 0 }];

    const res = await runErrorCorrection({ code: 'package main\nfunc main() {}', language: 'go' });

    expect(res).toMatchObject({ success: true, language: 'go' });
    expect(res.attempts).toEqual([]);
    expect(LLM.calls).toBe(0);
  });

  it('never lets a reply move the validation target off a declared language', async () => {
    // `detectLanguage` returns 'typescript' for anything it does not recognise
    // (the mock always does, the real one defaults to it). The declared language
    // is authoritative, so every validation the loop runs must stay 'csharp'.
    sandbox.results = [
      { success: false, output: '', errors: ['CS0103: the name does not exist'], exitCode: 1 },
      { success: true, output: '', errors: [], exitCode: 0 },
    ];

    const res = await runErrorCorrection({ code: CSHARP, language: 'csharp', maxAttempts: 3 });

    expect(sandbox.langs).toEqual(['csharp', 'csharp']);
    expect(res.language).toBe('csharp');
    expect(sandbox.detected).toBe(0); // no re-detection of a declared language
  });

  it('still follows a detected language when the caller declared none', async () => {
    sandbox.results = [
      { success: false, output: '', errors: ['boom'], exitCode: 1 },
      { success: true, output: '', errors: [], exitCode: 0 },
    ];

    const res = await runErrorCorrection({ code: 'x = 1' });

    expect(sandbox.detected).toBe(1);
    expect(res.language).toBe('typescript');
  });

  it('still repairs a real failure through the model', async () => {
    sandbox.results = [
      { success: false, output: '', errors: ['undefined: csv'], exitCode: 1 },
      { success: true, output: '', errors: [], exitCode: 0 },
    ];

    const res = await runErrorCorrection({ code: 'broken', language: 'go', maxAttempts: 3 });

    expect(res.success).toBe(true);
    expect(res.attempts).toHaveLength(1);
    expect(LLM.calls).toBe(1);
    // The real diagnostic — not a fabricated one — is what reached the model.
    expect(res.attempts[0].error).toContain('undefined: csv');
  });
});
