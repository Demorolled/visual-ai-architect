import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { runSandbox } from './dockerRunner.js';

const has = (bin: string, args: string[] = ['--version']): boolean => {
  try { execFileSync(bin, args, { stdio: 'ignore' }); return true; } catch { return false; }
};

const hasGcc = has('gcc');
const hasRustc = has('rustc');
const hasGo = has('go', ['version']);

describe('local sandbox validation is honest about what it can check', () => {
  it('reports a language it has no checker for as SKIPPED — never as broken', async () => {
    // Kotlin has no local single-file checker here. The old code fell back to
    // the TypeScript config, wrote the Kotlin source to `index.ts` and returned
    // a wall of TS1005 "errors" for a file tsc cannot read.
    const res = await runSandbox('fun main() { println("hi") }', 'kotlin');
    expect(res.skipped).toBe(true);
    expect(res.errors).toEqual([]);
    expect(res.reason).toContain('kotlin');
  });

  it.skipIf(!hasGcc)('checks C with the real C compiler, and its diagnostics are C diagnostics', async () => {
    const ok = await runSandbox('#include <stdio.h>\nint main(void) { printf("hi\\n"); return 0; }\n', 'c');
    expect(ok.success).toBe(true);
    expect(ok.errors).toEqual([]);

    const bad = await runSandbox('int main(void) { return 0\n', 'c');
    expect(bad.success).toBe(false);
    const text = bad.errors.join('\n');
    expect(text).toMatch(/error/i);
    // The regression this guards: non-TS files were compiled by tsc and
    // reported TS-code diagnostics that had nothing to do with the source.
    expect(text).not.toMatch(/TS\d{4}/);
    expect(text).not.toContain('index.ts');
  });

  // The other half of the same principle: a checker WITH no toolchain must not
  // report a verdict either. Before this, `execSync` threw `rustc: not found`
  // and it came back as `success: false` with a shell error standing in for a
  // compiler diagnostic — so valid Rust read as broken and the fix loop tried to
  // repair it. Guarded from both sides so the assertion is real wherever the
  // suite runs: it asserts the honest-skip branch only where the tool is absent.
  it.runIf(!hasRustc)('reports a MISSING toolchain as SKIPPED, never as a failed check', async () => {
    const res = await runSandbox('fn main() { println!("hi"); }\n', 'rust');
    expect(res.skipped).toBe(true);
    expect(res.errors).toEqual([]);
    expect(res.success).toBe(false);
    expect(res.reason).toContain('toolchain');
    expect(res.reason).toContain('rust');
  });

  it.runIf(hasRustc)('checks Rust with the real compiler when the toolchain exists', async () => {
    const ok = await runSandbox('fn main() { println!("hi"); }\n', 'rust');
    expect(ok.skipped).toBeUndefined();
    expect(ok.success).toBe(true);
  });

  // The probe must get the caller's budget, not a private cap of its own. With a
  // 1ms budget a present toolchain cannot answer `go version` (fork + exec + Go
  // runtime init is milliseconds), so the correct outcome is SKIPPED with no
  // diagnostics — while a fixed 20s probe would have "passed", let the real check
  // run at 1ms, and reported the timeout as a compiler failure with errors.
  it.skipIf(!hasGo)('probes the toolchain with the caller\'s timeout, not a tighter one', async () => {
    const res = await runSandbox('package main\n\nfunc main() {}\n', 'go', 1);
    expect(res.skipped).toBe(true);
    expect(res.errors).toEqual([]);
    expect(res.reason).toMatch(/did not answer its probe/);

    // Same file, real budget: checked for real.
    const real = await runSandbox('package main\n\nfunc main() {}\n', 'go', 30_000);
    expect(real.skipped).toBeUndefined();
    expect(real.success).toBe(true);
  });

  it('never stages a non-TS file under a TypeScript entry name', async () => {
    const res = await runSandbox('int main(void) { return 0; }\n', 'c');
    expect(res.output).not.toContain('.ts');
    expect((res.errors || []).join('\n')).not.toContain('.ts');
  });
});
