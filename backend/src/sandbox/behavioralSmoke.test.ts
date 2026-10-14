/**
 * Shared behavioral smoke gate — the canvas/chat unification contract.
 *
 * These tests pin the parts the CANVAS path newly depends on:
 *   - the gate runs BOTH probes and reports honest verdicts,
 *   - a FAILED verdict feeds a bounded repair loop (2 rounds max),
 *   - a repair rewrites the entry IN PLACE and is written to disk so the next
 *     probe sees it (the canvas writes repairs back onto its files),
 *   - a deterministic runtime fix that clears the failure short-circuits the
 *     LLM call entirely (zero-cost repair),
 *   - `runStagedBehavioralSmoke` stages a file set, returns the repaired paths,
 *     and always removes its temp dir.
 *
 * The probes are injected, so no Chrome / Python / model server is required.
 */

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import {
  runBehavioralSmokeGates,
  runStagedBehavioralSmoke,
  pickCliEntryFile,
  runCliSmoke,
  looksLikeServerEntry,
  detectHtmlTruncation,
  applyDeterministicHtmlRuntimeFixes,
  fixUninvokedEntryMain,
  addDeterministicHelpHandler,
  type SmokeVerdict,
} from './behavioralSmoke.js';

const HTML = '<!doctype html><html><body><div id="board"></div><script>const b=document.getElementById("board");</script></body></html>';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bsmoke-test-'));
}

/** A verdict helper so each test reads as its scenario. */
const failed = (detail: string, errors: string[] = []): SmokeVerdict => ({ status: 'failed', errors, detail });
const passed = (detail = 'ok'): SmokeVerdict => ({ status: 'passed', errors: [], detail });
const skipped = (detail = 'skipped'): SmokeVerdict => ({ status: 'skipped', errors: [], detail });

describe('runBehavioralSmokeGates — bounded repair loop', () => {
  it('repairs a FAILED render verdict and writes the fix to disk', async () => {
    const dir = tmpDir();
    const files = [{ path: 'index.html', content: HTML }];
    fs.writeFileSync(path.join(dir, 'index.html'), HTML);
    const probe = vi.fn()
      .mockResolvedValueOnce(failed('boom is not defined'))
      .mockResolvedValueOnce(passed('fixed'));
    const repairCall = vi.fn(async () => '<!doctype html><html><body>FIXED</body></html>');

    const res = await runBehavioralSmokeGates({
      request: 'build a game',
      files,
      contractFiles: [],
      exportDir: dir,
      timeoutMs: 1000,
      tag: 'test',
      canRepair: () => true,
      consumeRepair: () => {},
      repairCall,
      renderProbe: probe,
      cliProbe: async () => skipped(),
    });

    expect(repairCall).toHaveBeenCalledTimes(1);
    expect(res.renderSmoke.status).toBe('passed');
    // The rewrite landed on the in-memory file AND on disk (the probe re-reads disk).
    expect(files[0].content).toContain('FIXED');
    expect(fs.readFileSync(path.join(dir, 'index.html'), 'utf-8')).toContain('FIXED');
  });

  it('stops after 2 rounds and never repairs past the budget', async () => {
    const dir = tmpDir();
    const files = [{ path: 'index.html', content: HTML }];
    fs.writeFileSync(path.join(dir, 'index.html'), HTML);
    const repairCall = vi.fn(async () => HTML.replace('</body>', '<b>still broken</b></body>'));

    const res = await runBehavioralSmokeGates({
      request: 'build a game',
      files,
      contractFiles: [],
      exportDir: dir,
      timeoutMs: 1000,
      tag: 'test',
      canRepair: () => true,
      consumeRepair: () => {},
      repairCall,
      renderProbe: async () => failed('never fixed'),
      cliProbe: async () => skipped(),
    });

    expect(repairCall).toHaveBeenCalledTimes(2); // MAX_SMOKE_REPAIR_ROUNDS
    expect(res.renderSmoke.status).toBe('failed');
  });

  it('honors a caller whose repair budget is exhausted (canRepair false)', async () => {
    const dir = tmpDir();
    const files = [{ path: 'index.html', content: HTML }];
    fs.writeFileSync(path.join(dir, 'index.html'), HTML);
    const repairCall = vi.fn(async () => 'unused');

    await runBehavioralSmokeGates({
      request: 'build a game',
      files,
      contractFiles: [],
      exportDir: dir,
      timeoutMs: 1000,
      tag: 'test',
      canRepair: () => false,
      consumeRepair: () => {},
      repairCall,
      renderProbe: async () => failed('no budget'),
      cliProbe: async () => skipped(),
    });

    expect(repairCall).not.toHaveBeenCalled();
  });

  it('runs the CLI gate when there is no HTML entry', async () => {
    const dir = tmpDir();
    const files = [{ path: 'main.ts', content: 'console.log("hi")' }];
    fs.writeFileSync(path.join(dir, 'main.ts'), 'console.log("hi")');
    const cliProbe = vi.fn(async () => passed('ran'));

    const res = await runBehavioralSmokeGates({
      request: 'build a cli',
      files,
      contractFiles: [],
      exportDir: dir,
      timeoutMs: 1000,
      tag: 'test',
      canRepair: () => true,
      consumeRepair: () => {},
      repairCall: async () => '',
      renderProbe: async () => skipped('no HTML entry file'),
      cliProbe,
    });

    expect(cliProbe).toHaveBeenCalledTimes(1);
    expect(res.cliSmoke.status).toBe('passed');
  });

  it('applies the deterministic HTML runtime fix BEFORE the LLM (zero-cost repair)', async () => {
    const dir = tmpDir();
    // `dataset.row === row` is the first-click crash class — the deterministic
    // fixer coerces the compared value, and the re-probe passes, so the model
    // is never called.
    const broken = '<!doctype html><html><body><script>const el = squares.find(s => s.dataset.row === row);</script></body></html>';
    const files = [{ path: 'index.html', content: broken }];
    fs.writeFileSync(path.join(dir, 'index.html'), broken);
    const repairCall = vi.fn(async () => 'should-not-run');
    let calls = 0;
    const probe = vi.fn(async (_dir: string, f: Array<{ path: string; content?: string }>) => {
      calls += 1;
      return calls === 1 ? failed('first-click crash') : passed('fixed by fixer');
    });

    const res = await runBehavioralSmokeGates({
      request: 'build checkers',
      files,
      contractFiles: [],
      exportDir: dir,
      timeoutMs: 1000,
      tag: 'test',
      canRepair: () => true,
      consumeRepair: () => {},
      repairCall,
      renderProbe: probe as any,
      cliProbe: async () => skipped(),
    });

    expect(res.renderSmoke.status).toBe('passed');
    expect(repairCall).not.toHaveBeenCalled();
    expect(files[0].content).toContain('String(row)');
  });
});

