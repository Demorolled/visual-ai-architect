/**
 * buildVerification — the shared "is this build verified?" decision.
 *
 * Pins the boundary that makes skipping the CLI probe SAFE. A server entry is
 * deliberately not probed any more (probing a long-running server with --help
 * always fails falsely, and the survivor leaked a listener that broke the next
 * build with EADDRINUSE), so its runtime is UNVERIFIED. A syntax gate only
 * parses — it cannot show the app boots and answers. Without this rule,
 * removing the bad probe flipped every server build from ⚠️ to a green ✅.
 */

import { describe, it, expect } from 'vitest';
import { deriveBuildVerdict } from './buildVerification.js';

const JS_GATE = [{ language: 'javascript' as const, clean: true, errors: [] }];

describe('deriveBuildVerdict — a skipped server probe is never a pass', () => {
  it('leaves a server build UNVERIFIED (no green ✅, not learn-eligible)', () => {
    const v = deriveBuildVerdict({
      tscStatus: 'skipped',
      tscErrors: 0,
      languageGates: JS_GATE,
      stubFailures: [],
      renderSmoke: { status: 'skipped', errors: [], detail: 'no HTML entry file' },
      cliSmoke: {
        status: 'skipped',
        errors: [],
        detail: 'server-style entry src/index.js (binds a port) — not probed with --help; runtime unverified',
        serverEntry: true,
      },
    });
    expect(v.clean).toBe(false);
    expect(v.learnEligible).toBe(false);
    expect(v.failure?.kind).toBe('noGate');
    expect(v.failure?.detail).toMatch(/runtime NOT verified/i);
  });

  it('only serverEntry flips it — a plain skipped probe keeps prior semantics', () => {
    const v = deriveBuildVerdict({
      tscStatus: 'skipped',
      tscErrors: 0,
      languageGates: JS_GATE,
      stubFailures: [],
      renderSmoke: { status: 'skipped', errors: [], detail: 'no HTML entry file' },
      cliSmoke: { status: 'skipped', errors: [], detail: 'no runnable entry file' },
    });
    // Pre-existing, deliberately-untouched semantics: a clean non-TS gate
    // vouches for the build. Whether a PARSE-only gate should be enough to
    // vouch is a separate question this change does not decide.
    expect(v.clean).toBe(true);
    expect(v.learnEligible).toBe(true);
    expect(v.failure).toBeNull();
  });

  it('still reports a FAILED cli probe as a smoke failure (regression guard)', () => {
    const v = deriveBuildVerdict({
      tscStatus: 'skipped',
      tscErrors: 0,
      languageGates: JS_GATE,
      stubFailures: [],
      renderSmoke: null,
      cliSmoke: { status: 'failed', errors: ['boom'], detail: 'crash before listen' },
    });
    expect(v.failure?.kind).toBe('smoke');
    expect(v.clean).toBe(false);
    expect(v.learnEligible).toBe(false);
  });
});
