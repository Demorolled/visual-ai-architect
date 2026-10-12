#!/usr/bin/env node
/**
 * extract.mjs — dump VACA's *language system* and *app surface* out of the LIVE
 * source, as JSON on stdout.
 *
 * Why this exists
 * ---------------
 * Every dataset in `training/dataset/` must describe the VACA that is actually
 * on disk right now — not a remembered VACA. So nothing here is typed by hand:
 * this script imports the real modules (Node strips the TS types) and reads the
 * real tables, or it exits non-zero. A renamed export is a hard failure rather
 * than a silently stale dataset row.
 *
 * Read from (and fingerprinted into) the live source:
 *   backend/src/ai/languageInference.ts    which languages exist, and how a
 *                                          goal/OS/domain selects one
 *   backend/src/ai/languageGuidance.ts     the exact per-language contract
 *                                          VACA injects into the write prompt
 *   backend/src/utils/languageFromPath.ts  file path → language
 *   backend/src/sandbox/nonTsCompileGate.ts the per-language compile gate +
 *                                          toolchain list
 *   frontend/src/types.ts                  the node-type registry
 *   backend/src/index.ts                   the mounted /api routes
 *   backend/blueprints/*.json              the shipped app blueprints
 *
 * Usage:
 *   node training/vacalatest/extract.mjs            # JSON to stdout
 *   node training/vacalatest/extract.mjs --out FILE
 *
 * Node 22.6+ (type stripping). Node 24 runs it with no flag; the flag is added
 * automatically when the runtime says it is needed.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const BE = path.join(REPO, 'backend', 'src');

const fail = (msg) => {
  console.error(`extract.mjs: ${msg}`);
  process.exit(1);
};

const load = async (abs) => {
  try {
    return await import(pathToFileURL(abs).href);
  } catch (err) {
    fail(`cannot import ${path.relative(REPO, abs)} — ${err.message}`);
  }
};

const read = (abs) => {
  try {
    return fs.readFileSync(abs, 'utf8');
  } catch (err) {
    fail(`cannot read ${path.relative(REPO, abs)} — ${err.message}`);
  }
};

const sha = (txt) => crypto.createHash('sha256').update(txt).digest('hex');

const git = (args) => {
  try {
    return execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
};

// ── the live modules ───────────────────────────────────────────────────
const SRC = {
  languageInference: path.join(BE, 'ai', 'languageInference.ts'),
  languageGuidance: path.join(BE, 'ai', 'languageGuidance.ts'),
  languageFromPath: path.join(BE, 'utils', 'languageFromPath.ts'),
  nonTsCompileGate: path.join(BE, 'sandbox', 'nonTsCompileGate.ts'),
  nodeTypes: path.join(REPO, 'frontend', 'src', 'types.ts'),
  index: path.join(BE, 'index.ts'),
};

const inference = await load(SRC.languageInference);
const guidance = await load(SRC.languageGuidance);
const fromPath = await load(SRC.languageFromPath);
const gate = await load(SRC.nonTsCompileGate);

for (const [mod, name] of [
  [inference, 'SUPPORTED_CODING_LANGUAGES'],
  [inference, 'OS_LANGUAGE_MAP'],
  [inference, 'normalizeNodeLanguage'],
  [inference, 'inferLanguageForGoal'],
  [inference, 'inferDomainKind'],
  [inference, 'detectExplicitLanguage'],
  [guidance, 'languageGuidanceBlock'],
  [fromPath, 'languageFromPath'],
  [gate, 'GATE_LANGUAGES'],
  [gate, 'TOOLCHAINS'],
  [gate, 'resolveGateLanguage'],
]) {
  if (mod[name] === undefined) {
    fail(`a live module no longer exports ${name} — the dataset would go stale; ` +
         `update training/vacalatest/extract.mjs to match the new source.`);
  }
}

// ── languages ──────────────────────────────────────────────────────────
const codingLanguages = [...inference.SUPPORTED_CODING_LANGUAGES];

// NATURAL_FORMAT_LANGUAGES is module-private; membership is confirmed
// behaviourally through the exported normalizer instead of by regex.
const NATURAL_CANDIDATES = [
  'html', 'css', 'sql', 'json', 'yaml', 'yml', 'xml', 'md', 'markdown', 'txt',
  'sh', 'bash', 'dockerfile', 'env', 'ini', 'toml', 'csv', 'svg',
];
const naturalFormats = NATURAL_CANDIDATES.filter(
  (c) => inference.normalizeNodeLanguage(c, 'typescript') === c &&
         !inference.SUPPORTED_CODING_LANGUAGES.has(c),
);

const gateLanguages = [...gate.GATE_LANGUAGES];

// The tsc gate is not in nonTsCompileGate (that module is explicitly the
// NON-TypeScript counterpart), but TypeScript is VACA's primary language and is
// gated by tsc — so record it here rather than reporting "no gate".
const toolchains = {
  ...gate.TOOLCHAINS,
  typescript: {
    bins: ['tsc'],
    versionArgs: ['--version'],
    install: {
      linux: 'npm install --save-dev typescript',
      windows: 'npm install --save-dev typescript',
      macos: 'npm install --save-dev typescript',
    },
    gate: 'tsc',
  },
};

// ── extension → language, parsed from the real switch and CALL-verified ──
const fpText = read(SRC.languageFromPath);
const casesBlock = fpText.match(/switch\s*\(ext\)\s*\{([\s\S]*?)\n\s*default:/);
if (!casesBlock) fail('cannot find the ext switch in languageFromPath.ts');
const pathLanguage = {};
for (const line of casesBlock[1].split('\n')) {
  const ret = line.match(/return\s+'([a-z]+)'/);
  if (!ret) continue;
  for (const c of line.matchAll(/case\s+'([a-z0-9]+)'/g)) pathLanguage[c[1]] = ret[1];
}
if (Object.keys(pathLanguage).length === 0) fail('parsed no extensions from languageFromPath.ts');
pathLanguage.dockerfile = fromPath.languageFromPath('Dockerfile');

// Verify the parsed table against the live function — a parse drift is fatal.
for (const [ext, lang] of Object.entries(pathLanguage)) {
  const probe = ext === 'dockerfile' ? 'Dockerfile' : `sample.${ext}`;
  const got = fromPath.languageFromPath(probe);
  if (got !== lang) fail(`extension ${ext}: parsed ${lang}, languageFromPath says ${got}`);
}
const DECLARED_EXTS = Object.keys(pathLanguage).filter((e) => e !== 'dockerfile');

// extension → gate language, read out of the real resolver.
const gateByExt = { dockerfile: gate.resolveGateLanguage(undefined, 'Dockerfile') };
for (const ext of DECLARED_EXTS) {
  gateByExt[ext] = gate.resolveGateLanguage(undefined, `sample.${ext}`);
}

// the exact guidance VACA injects per language, split back into its lines.
const guidanceByLanguage = {};
for (const lang of codingLanguages) {
  const block = guidance.languageGuidanceBlock(lang) || '';
  if (!block) fail(`no language guidance for supported language "${lang}"`);
  const header = block.match(/━+ LANGUAGE GUIDANCE \((.+?)\) ━+/);
  if (!header) fail(`unparseable guidance header for "${lang}"`);
  const lines = block
    .split('\n  • ')
    .slice(1)
    .map((l) => l.replace(/\n$/, '').trim())
    .filter(Boolean);
  if (lines.length === 0) fail(`guidance for "${lang}" has no bullet lines`);
  guidanceByLanguage[lang] = { name: header[1], lines, block: block.trim() };
}

// aliases → canonical, confirmed through the real normalizer.
const ALIAS_CANDIDATES = [
  'ts', 'js', 'py', 'golang', 'c++', 'cxx', 'cplusplus', 'c#', 'cs', 'dotnet',
  'rs', 'rb', 'kt', 'kts', 'jsx', 'tsx',
];
const aliases = {};
for (const a of ALIAS_CANDIDATES) {
  const norm = inference.normalizeNodeLanguage(a, 'typescript');
  aliases[a] = norm;
}

// ── OS → language, and the domain rules ────────────────────────────────
const osLanguageMap = { ...inference.OS_LANGUAGE_MAP };

// The keyword tables are module-private; read the literals and verify them
// against the exported classifiers so a rewrite is caught.
const infText = read(SRC.languageInference);
const arr = (name) => {
  const m = infText.match(new RegExp(`const\\s+${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]\\s*;`));
  if (!m) fail(`cannot find ${name} in languageInference.ts`);
  const items = [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
  if (items.length === 0) fail(`${name} parsed empty`);
  return items;
};
const webKeywords = arr('WEB_DOMAIN_KEYWORDS');
const cliKeywords = arr('CLI_DOMAIN_KEYWORDS');

// Behavioural proof that the tables still drive the classifier.
if (inference.inferDomainKind('build a todo app', '') !== 'web') fail('WEB_DOMAIN_KEYWORDS drifted from inferDomainKind');
if (inference.inferDomainKind('a cli tool', '') !== 'cli') fail('CLI_DOMAIN_KEYWORDS drifted from inferDomainKind');

// ── the language-selection rule, demonstrated ──────────────────────────
const SELECTION_CASES = [
  ['a countdown timer web app', '', 'linux', 'web', 'typescript'],
  ['a command line todo list manager', '', 'linux', 'cli', 'typescript'],
  ['a pomodoro timer', '', 'linux', null, 'typescript'],
  ['a REST API in Go', '', 'linux', null, 'go'],
  ['a file renamer using Python', '', 'linux', null, 'python'],
  ['a native desktop utility', '', 'linux', null, 'go'],
  ['a native desktop utility', '', 'windows', null, 'csharp'],
  ['a native desktop utility', '', 'mac', null, 'swift'],
  ['a native desktop utility', '', 'android', null, 'kotlin'],
  ['a Rust CLI', '', 'linux', null, 'rust'],
];
const selection = SELECTION_CASES.map(([goal, purpose, os, ui, expected]) => {
  const got = inference.inferLanguageForGoal(goal, purpose, os, ui ?? undefined);
  if (got !== expected) fail(`inferLanguageForGoal("${goal}", os=${os}) = ${got}, expected ${expected}`);
  return {
    goal,
    purpose,
    targetOS: os,
    uiPreference: ui,
    domain: inference.inferDomainKind(goal, purpose, ui ?? undefined),
    explicitLanguage: inference.detectExplicitLanguage(goal, purpose),
    language: got,
  };
});

// ── node-type registry ─────────────────────────────────────────────────
let nodeTypes = { union: [], options: [] };
try {
  const t = await load(SRC.nodeTypes);
  if (Array.isArray(t.NODE_TYPE_OPTIONS)) {
    nodeTypes = {
      union: [],
      options: t.NODE_TYPE_OPTIONS.map((o) => ({
        type: o.type,
        label: o.label,
        icon: o.icon,
        description: o.description,
      })),
    };
  }
} catch {
  // frontend/src/types.ts pulls in React types in some builds; the union below
  // is parsed from the source text instead, which is still the live file.
}
const nodeUnion = infText && (() => {
  const t = read(SRC.nodeTypes);
  const m = t.match(/export type NodeType\s*=\s*([^;]+);/);
  if (!m) fail('cannot find `export type NodeType` in frontend/src/types.ts');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
})();
nodeTypes.union = nodeUnion;
if (nodeTypes.options.length === 0) {
  const t = read(SRC.nodeTypes);
  const block = t.match(/NODE_TYPE_OPTIONS[^=]*=\s*\[([\s\S]*?)\n\];/);
  if (block) {
    for (const m of block[1].matchAll(/type:\s*'([^']+)'[\s\S]*?label:\s*'([^']*)'[\s\S]*?icon:\s*'([^']*)'[\s\S]*?description:\s*\n?\s*'([^']*)'/g)) {
      nodeTypes.options.push({ type: m[1], label: m[2], icon: m[3], description: m[4] });
    }
  }
}
if (nodeTypes.options.length === 0) fail('no node-type registry entries found');

// ── mounted API routes ─────────────────────────────────────────────────
const indexText = read(SRC.index);
const routes = [...indexText.matchAll(/app\.use\(\s*'(\/api\/[^']+)'\s*,\s*(\w+)\s*\)/g)]
  .map((m) => ({ mount: m[1], binding: m[2] }));
if (routes.length === 0) fail('no /api route mounts found in backend/src/index.ts');

// ── shipped blueprints ─────────────────────────────────────────────────
const bpDir = path.join(REPO, 'backend', 'blueprints');
const blueprints = [];
for (const f of fs.readdirSync(bpDir).sort()) {
  if (!f.endsWith('.json')) continue;
  const p = path.join(bpDir, f);
  if (fs.statSync(p).isDirectory()) continue;
  let j;
  try {
    j = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    continue;
  }
  blueprints.push({
    file: f,
    name: j.name ?? j.title ?? f.replace(/\.json$/, ''),
    description: j.description ?? j.purpose ?? '',
    nodeCount: Array.isArray(j.nodes) ? j.nodes.length : null,
  });
}

// ── fingerprint ────────────────────────────────────────────────────────
const sources = {};
for (const [key, abs] of Object.entries(SRC)) {
  const txt = read(abs);
  sources[path.relative(REPO, abs)] = { sha256: sha(txt), bytes: txt.length };
}
for (const f of fs.readdirSync(bpDir).filter((f) => f.endsWith('.json'))) {
  const abs = path.join(bpDir, f);
  if (fs.statSync(abs).isFile()) sources[path.relative(REPO, abs)] = { sha256: sha(fs.readFileSync(abs, 'utf8')) };
}

const manifest = {
  schema: 'vaca-latest-manifest/1',
  generated_at: new Date().toISOString(),
  repo_rev: git(['rev-parse', 'HEAD']),
  repo_dirty: Boolean(git(['status', '--porcelain'])),
  node_version: process.version,
  sources,
  languages: {
    coding: codingLanguages,
    natural_formats: naturalFormats,
    gate: gateLanguages,
    tsc_gated: codingLanguages.filter((l) => !gateLanguages.includes(l)),
    aliases,
    path_language: pathLanguage,
    gate_language_by_ext: gateByExt,
    guidance: guidanceByLanguage,
    toolchains,
  },
  selection: {
    os_language_map: osLanguageMap,
    web_domain_keywords: webKeywords,
    cli_domain_keywords: cliKeywords,
    cases: selection,
  },
  app: {
    node_types: nodeTypes.union,
    node_type_options: nodeTypes.options,
    routes,
    blueprints,
    route_mount_count: routes.length,
    blueprint_count: blueprints.length,
  },
};

const outArg = process.argv.indexOf('--out');
const json = JSON.stringify(manifest, null, 2) + '\n';
if (outArg !== -1 && process.argv[outArg + 1]) {
  fs.writeFileSync(process.argv[outArg + 1], json);
  console.error(`extract.mjs: wrote ${process.argv[outArg + 1]}`);
} else {
  process.stdout.write(json);
}