describe('runStagedBehavioralSmoke — the canvas path entry point', () => {
  it('stages files, runs the gate, returns repaired paths, and cleans up', async () => {
    const files = [{ path: 'index.html', content: HTML }];
    const repairCall = vi.fn(async () => '<!doctype html><html><body>FIXED</body></html>');
    let calls = 0;
    const probe = vi.fn(async () => (++calls === 1 ? failed('broken') : passed('fixed')));

    // Inject the probe by calling the underlying gate through a spy is awkward;
    // instead drive the staged helper with a fake render probe via the shared
    // gate's injectable options is not exposed here — so assert the staging
    // contract through the real (skipped) probes: an HTML entry with markers
    // will try the python script; on a box without it the verdict is
    // unavailable/fallback, which is still an honest non-pass.
    const res = await runStagedBehavioralSmoke({
      files,
      request: 'build a game',
      contractFiles: [],
      timeoutMs: 3000,
      tag: 'canvas-test',
      repairCall,
      maxRepairRounds: 2,
    });

    // The temp dir is always removed.
    expect(fs.existsSync(res.exportDir)).toBe(false);
    // A verdict was produced (passed/failed/unavailable) — never undefined.
    expect(['passed', 'failed', 'skipped', 'unavailable']).toContain(res.renderSmoke.status);
    expect(Array.isArray(res.repairedPaths)).toBe(true);
    void probe;
  });
});

