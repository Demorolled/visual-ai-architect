import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  architectureFromRea,
  architectureFromReferenceSource,
  classifyReaGraph,
  isHistoricalSourceGraph,
  referenceModuleKeyFor,
  deepScanWithRea,
  fileRecordsFromRea,
  isVendoredPath,
  moduleKeyFor,
  moduleTypeFor,
  nodeFilePath,
  nodeReference,
  normalizeReaPath,
  packageNameFromPath,
  packageNameFromSpecifier,
  planReaScan,
  resolveSpecifier,
} from './deepScan.js';
import { isReaInstalled } from './reaCli.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));

/** A real `rea analyze` envelope of an Electron + CRA todo app (see the fixture). */
const FIXTURE: any = JSON.parse(
  fs.readFileSync(join(HERE, '__fixtures__', 'rea-analyze-todo-app.json'), 'utf8'),
);

/** A real `rea import-reference-source` graph of a Java tic tac toe project. */
const JAVA_FIXTURE: any = JSON.parse(
  fs.readFileSync(join(HERE, '__fixtures__', 'rea-import-reference-source-java.json'), 'utf8'),
);

/** Write a throwaway tree and hand back its path. */
async function withTree(files: Record<string, string>, run: (dir: string) => void | Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'vaca-tree-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      const full = join(dir, rel);
      await mkdir(join(full, '..'), { recursive: true });
      await writeFile(full, content, 'utf8');
    }
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('planReaScan', () => {
  it('routes a directory to analyze (no engine needed)', () => {
    const plan = planReaScan(tmpdir());
    expect(plan.command).toBe('analyze');
    expect(plan.needsEngine).toBe(false);
    expect(plan.reason).toContain('directory');
  });

  it('routes by extension, flagging the commands that need an engine', () => {
    expect(planReaScan('/x/app.apk')).toMatchObject({ command: 'inspect-android-package', needsEngine: true });
    expect(planReaScan('/x/app.wasm')).toMatchObject({ command: 'inspect-wasm-artifact', needsEngine: false });
    expect(planReaScan('/x/capture.pcap')).toMatchObject({ command: 'inspect-pcap-capture', needsEngine: true });
    expect(planReaScan('/x/app.asar')).toMatchObject({ command: 'analyze', needsEngine: false });
  });

  it('falls back to the universal probe for anything else', () => {
    const plan = planReaScan('/x/mystery.exe');
    expect(plan.command).toBe('inspect-artifact');
    expect(plan.needsEngine).toBe(false);
  });
});

describe('planReaScan — which reader can open this directory?', () => {
  // `analyze` is a JAVASCRIPT application analyzer: on a Java tree it returns a
  // clean envelope with relevant_files: 0 and one unlabelled artifact node, so
  // the canvas stayed empty. Real Java trees route to the source importer.
  it('routes a Java source tree to the historical source importer', async () => {
    await withTree({ 'src/main/java/com/tictactoe/Main.java': 'public class Main {}' }, (dir) => {
      const plan = planReaScan(dir);
      expect(plan.command).toBe('import-reference-source');
      expect(plan.needsEngine).toBe(false);
      expect(plan.reason).toMatch(/no JavaScript/);
    });
  });

  it('routes a Python tree the same way', async () => {
    await withTree({ 'app/main.py': 'print("hi")' }, (dir) => {
      expect(planReaScan(dir).command).toBe('import-reference-source');
    });
  });

  it('still sends a JavaScript application to analyze', async () => {
    await withTree({ 'package.json': '{"name":"app"}', 'src/index.js': 'console.log(1)' }, (dir) => {
      expect(planReaScan(dir).command).toBe('analyze');
    });
  });

  it('treats a package.json alone as a Node project', async () => {
    await withTree({ 'package.json': '{"name":"app"}' }, (dir) => {
      expect(planReaScan(dir).command).toBe('analyze');
    });
  });

  it('ignores JavaScript buried in node_modules when deciding', async () => {
    await withTree({ 'node_modules/dep/index.js': 'module.exports = 1', 'Main.java': 'class Main {}' }, (dir) => {
      expect(planReaScan(dir).command).toBe('import-reference-source');
    });
  });

  it('needs no JavaScript at the top level either — a nested one still counts', async () => {
    await withTree({ 'src/main/java/App.java': 'class App {}', 'tools/scripts/build.js': 'console.log(1)' }, (dir) => {
      expect(planReaScan(dir).command).toBe('analyze');
    });
  });
});

