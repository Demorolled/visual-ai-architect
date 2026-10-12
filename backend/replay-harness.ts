/**
 * Go replay harness — runs the REAL compile gate (`runNonTsProjectGates`)
 * against the on-disk export projects, so we can measure a failure/fix against
 * the actual product path instead of reasoning about error strings.
 *
 * Usage (from backend/):
 *   GOPROXY=off npx tsx replay-harness.ts raw       # as-is
 *   GOPROXY=off npx tsx replay-harness.ts current   # current sanitize pre-pass
 *   GOPROXY=off npx tsx replay-harness.ts single    # candidate: single package main
 *
 * Prints, per export: gate verdict + first errors. Then a summary tally.
 * This is a measurement tool, NOT part of the product.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  runNonTsProjectGates,
  sanitizeGoModuleName,
  type StagedSourceFile,
} from './src/sandbox/nonTsCompileGate.js';
import { sanitizeNonTsSource } from './src/sandbox/nonTsRepair.js';

const EXPORTS = path.join(process.cwd(), 'exports');
const variant = (process.argv[2] || 'raw') as 'raw' | 'current' | 'single';

function collectGo(root: string): StagedSourceFile[] {
  const out: StagedSourceFile[] = [];
  const walk = (rel: string) => {
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(r);
      else if (e.name.endsWith('.go')) {
        out.push({ relPath: r, code: fs.readFileSync(path.join(root, r), 'utf-8'), language: 'go' });
      }
    }
  };
  walk('');
  return out;
}

/** Candidate: force the whole set into a SINGLE `package main` in one directory
 *  (flatten paths), then drop non-std imports. This is the real form of the
 *  hypothesized fix — same-package refs resolve, imports of vanished local
 *  packages are removed. */
function toSingleMain(files: StagedSourceFile[]): StagedSourceFile[] {
  const localDirs = new Set<string>();
  for (const f of files) {
    const segs = f.relPath.split('/');
    if (segs.length > 1) localDirs.add(segs[0]);
  }
  const used = new Set<string>();
  return files.map((f) => {
    // flatten: put every file in the same directory
    const segs = f.relPath.split('/');
    let base = segs[segs.length - 1];
    if (used.has(base)) base = segs.slice(0, -1).join('_') + '_' + base;
    used.add(base);
    let code = f.code;
    // rewrite the package clause to `package main`
    code = code.replace(/^(?:\s*\/\/[^\n]*\n)*\s*package\s+[A-Za-z_]\w*/m, 'package main');
    // remove only NON-STD imports: first path segment contains a dot (github.com,
    // gopkg.in, …) OR matches a local directory name (database, config, src, …).
    code = code.split('\n').filter((line) => {
      const m = /^[ \t]*(?:[A-Za-z_]\w*[ \t]+)?"([^"]+)"\s*$/.exec(line);
      if (!m) return true;
      const p = m[1];
      const first = p.split('/')[0];
      if (first.includes('.')) return false;      // third-party
      if (localDirs.has(first)) return false;       // vanished local package
      return true;                                   // std import: keep
    }).join('\n');
    return { relPath: base, code };
  });
}

function applyVariant(files: StagedSourceFile[], mod: string): StagedSourceFile[] {
  if (variant === 'raw') return files;
  if (variant === 'single') return toSingleMain(files);
  // current
  return files.map((f) => {
    const s = sanitizeNonTsSource(f.code, 'go', f.relPath, { goModuleName: mod });
    return s ? { ...f, code: s } : f;
  });
}

async function main() {
  const dirs = fs.readdirSync(EXPORTS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((n) => collectGo(path.join(EXPORTS, n)).length > 0)
    .sort();

  console.log(`variant=${variant}  exports=${dirs.length}  GOPROXY=${process.env.GOPROXY || '(unset)'}\n`);
  let pass = 0, fail = 0;
  for (const d of dirs) {
    const files = collectGo(path.join(EXPORTS, d));
    const mod = sanitizeGoModuleName(d);
    const applied = applyVariant(files, mod);
    let verdict = 'ERROR', errors: string[] = [];
    try {
      const gates = await runNonTsProjectGates(applied, mod);
      const g = gates.find((x) => x.language === 'go');
      if (!g) { verdict = 'NO-GO-GATE'; }
      else if (g.clean) { verdict = 'PASS'; }
      else { verdict = 'FAIL'; errors = g.errors; }
    } catch (e: any) {
      errors = [`harness threw: ${e?.message || e}`];
    }
    if (verdict === 'PASS') pass++; else fail++;
    console.log(`${verdict.padEnd(6)} ${d}`);
    for (const e of errors.slice(0, 2)) console.log('        ' + e.replace(/\s+/g, ' ').slice(0, 150));
  }
  console.log(`\nTALLY: ${pass} PASS / ${fail} not-clean  (of ${dirs.length})`);
}


main().catch((e) => { console.error(e); process.exit(1); });