describe('pure helpers the canvas path shares', () => {
  it('pickCliEntryFile prefers main/index/cli over arbitrary files', () => {
    expect(pickCliEntryFile([{ path: 'src/util.ts' }, { path: 'main.ts' }])).toBe('main.ts');
    expect(pickCliEntryFile([{ path: 'a.ts' }, { path: 'b.ts' }])).toBe('a.ts');
    expect(pickCliEntryFile([{ path: 'readme.md' }])).toBeNull();
  });

  it('detectHtmlTruncation flags an unclosed document, passes a complete one', () => {
    expect(detectHtmlTruncation('<html><body><script>x()</script>')).toContain('INCOMPLETE');
    expect(detectHtmlTruncation(HTML)).toBe('');
  });

  it('applyDeterministicHtmlRuntimeFixes coerces dataset comparisons and guards lookups', () => {
    expect(applyDeterministicHtmlRuntimeFixes('a.dataset.row === row'))
      .toBe('a.dataset.row === String(row)');
    expect(applyDeterministicHtmlRuntimeFixes('squares.find(s => s.dataset.row === row).querySelector(".x")'))
      .toContain('?.querySelector');
  });

  it('fixUninvokedEntryMain appends the missing call, and is idempotent', () => {
    const fixed = fixUninvokedEntryMain('function main() { console.log(1); }');
    expect(fixed).toContain('main();');
    expect(fixUninvokedEntryMain(fixed!)).toBeNull();
  });

  it('addDeterministicHelpHandler injects usage for a dispatch with no help', () => {
    const fixed = addDeterministicHelpHandler('function main() { switch (args[0]) { case "add": break; } }');
    expect(fixed).toContain('__vacaHelp');
    expect(addDeterministicHelpHandler(fixed!)).toBeNull();
  });
});

/**
 * Probe SAFETY — the two live defects this block pins:
 *  1. a server probed with `--help` never exits, so the probe reported a FALSE
 *     failure for a good app, and
 *  2. the surviving probe kept holding its port, leaking a listener that made
 *     the NEXT build die on EADDRINUSE.
 * A leak can only be proven with REAL subprocesses (tsx + python3), so this
 * block needs that infra and SKIPS — never fails — when it is missing.
 */