describe('referenceModuleKeyFor', () => {
  it('keeps the whole package path, unlike the JavaScript module grouping', () => {
    expect(referenceModuleKeyFor('src/main/java/com/tictactoe/Board.java')).toBe('src/main/java/com/tictactoe');
    expect(moduleKeyFor('src/main/java/com/tictactoe/Board.java')).toBe('src/main');
    expect(referenceModuleKeyFor('run.sh')).toBe('(root)');
  });
});

describe('architectureFromReferenceSource (real Java source graph)', () => {
  const arch = architectureFromReferenceSource(JAVA_FIXTURE, {
    targetPath: '/home/someone/Desktop/tic tac toe',
  });

  it('is recognised as a source graph, and the analysis envelope is not', () => {
    expect(isHistoricalSourceGraph(JAVA_FIXTURE)).toBe(true);
    expect(isHistoricalSourceGraph(FIXTURE)).toBe(false);
    expect(isHistoricalSourceGraph(null)).toBe(false);
  });

  it('names the drop and reports the detected stack', () => {
    expect(arch.projectName).toBe('tic tac toe');
    expect(arch.projectType).toBe('java');
    expect(arch.frameworks).toContain('Java');
  });

  it('groups sources by their real Java package, not by a truncated path', () => {
    const pkg = arch.nodes.find((n) => n.label === 'src/main/java/com/tictactoe')!;
    expect(pkg).toBeTruthy();
    expect(pkg.files).toContain('src/main/java/com/tictactoe/Board.java');
    expect(pkg.files).toHaveLength(7);
    expect(pkg.language).toBe('java');
    // `ConsoleUI.java` must not drag the package into the `ui` bucket.
    expect(pkg.type).not.toBe('ui');
    expect(pkg.type).toBe('input');
  });

  it('puts compiled output in its own module, typed as output', () => {
    const out = arch.nodes.find((n) => n.label === 'out/com/tictactoe')!;
    expect(out.type).toBe('output');
    expect(out.files).toHaveLength(8);
    expect(out.files.every((f) => f.endsWith('.class'))).toBe(true);
  });

  it('keeps the root documents and the run script at the root', () => {
    const root = arch.nodes.find((n) => n.label === 'root')!;
    expect(root.files.sort()).toEqual(['README.md', 'run.sh']);
  });

  it('claims no dependencies, because the importer hashes instead of parsing', () => {
    expect(arch.externalDeps).toEqual([]);
    expect(arch.edges).toEqual([]);
    const notes = (arch.notes ?? []).join('\n');
    expect(notes).toMatch(/structural/);
    expect(notes).toMatch(/hashed, not parsed/);
  });

  it('carries the provenance, the language list and the importer’s own limits', () => {
    const notes = (arch.notes ?? []).join('\n');
    expect(notes).toMatch(/import-reference-source/);
    expect(notes).toMatch(/HistoricalSourceGraph/);
    expect(notes).toMatch(/Java, Markdown, Shell/);
    expect(notes).toMatch(/inventory state/i);
    expect(notes).toMatch(/Limitation:/);
    expect(notes).toMatch(/8 generated file/);
  });

  it('prefers an explicit display name', () => {
    expect(architectureFromReferenceSource(JAVA_FIXTURE, { displayName: 'Imported Game' }).projectName).toBe('Imported Game');
  });

  it('handles an empty inventory without inventing modules', () => {
    const empty = architectureFromReferenceSource({ schema: 'HistoricalSourceGraph', authority: 'historical-reference', entries: [] });
    expect(empty.nodes).toEqual([]);
    expect(empty.frameworks).toEqual([]);
    expect(empty.projectName).toBe('Imported source');
  });

  it('collapses the grouping only when a tree has too many directories', () => {
    const entries = Array.from({ length: 45 }, (_, i) => ({
      path: `module${i}/src/lib/deep/file${i}.java`,
      kind: 'file',
      language: 'Java',
      classifications: ['source'],
    }));
    const wide = architectureFromReferenceSource({ schema: 'HistoricalSourceGraph', entries, languages: ['Java'] });
    expect(wide.nodes).toHaveLength(45);
    expect(wide.notes!.join('\n')).toMatch(/grouped two levels deep/);
  });
});

