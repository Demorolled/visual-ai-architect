// TEMPORARY verification script (deleted after the run) — applies the real
// resolver to the REAL round-3 generated sources and writes the resolved tree
// out so the real toolchains can build it.
import * as fs from 'fs';
import * as path from 'path';
import { resolveCrossFileDuplicates } from './src/sandbox/duplicateDeclarations.js';

const ROOT = '/tmp/vaca-app-tests5';
const OUT = '/tmp/vaca-dedupe-proof';

function collect(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (['obj', 'bin', '.git', 'node_modules', '.build', 'app'].includes(e.name)) continue;
        walk(p);
      } else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

const APPS = [
  {
    slug: 'swift-temp-log',
    sub: 'a-command-line-temperature-log-in-swift',
    lang: 'swift',
    exts: ['.swift'],
    desc: 'Record temperatures from the command line and report the average',
  },
  {
    slug: 'csharp-budget-cli',
    sub: 'a-command-line-budget-tracker-in-c',
    lang: 'csharp',
    exts: ['.cs'],
    desc: 'Track budget entries from the command line and print the balance',
  },
];

let exitCode = 0;
for (const app of APPS) {
  const srcDir = path.join(ROOT, app.slug, app.sub);
  const outDir = path.join(OUT, app.slug);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.cpSync(srcDir, outDir, { recursive: true });
  for (const junk of ['obj', 'bin', 'app', '.build']) {
    fs.rmSync(path.join(outDir, junk), { recursive: true, force: true });
  }

  const paths = collect(outDir, app.exts).map((p) => path.relative(outDir, p).split(path.sep).join('/'));
  const files = paths.map((p) => ({ path: p, content: fs.readFileSync(path.join(outDir, p), 'utf-8') }));
  const contracts = paths.map((p) => {
    const dir = path.dirname(p).split('/').pop() || '';
    return {
      path: p,
      language: app.lang,
      summary: /^main\./.test(p) ? '' : `${dir}: ${app.desc}`,
      exports: [] as string[],
    };
  });

  const res = resolveCrossFileDuplicates(files, contracts);
  console.log(`\n=== ${app.slug} (${files.length} source files)`);
  if (!res.notes.length) console.log('  no duplicates found');
  for (const n of res.notes) {
    console.log(`  ${n.action.toUpperCase()} '${n.symbol}' in ${n.path} (owner ${n.ownerPath})${n.newName ? ` -> ${n.newName}` : ''}`);
  }
  for (const f of res.failures) console.log(`  UNRESOLVED: ${f}`);
  for (const f of files) {
    const onDisk = fs.readFileSync(path.join(outDir, f.path), 'utf-8');
    if (onDisk !== f.content) {
      fs.writeFileSync(path.join(outDir, f.path), f.content, 'utf-8');
      console.log(`  wrote ${f.path}`);
    }
  }
  if (res.failures.length) exitCode = 1;
}
console.log(`\nPROOF_EXIT=${exitCode}`);