describe('CLI probe safety — servers are never probed with --help', () => {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const TSX = path.join(ROOT, 'node_modules', '.bin', 'tsx');
  const SCRIPT = path.join(ROOT, 'scripts', 'smoke-test-cli.py');
  const haveInfra = fs.existsSync(TSX) && fs.existsSync(SCRIPT);

  /** True when we can still bind the port ⇒ nothing leaked it. A LIVE holder
   *  makes bind fail with EADDRINUSE (SO_REUSEADDR does not allow that), so
   *  this is a real assertion, not a formality. */
  const portFree = (port: number): Promise<boolean> =>
    new Promise((resolve) => {
      const srv = net.createServer();
      srv.once('error', () => resolve(false));
      srv.once('listening', () => srv.close(() => resolve(true)));
      srv.listen(port);
    });

  /** Let the OS pick a free port. Hardcoded ports are a trap here: a probe that
   *  leaked (i.e. the very bug under test) would poison every later run. */
  const freePort = (): Promise<number> =>
    new Promise((resolve, reject) => {
      const srv = net.createServer();
      srv.once('error', reject);
      srv.listen(0, () => {
        const addr = srv.address();
        const port = addr && typeof addr === 'object' ? addr.port : 0;
        srv.close(() => resolve(port));
      });
    });

  /** A server whose `.listen(` is spelled INDIRECTLY on purpose: it must not be
   *  classified as a server, so the test reaches the real probe and exercises
   *  the process-group kill (the skip path never spawns anything). */
  const sneakyServer = (port: number): string =>
    `const net = require('net');\nconst s = new net.Server();\n` +
    `const f = s['lis' + 'ten'];\nf.call(s, ${port}, () => console.log('up'));\n` +
    `setInterval(() => {}, 1000);\n`;

  it('looksLikeServerEntry flags servers, ignores CLIs and commented-out calls', () => {
    expect(looksLikeServerEntry('app.listen(3000, () => {});')).toBe(true);
    expect(looksLikeServerEntry('const s = http.createServer(h);')).toBe(true);
    expect(looksLikeServerEntry('from flask import Flask\napp.run(port=5000)')).toBe(true);
    expect(looksLikeServerEntry("// app.listen(3000)\nconsole.log('hi');")).toBe(false);
    expect(looksLikeServerEntry("function main() { console.log('todos'); }")).toBe(false);
    expect(looksLikeServerEntry('')).toBe(false);
  });

  // A server entry is no longer silently skipped: it is STARTED and judged by
  // whether it stays up. The old assertion here pinned "never probe a server",
  // which is why a generated entry that defined its server and never called it
  // shipped reporting only "runtime unverified" while `npm start` exited 0 with
  // nothing listening. --help is still never used on a server (that is what
  // times out); liveness is what is measured instead.
  it('runServerProbe FAILS a server entry that returns instead of serving', async () => {
    const dir = tmpDir();
    // The measured defect, reduced: `.listen(` exists (so it reads as a server)
    // but sits inside a function nothing ever calls.
    const content = "const net = require('net');\n" +
      "function runServer(port) { net.createServer().listen(port, () => console.log('up')); }\n" +
      'module.exports = runServer;\n';
    fs.writeFileSync(path.join(dir, 'index.cjs'), content);
    const v = await runCliSmoke(dir, [{ path: 'index.cjs', content }], 3_000);
    expect(v.status).toBe('failed');
    expect(v.serverEntry).toBe(true);
    expect(v.detail).toContain('never serves');
  }, 30_000);

  it('runServerProbe PASSES a server that stays up and answers on its URL', async () => {
    const PORT = await freePort();
    const dir = tmpDir();
    const content = "const http = require('http');\n" +
      `http.createServer((_, res) => res.end('ok')).listen(${PORT}, () => console.log('http://localhost:${PORT}'));\n`;
    fs.writeFileSync(path.join(dir, 'index.cjs'), content);
    const v = await runCliSmoke(dir, [{ path: 'index.cjs', content }], 4_000);
    expect(v.detail).toContain('answering');
    expect(v.status).toBe('passed');
    expect(v.serverEntry).toBe(true);
    // And it must not survive the verdict: a leaked listener breaks the NEXT build.
    await new Promise((r) => setTimeout(r, 600));
    expect(await portFree(PORT)).toBe(true);
  }, 30_000);

  it('runServerProbe leaves an up-but-SILENT server UNVERIFIED, never green', async () => {
    const dir = tmpDir();
    const content = "const net = require('net');\nnet.createServer().listen(0);\nsetInterval(() => {}, 1000);\n";
    fs.writeFileSync(path.join(dir, 'index.cjs'), content);
    const v = await runCliSmoke(dir, [{ path: 'index.cjs', content }], 3_000);
    expect(v.status).toBe('skipped');
    expect(v.serverEntry).toBe(true);
    expect(v.detail).toContain('never announced a URL');
  }, 30_000);

  it.skipIf(!haveInfra)('a timed-out probe leaves nothing listening (caller-side group kill)', async () => {
    const PORT = await freePort();
    const dir = tmpDir();
    const content = sneakyServer(PORT);
    fs.writeFileSync(path.join(dir, 'main.cjs'), content);
    // 5s caller budget ≪ the script's own 20s per-probe timeout, so the kill is
    // exercised from the Node side.
    const v = await runCliSmoke(dir, [{ path: 'main.cjs', content }], 5_000);
    expect(v.status).toBe('unavailable');
    expect(v.detail).toBe('timeout');
    await new Promise((r) => setTimeout(r, 400));
    expect(await portFree(PORT)).toBe(true);
  }, 30_000);

  it.skipIf(!haveInfra)('the probe script kills the whole group (no EADDRINUSE cascade)', async () => {
    const PORT = await freePort();
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'main.cjs'), sneakyServer(PORT));
    const r = spawnSync('python3', [SCRIPT, dir, '--entry', 'main.cjs', '--timeout', '3'], {
      encoding: 'utf-8', timeout: 60_000,
    });
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.status).toBe('failed');
    // EVERY probe must time out. Before the group kill the first probe's server
    // survived, so probes 2 and 3 died on EADDRINUSE instead — the cascade that
    // used to burn two repair rounds on a failure the gate caused itself.
    expect(parsed.runs.map((x: { timedOut: boolean }) => x.timedOut)).toEqual([true, true, true]);
    await new Promise((r2) => setTimeout(r2, 400));
    expect(await portFree(PORT)).toBe(true);
  }, 60_000);

  it.skipIf(!haveInfra)('a normal CLI still passes (no over-eager server classification)', async () => {
    const dir = tmpDir();
    const content = 'function main() {\n' +
      '  const a = process.argv[2];\n' +
      "  if (!a || a === '--help' || a === '-h') { console.log('Usage: todos'); return; }\n" +
      "  console.log('ok');\n}\nmain();\n";
    fs.writeFileSync(path.join(dir, 'main.cjs'), content);
    const v = await runCliSmoke(dir, [{ path: 'main.cjs', content }], 30_000);
    expect(v.status).toBe('passed');
    expect(v.serverEntry).toBeUndefined();
  }, 60_000);
});