describe('normalizeReaPath', () => {
  it('strips the hops a bundler or map root adds', () => {
    expect(normalizeReaPath('./src/a.ts')).toBe('src/a.ts');
    expect(normalizeReaPath('../node_modules/react/index.js')).toBe('node_modules/react/index.js');
    expect(normalizeReaPath('/static/js/chunk.js')).toBe('static/js/chunk.js');
  });
});

describe('nodeFilePath', () => {
  it('reads the path property for file-ish kinds', () => {
    const asset = { kind: 'javascript-asset', observations: [{ properties: { path: 'src/App.tsx' } }] };
    expect(nodeFilePath(asset)).toBe('src/App.tsx');
    const pkg = { kind: 'package', observations: [{ properties: { path: 'package.json', name: 'app' } }] };
    expect(nodeFilePath(pkg)).toBe('package.json');
  });

  it('reads a source-map original from identity', () => {
    const original = { kind: 'source-module', identity: { original_source: '../src/App.tsx' }, observations: [{}] };
    expect(nodeFilePath(original)).toBe('../src/App.tsx');
  });

  it('treats a source-module ROLE as the module it names', () => {
    const semantic = {
      kind: 'javascript-module',
      observations: [{ label: 'src/App.tsx', properties: { semantic_role: 'source-module' } }],
    };
    expect(nodeFilePath(semantic)).toBe('src/App.tsx');
  });

  it('never mistakes a reference or a semantic label for a file', () => {
    // The regression this exists for: `react` becoming a file in the project root.
    const reference = {
      kind: 'javascript-module',
      observations: [{ label: 'react', properties: { specifier: 'react', resolution_status: 'external' } }],
    };
    expect(nodeFilePath(reference)).toBeNull();

    const binding = {
      kind: 'javascript-module',
      observations: [{ label: 'src/App.tsx:default', properties: { semantic_role: 'export-binding', module_path: 'src/App.tsx' } }],
    };
    expect(nodeFilePath(binding)).toBeNull();
  });

  it('does not treat an electron entry node as a file', () => {
    // A declared entry that REA could not resolve must not be placed on the canvas.
    const main = {
      kind: 'electron-main',
      observations: [{ label: 'main.js', properties: { declared_path: 'main.js', resolution_status: 'not-found' } }],
    };
    expect(nodeFilePath(main)).toBeNull();
  });
});

describe('nodeReference', () => {
  it('reads both specifier forms REA uses', () => {
    const staticImport = {
      kind: 'javascript-module',
      observations: [{ properties: { specifier: './TaskList', resolution_status: 'not-found', reference_kind: 'static-import' } }],
    };
    const moduleRef = {
      kind: 'javascript-module',
      observations: [{ properties: { declared_specifier: 'react', resolution_status: 'external', semantic_role: 'module-reference' } }],
    };
    expect(nodeReference(staticImport)).toMatchObject({ specifier: './TaskList', external: false });
    expect(nodeReference(moduleRef)).toMatchObject({ specifier: 'react', external: true });
  });

  it('returns null for non-reference nodes', () => {
    expect(nodeReference({ kind: 'javascript-asset', observations: [{ properties: { path: 'a.js' } }] })).toBeNull();
    expect(nodeReference({ kind: 'javascript-module', observations: [{ properties: { semantic_role: 'source-module' } }] })).toBeNull();
  });
});

