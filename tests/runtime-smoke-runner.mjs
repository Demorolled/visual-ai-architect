#!/usr/bin/env node

/**
 * runtime-smoke-runner.mjs — click-through runtime smoke tests for GENERATED apps
 *
 * Unlike tests/test-runner.mjs (which tests the hand-built HTML apps in
 * projects/), this runner tests apps produced by the VACA generation pipeline:
 * exported/scaffolded apps, dropped-folder previews, or any file set that came
 * out of FileGenerator. It boots the app in headless Chromium, clicks every
 * visible button, types into every input, and reports whether the assembled
 * app actually responds — not just whether it compiles.
 *
 * Usage:
 *   node tests/runtime-smoke-runner.mjs --dir=/path/to/app          # folder with index.html
 *   node tests/runtime-smoke-runner.mjs --json=/path/result.json   # { files: [{fileName, code}] }
 *   node tests/runtime-smoke-runner.mjs --dir=./backend/exports     # scan subfolders for index.html
 *   node tests/runtime-smoke-runner.mjs --preview=<id>              # a dropped-folder preview id
 *   node tests/runtime-smoke-runner.mjs --all                       # scan exports/ + site previews
 *
 * Uses the shared engine in backend/src/sandbox/runtimeSmokeTest.ts (TS). Run
 * with a TS-aware loader:
 *   node --experimental-strip-types tests/runtime-smoke-runner.mjs ...   (Node >=22)
 *   npx tsx tests/runtime-smoke-runner.mjs ...                            (any Node)
 * Exit code 0 = all apps passed, 1 = any failed/unavailable, 2 = usage error.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const BACKEND_ENGINE = join(PROJECT_ROOT, 'backend', 'src', 'sandbox', 'runtimeSmokeTest.ts');

const args = process.argv.slice(2);
const opts = { dir: null, json: null, preview: null, all: false, help: false };
for (const a of args) {
  if (a === '--help' || a === '-h') opts.help = true;
  else if (a.startsWith('--dir=')) opts.dir = a.slice(6);
  else if (a.startsWith('--json=')) opts.json = a.slice(7);
  else if (a.startsWith('--preview=')) opts.preview = a.slice(10);
  else if (a === '--all') opts.all = true;
}

if (opts.help) {
  console.log(`
Runtime Smoke Runner — click-through tests for generated apps

Usage:
  --dir=<path>     Run against a folder containing index.html (an exported app)
  --json=<path>    Run against a JSON file with { files: [{fileName, code}] }
  --preview=<id>   Run against a dropped-folder preview (tmpdir/vaca-site-previews/<id>)
  --all            Scan backend/exports + site previews for every app
  --help           This help

Engine: backend/src/sandbox/runtimeSmokeTest.ts (shared with the generation pipeline)
`);
  process.exit(0);
}

// ── Collect apps ──
function readJsonApp(p) {
  const raw = JSON.parse(readFileSync(p, 'utf-8'));
  const files = Array.isArray(raw) ? raw : raw.files;
  if (!Array.isArray(files)) throw new Error(`"${p}" has no { files: [...] } array`);
  return { name: p, files: files.map((f) => ({ fileName: f.fileName, code: f.code })) };
}

function folderApp(dir) {
  const index = join(dir, 'index.html');
  if (!existsSync(index)) throw new Error(`No index.html in "${dir}"`);
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isFile()) files.push({ fileName: name, code: readFileSync(full, 'utf-8') });
  }
  return { name: dir, files };
}

const apps = [];
try {
  if (opts.dir) apps.push(folderApp(resolve(PROJECT_ROOT, opts.dir)));
  if (opts.json) apps.push(readJsonApp(resolve(PROJECT_ROOT, opts.json)));
  if (opts.preview) {
    const { tmpdir } = await import('os');
    apps.push(folderApp(join(tmpdir(), 'vaca-site-previews', opts.preview)));
  }
  if (opts.all) {
    const { tmpdir } = await import('os');
    const scan = (root, baseName) => {
      if (!existsSync(root)) return;
      for (const name of readdirSync(root)) {
        const full = join(root, name);
        if (!statSync(full).isDirectory()) continue;
        if (existsSync(join(full, 'index.html'))) apps.push(folderApp(full));
      }
      void baseName;
    };
    scan(join(PROJECT_ROOT, 'backend', 'exports'), 'exports');
    scan(join(tmpdir(), 'vaca-site-previews'), 'previews');
  }
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(2);
}

if (apps.length === 0) {
  console.error('❌ No apps given. Use --dir, --json, --preview, or --all.');
  process.exit(2);
}

// ── Run via the shared engine ──
const { runRuntimeSmokeTest, formatSmokeResult } = await import(BACKEND_ENGINE);

let passed = 0, failed = 0, unavailable = 0;
const failures = [];

for (const app of apps) {
  console.log(`\n🧪 ${app.name}`);
  const result = await runRuntimeSmokeTest(app.files);
  console.log(formatSmokeResult(result));
  if (!result.available) unavailable++;
  else if (result.success) passed++;
  else { failed++; failures.push(app.name); }
}

console.log(`\n════════════════════════════════════════════`);
console.log(`   Apps: ${apps.length} · PASS ${passed} · FAIL ${failed} · UNAVAILABLE ${unavailable}`);
console.log(`════════════════════════════════════════════`);
if (failures.length) console.log(`   Failed: ${failures.join(', ')}`);

process.exit(failed > 0 ? 1 : 0);
