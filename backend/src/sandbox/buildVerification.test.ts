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
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { deriveBuildVerdict, runTscGate } from './buildVerification.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const hasTsc = fs.existsSync(path.join(PROJECT_ROOT, 'node_modules', 'typescript', 'bin', 'tsc'));
// `express` stands in for "a dependency this app legitimately declares": it is
// installed in the repo, so the contract gate's isSafeNonRelativeImport()
// accepts the specifier as installed. It is NOT resolvable from a bare temp
// scaffold, which is the whole point of the test below.
const hasExpress = fs.existsSync(path.join(PROJECT_ROOT, 'node_modules', 'express'));

const entry = (relPath: string, code: string) => ({ label: relPath, relPath, code });

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
    });      expect(v.failure?.kind).toBe('smoke');
      expect(v.clean).toBe(false);
      expect(v.learnEligible).toBe(false);
    });
  });

/**
 * The tsc gate must judge the SOURCES, not the absence of an `npm install`.
 *
 * A bare import of an installed package used to fail with TS2307, because no
 * scaffold directory can resolve anything a temp scaffold has not installed —
 * while the contract gate accepts the very same specifier as installed. That
 * mismatch burned repair rounds on imports that were already correct, and the
 * repair prompt for this error class instructs the model to REMOVE the import.
 * Linking the project's node_modules fixes the cause: real dependencies resolve
 * AND get type-checked against their real types, while invented packages still
 * fail because they are not installed anywhere.
 */
describe('runTscGate — no phantom TS2307 for installed packages', () => {
  const APP = "import express from 'express';\nconst app = express();\nexport default app;\n";

  it.skipIf(!hasTsc || !hasExpress)('resolves an installed dependency instead of failing it', async () => {
    const res = await runTscGate([entry('src/app.ts', APP)], { timeoutMs: 60_000 });
    expect(res.errors).toEqual([]);
    expect(res.status).toBe('clean');
  });

  it.skipIf(!hasTsc || !hasExpress)('the link is what fixes it — unlinked reproduces the phantom', async () => {
    const res = await runTscGate([entry('src/app.ts', APP)], { timeoutMs: 60_000, linkNodeModules: false });
    expect(res.errors.join('\n')).toContain('TS2307');
  });

  it.skipIf(!hasTsc)('still fails a package that is installed nowhere (invented dependency)', async () => {
    const res = await runTscGate(
      [entry('src/bad.ts', "import x from 'definitely-not-an-installed-package-xyz';\nexport default x;\n")],
      { timeoutMs: 60_000 },
    );
    expect(res.status).toBe('errors');
    expect(res.errors.join('\n')).toContain('TS2307');
  });

  it.skipIf(!hasTsc)('still fails a RELATIVE import of a file that does not exist', async () => {
    const res = await runTscGate(
      [entry('src/a.ts', "import { b } from './missing';\nexport const c = b;\n")],
      { timeoutMs: 60_000 },
    );
    expect(res.status).toBe('errors');
    expect(res.errors.join('\n')).toContain('TS2307');
  });
});