describe('packageNameFromSpecifier', () => {
  it('resolves a package from a subpath and keeps scopes intact', () => {
    expect(packageNameFromSpecifier('react-dom/client')).toBe('react-dom');
    expect(packageNameFromSpecifier('@scope/pkg/sub')).toBe('@scope/pkg');
    expect(packageNameFromSpecifier('scheduler')).toBe('scheduler');
  });

  it('keeps node builtins visibly distinct and rejects relative specifiers', () => {
    expect(packageNameFromSpecifier('node:fs')).toBe('node:fs');
    expect(packageNameFromSpecifier('./TaskList')).toBe('');
    expect(packageNameFromSpecifier('/abs/path')).toBe('');
    expect(packageNameFromSpecifier('')).toBe('');
  });
});

describe('isVendoredPath / packageNameFromPath', () => {
  it('spots bundled dependencies and names them', () => {
    expect(isVendoredPath('node_modules/react/index.js')).toBe(true);
    expect(isVendoredPath('src/App.tsx')).toBe(false);
    expect(packageNameFromPath('node_modules/@scope/pkg/index.js')).toBe('@scope/pkg');
    expect(packageNameFromPath('node_modules/react/index.js')).toBe('react');
    expect(packageNameFromPath('src/App.tsx')).toBe('');
  });
});

describe('resolveSpecifier', () => {
  const known = new Set(['src/TaskList.tsx', 'src/lib/index.js', 'src/plain.js']);

  it('resolves an extension-less specifier against a real file', () => {
    expect(resolveSpecifier('./TaskList', 'src/App.tsx', known)).toBe('src/TaskList.tsx');
  });

  it('resolves a specifier that already names the file, and a directory index', () => {
    expect(resolveSpecifier('./plain.js', 'src/App.tsx', known)).toBe('src/plain.js');
    expect(resolveSpecifier('./lib', 'src/App.tsx', known)).toBe('src/lib/index.js');
  });

  it('refuses to invent a connection for a specifier it cannot place', () => {
    expect(resolveSpecifier('./Missing', 'src/App.tsx', known)).toBeNull();
    expect(resolveSpecifier('react', 'src/App.tsx', known)).toBeNull();
    expect(resolveSpecifier('./TaskList', '', known)).toBeNull();
  });
});

describe('moduleKeyFor / moduleTypeFor', () => {
  it('groups files by their directory, collapsing deep trees', () => {
    expect(moduleKeyFor('package.json')).toBe('(root)');
    expect(moduleKeyFor('src/App.tsx')).toBe('src');
    expect(moduleKeyFor('build/static/js/main.js')).toBe('build/static');
  });

  it('types a build directory as output, a markup folder as ui and tests as logic', () => {
    expect(moduleTypeFor('build', ['build/index.html'])).toBe('output');
    // Order-independent: the html file is not last in this list.
    expect(moduleTypeFor('public', ['public/index.html', 'public/manifest.json'])).toBe('ui');
    expect(moduleTypeFor('src/api', ['src/api/routes.ts'])).toBe('api');
    expect(moduleTypeFor('__tests__', ['__tests__/toast.test.ts'])).toBe('logic');
  });
});

