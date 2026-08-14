import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PerFileScaffolder } from './perFileScaffolder.js';
import type { GeneratedFile } from '../layers/fileGenerator.js';

const scaffolder = new PerFileScaffolder();
let tmpDir: string;
let outputDir: string;

const files: GeneratedFile[] = [
  {
    fileName: 'timer-input.ts',
    language: 'typescript',
    code: `export class TimerInput {\n  readSeconds(): number { return 60; }\n}\n`,
    nodeId: 'n1',
    nodeLabel: 'timer-input.ts',
    dependencies: [],
    exports: ['TimerInput'],
    errors: [],
    validated: true,
  },
  {
    fileName: 'timer-logic.ts',
    language: 'typescript',
    code: `import { TimerInput } from '../timer-input/timer-input.ts';\nexport class CountdownTimer {\n  start(): void {}\n}\n`,
    nodeId: 'n2',
    nodeLabel: 'timer-logic.ts',
    dependencies: ['timer-input.ts'],
    exports: ['CountdownTimer'],
    errors: [],
    validated: true,
  },
];

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vaca-scaffold-test-'));
  const result = await scaffolder.scaffold({
    projectName: 'scaffold-test-app',
    targetOS: 'linux',
    files,
    nodes: [],
    edges: [],
    outputDir: tmpDir,
  });
  outputDir = result.outputPath;
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('PerFileScaffolder TS project config', () => {
  it('writes a tsconfig that compiles structurally: no rootDir conflict (TS6059), .ts import extensions allowed (TS5097), noEmit typecheck', () => {
    const tsconfig = JSON.parse(fs.readFileSync(path.join(outputDir, 'tsconfig.json'), 'utf-8'));
    // No rootDir at all → no TS6059 (index.ts at root + src/ files both included).
    expect(tsconfig.compilerOptions.rootDir).toBeUndefined();
    expect(tsconfig.compilerOptions.allowImportingTsExtensions).toBe(true);
    expect(tsconfig.compilerOptions.noEmit).toBe(true);
    expect(tsconfig.include).toContain('index.ts');
    expect(tsconfig.include).toContain('src/**/*.ts');
  });

  it('writes a start script that can actually run TypeScript (tsx, not node)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(outputDir, 'package.json'), 'utf-8'));
    expect(pkg.scripts.start).toBe('tsx index.ts');
    expect(pkg.scripts.build).toBe('tsc');
  });

  it('builds the entry point from the REAL exports of the generated files', () => {
    const entry = fs.readFileSync(path.join(outputDir, 'index.ts'), 'utf-8');
    // Must import the actual exported symbol names, never fabricated ones.
    expect(entry).toContain("import { TimerInput as TimerInput } from './src/timer-input/timer-input.ts'");
    expect(entry).toContain("import { CountdownTimer as CountdownTimer } from './src/timer-logic/timer-logic.ts'");
    // Side-effect import for files with no exports must not fabricate a name.
    expect(entry).not.toMatch(/import \{ \w+ \} from '\.\/src\/\w+-\w+\/(\w+)\.ts';/);
  });

  it('writes the generated source files under src/<node>/ with dirs matching the import paths', () => {
    // Dir names must match the generator's import paths (labelToFileName,
    // extension stripped) or every cross-file import breaks with TS2307.
    expect(fs.existsSync(path.join(outputDir, 'src', 'timer-input', 'timer-input.ts'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'src', 'timer-logic', 'timer-logic.ts'))).toBe(true);
    // And the node file's own sibling import must resolve: ../timer-input/timer-input.ts
    const logic = fs.readFileSync(path.join(outputDir, 'src', 'timer-logic', 'timer-logic.ts'), 'utf-8');
    expect(logic).toContain("from '../timer-input/timer-input.ts'");
    expect(fs.existsSync(path.join(outputDir, 'src', 'timer-input', 'timer-input.ts'))).toBe(true);
  });

  it('never imports a TYPE-ONLY export as a runtime value (the ESM entry crash)', async () => {
    const t1 = fs.mkdtempSync(path.join(os.tmpdir(), 'vaca-scaffold-types-'));
    try {
      const typeFiles: GeneratedFile[] = [
        {
          fileName: 'config.ts',
          language: 'typescript',
          code: `export interface Config {\n  port: number;\n}\nexport const config: Config = { port: 3000 };\nexport function validateConfig(c: Config): void {}\n`,
          nodeId: 'n1',
          nodeLabel: 'config.ts',
          dependencies: [],
          exports: ['Config', 'config', 'validateConfig'],
          errors: [],
          validated: true,
        },
      ];
      const res = await scaffolder.scaffold({
        projectName: 'types-first-app', targetOS: 'linux', files: typeFiles, nodes: [], edges: [], outputDir: t1,
      });
      const entry = fs.readFileSync(path.join(res.outputPath, 'index.ts'), 'utf-8');
      // The first export is the interface Config — it must NOT be imported.
      expect(entry).not.toContain("import { Config");
      expect(entry).toContain("import { config as config } from './src/config/config.ts'");
      // Type-only names must not be re-exported either (no runtime binding).
      expect(entry).not.toMatch(/^\s*Config,/m);
    } finally {
      fs.rmSync(t1, { recursive: true, force: true });
    }
  });

  it('bootstraps a non-UI project by calling its start/main entry', async () => {
    const t1 = fs.mkdtempSync(path.join(os.tmpdir(), 'vaca-scaffold-boot-'));
    try {
      const bootFiles: GeneratedFile[] = [
        {
          fileName: 'main.ts',
          language: 'typescript',
          code: `export function start(): void {\n  console.log('app started');\n}\n`,
          nodeId: 'n1',
          nodeLabel: 'main.ts',
          dependencies: [],
          exports: ['start'],
          errors: [],
          validated: true,
        },
      ];
      const res = await scaffolder.scaffold({
        projectName: 'boot-app', targetOS: 'linux', files: bootFiles, nodes: [], edges: [], outputDir: t1,
      });
      const entry = fs.readFileSync(path.join(res.outputPath, 'index.ts'), 'utf-8');
      expect(entry).toContain("if (typeof start === 'function') { start(); }");
    } finally {
      fs.rmSync(t1, { recursive: true, force: true });
    }
  });

  it('does NOT auto-bootstrap UI projects (the preview wrapper drives those)', async () => {
    const t1 = fs.mkdtempSync(path.join(os.tmpdir(), 'vaca-scaffold-ui-'));
    try {
      const uiFiles: GeneratedFile[] = [
        {
          fileName: 'ui.ts',
          language: 'typescript',
          code: `export function start(): void {\n  console.log('ui start');\n}\n`,
          nodeId: 'n1',
          nodeLabel: 'ui.ts',
          dependencies: [],
          exports: ['start'],
          errors: [],
          validated: true,
        },
      ];
      const res = await scaffolder.scaffold({
        projectName: 'ui-app', targetOS: 'linux', files: uiFiles, nodes: [{ id: 'n1', type: 'ui', position: { x: 0, y: 0 }, data: { label: 'ui.ts' } } as any], edges: [], outputDir: t1,
      });
      const entry = fs.readFileSync(path.join(res.outputPath, 'index.ts'), 'utf-8');
      expect(entry).not.toContain("start();");
    } finally {
      fs.rmSync(t1, { recursive: true, force: true });
    }
  });
});