describe('classifyReaGraph (real REA envelope)', () => {
  it('separates files, references and electron roles', () => {
    const facts = classifyReaGraph(FIXTURE);

    expect(facts.files.length).toBeGreaterThan(0);
    expect(facts.references.length).toBeGreaterThan(0);
    expect(facts.references.some((r) => r.specifier === 'react' && r.external)).toBe(true);
    expect(facts.references.some((r) => r.specifier === './TaskList' && !r.external)).toBe(true);
    expect(facts.electronRoles).toEqual([
      expect.objectContaining({ role: 'main', status: 'not-found' }),
      expect.objectContaining({ role: 'renderer' }),
    ]);
  });

  it('marks source-map originals under node_modules as vendored', () => {
    const records = fileRecordsFromRea(FIXTURE);
    const vendored = records.filter((r) => r.vendored);
    expect(vendored.length).toBeGreaterThan(0);
    expect(vendored.every((r) => r.path.startsWith('node_modules/'))).toBe(true);
    expect(vendored.some((r) => r.path.startsWith('node_modules/react/'))).toBe(true);
  });

  it('tolerates an envelope with no graph at all', () => {
    const facts = classifyReaGraph({ evidence_id: 'ev_1' });
    expect(facts.files).toEqual([]);
    expect(facts.references).toEqual([]);
    expect(facts.electronRoles).toEqual([]);
  });
});

describe('architectureFromRea (real REA envelope)', () => {
  const arch = architectureFromRea(FIXTURE, { targetPath: '/tmp/todo-app' });

  it('names the project from its own package manifest and detects the stack', () => {
    expect(arch.projectName).toBe('todo-app');
    expect(arch.frameworks).toContain('electron');
    expect(arch.frameworks).toContain('React');
    expect(arch.projectType).toBe('fullstack');
  });

  it('builds one node per directory, carrying that directory’s files', () => {
    const labels = arch.nodes.map((n) => n.label);
    expect(labels).toContain('src');
    expect(labels).toContain('build');

    const src = arch.nodes.find((n) => n.label === 'src')!;
    expect(src.files).toContain('src/App.tsx');
    expect(src.files).toContain('src/TaskList.tsx');
    expect(src.type).toBe('input');
    expect(src.language).toBe('typescript');
  });

  it('does not call a single app\'s folders "sibling apps"', () => {
    // `build`, `public` and `src` are one app's directories, not three apps.
    expect(arch.apps).toBeUndefined();
  });

  it('reports sibling apps only when the top-level folders carry their own manifest', () => {
    const twoApps: any = {
      normalized_result: {
        graph: {
          nodes: [
            { node_id: 'a', kind: 'package', observations: [{ properties: { path: 'frontend/package.json', name: 'frontend-app' } }] },
            { node_id: 'b', kind: 'package', observations: [{ properties: { path: 'backend/package.json', name: 'backend-api' } }] },
            { node_id: 'c', kind: 'javascript-asset', observations: [{ properties: { path: 'frontend/src/a.js' } }] },
            { node_id: 'd', kind: 'javascript-asset', observations: [{ properties: { path: 'backend/src/b.js' } }] },
          ],
          edges: [],
        },
        summary: {},
        statistics: {},
      },
      subject: { name: 'my-monorepo', format: 'directory' },
    };
    const multi = architectureFromRea(twoApps);
    expect(multi.apps).toEqual(['backend', 'frontend']);
    // One app's manifest must not name the whole drop.
    expect(multi.projectName).toBe('my-monorepo');
  });

  it('keeps reference specifiers and bundler-virtual modules off the canvas', () => {
    const allFiles = arch.nodes.flatMap((n) => n.files);
    // `react` is a dependency, never a file in the project root.
    expect(allFiles).not.toContain('react');
    expect(allFiles).not.toContain('react-dom');
    expect(allFiles).not.toContain('webpack/bootstrap');
    // A source-map original named `TaskInput.tsx` resolves to the one file with
    // that name instead of duplicating it at the project root.
    expect(allFiles).not.toContain('TaskInput.tsx');
    expect(allFiles).toContain('src/TaskInput.tsx');
  });

  it('draws the measured file-to-file imports', () => {
    const edges = arch.edges.map((e) => `${e.source}->${e.target}`);
    expect(edges).toContain('src/App.tsx->src/TaskList.tsx');
    expect(edges).toContain('src/App.tsx->src/TaskInput.tsx');
    expect(edges).toContain('src/index.tsx->src/App.tsx');

    const edge = arch.edges.find((e) => e.source === 'src/App.tsx' && e.target === 'src/TaskList.tsx')!;
    expect(edge.description).toContain('App.tsx imports');
  });

  it('reports dependencies REA measured, attributed to the files that import them', () => {
    const byName = new Map((arch.externalDeps ?? []).map((d) => [d.name, d]));
    expect(byName.get('react')).toMatchObject({ kind: 'package' });
    expect(byName.get('react')!.usedBy).toContain('src/App.tsx');
    expect(byName.get('react-dom')!.usedBy).toContain('src/index.tsx');
    // Bundled dependency originals are evidence too, even without a specifier.
    expect([...byName.keys()]).toContain('scheduler');
  });

  it('carries the evidence and REA’s limits into the notes', () => {
    const notes = (arch.notes ?? []).join('\n');
    expect(notes).toMatch(/Scan engine: REA/);
    expect(notes).toContain(FIXTURE.evidence_id);
    expect(notes).toMatch(/Limitation:/);
    expect(notes).toMatch(/bundler-virtual module/);
    expect(notes).toMatch(/Electron main entry: index\.tsx \(not-found\)/);
  });

  it('caps the limitation lines and says how many it did not show', () => {
    const limitations = (arch.notes ?? []).filter((n) => n.startsWith('Limitation: '));
    expect(limitations.length).toBeLessThanOrEqual(6);
    const listed = FIXTURE.normalized_result.limitations as string[];
    if (listed.length > 6) {
      expect((arch.notes ?? []).some((n) => n.includes(`more limitation`))).toBe(true);
    }
  });

  it('is deterministic', () => {
    expect(architectureFromRea(FIXTURE)).toEqual(architectureFromRea(FIXTURE));
  });

  it('prefers an explicit display name over the manifest name', () => {
    expect(architectureFromRea(FIXTURE, { displayName: 'My Drop' }).projectName).toBe('My Drop');
  });
});

describe('deepScanWithRea', () => {
  it('refuses a relative path with an actionable message', async () => {
    const outcome = await deepScanWithRea('relative/path');
    expect(outcome.architecture).toBeNull();
    expect(outcome.error).toMatch(/absolute path/);
    expect(outcome.hint).toBeNull();
  });

  it('reports a missing target without spawning anything', async () => {
    const outcome = await deepScanWithRea('/definitely/not/here/app.apk');
    expect(outcome.architecture).toBeNull();
    expect(outcome.error).toMatch(/does not exist/);
    expect(outcome.run).toBeNull();
  });

  it.skipIf(!isReaInstalled())(
    'scans a real directory end to end',
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'vaca-deep-scan-'));
      try {
        await mkdir(join(dir, 'src'), { recursive: true });
        await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'tiny-app', version: '1.0.0', main: 'src/index.js' }));
        await writeFile(join(dir, 'src', 'math.js'), 'export function add(a, b) { return a + b; }\n');
        await writeFile(join(dir, 'src', 'index.js'), 'import { add } from "./math.js";\nconsole.log(add(1, 2));\n');

        const phases: string[] = [];
        const outcome = await deepScanWithRea(dir, { timeoutMs: 180_000, onProgress: (p) => phases.push(p) });

        expect(outcome.error).toBeNull();
        expect(outcome.architecture).not.toBeNull();
        const arch = outcome.architecture!;
        expect(arch.projectName).toBe('tiny-app');
        expect(arch.nodes.map((n) => n.label)).toContain('src');

        const allFiles = arch.nodes.flatMap((n) => n.files);
        expect(allFiles).toContain('src/index.js');
        expect(allFiles).toContain('src/math.js');
        // The measured import between the two files is on the canvas.
        expect(arch.edges.map((e) => `${e.source}->${e.target}`)).toContain('src/index.js->src/math.js');

        expect(outcome.evidence.providerId).toBeTruthy();
        expect(outcome.evidence.operation).toBe('analyze_javascript_application');
        expect(outcome.evidence.evidenceId).toBeTruthy();
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    240_000,
  );
});
