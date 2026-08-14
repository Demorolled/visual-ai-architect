import { describe, it, expect } from 'vitest';
import {
  assembleLegacyPreviewJs,
  buildImportStatement,
  bundlePreviewJs,
  postProcessTsJsCode,
  projectGraphSignature,
  verifyGeneratedCodeContracts,
  type FileExportInfo,
  type GeneratedFile,
} from './fileGenerator.js';

function exp(names: string[], defaultName?: string): FileExportInfo {
  return { names, ...(defaultName ? { defaultName } : {}) };
}

describe('buildImportStatement', () => {
  it('builds a named import from a dependency with named exports', () => {
    expect(buildImportStatement('timer-input', exp(['TimerInput']), 'typescript'))
      .toBe("import { TimerInput } from '../timer-input/timer-input.ts';");
  });

  it('uses a default-only import when the dependency only default-exports', () => {
    expect(buildImportStatement('engine', exp([], 'CountdownEngine'), 'typescript'))
      .toBe("import CountdownEngine from '../engine/engine.ts';");
  });

  it('imports a dependency with no exports for its side effects', () => {
    expect(buildImportStatement('styles', exp([]), 'typescript'))
      .toBe("import '../styles/styles.ts';");
  });

  it('combines default and named imports when both exist', () => {
    expect(buildImportStatement('mod', exp(['Helper'], 'Main'), 'typescript'))
      .toBe("import Main, { Helper } from '../mod/mod.ts';");
  });

  it('handles python module naming (hyphens to underscores)', () => {
    expect(buildImportStatement('timer-logic', exp(['CountdownTimer']), 'python'))
      .toBe('from timer_logic import CountdownTimer');
  });
});

describe('verifyGeneratedCodeContracts', () => {
  const fileExports = new Map<string, FileExportInfo>([
    ['timer-input.ts', exp(['TimerInput'])],
    ['timer-logic.ts', exp(['CountdownTimer'])],
  ]);

  it('flags an import of a member the dependency never exports (TS2614)', () => {
    // Note: verifyGeneratedCodeContracts checks IMPORT statements — a member
    // ACCESS on an imported class (obj.inventedMember()) is the separate
    // findInventedMembers scan. This is the module-level contract form.
    const code = `import { onCompletion } from '../timer-input/timer-input.ts';\n`;
    const violations = verifyGeneratedCodeContracts(code, 'typescript', ['timer-input.ts'], fileExports);
    expect(violations.some(v => v.includes("TS2614") && v.includes("onCompletion"))).toBe(true);
  });

  it('flags an import of a module that is not a declared dependency (TS2307)', () => {
    const code = `import { Something } from '../other/other.ts';\n`;
    const violations = verifyGeneratedCodeContracts(code, 'typescript', ['timer-input.ts'], fileExports);
    expect(violations.some(v => v.includes("TS2307") && v.includes("other"))).toBe(true);
  });

  it('passes clean imports of declared dependencies', () => {
    const code = `import { TimerInput } from '../timer-input/timer-input.ts';\nconst t = new TimerInput();\nt.readSeconds();\n`;
    const violations = verifyGeneratedCodeContracts(code, 'typescript', ['timer-input.ts'], fileExports);
    expect(violations).toEqual([]);
  });

  it('flags stdlib default imports (they are not declared deps — the build strips them anyway)', () => {
    // Generated node files may ONLY import declared sibling dependencies; the
    // post-processor strips every other import, so the verifier flags them
    // rather than letting them silently break the build.
    const code = `import fs from 'fs';\nimport { TimerInput } from '../timer-input/timer-input.ts';\n`;
    const violations = verifyGeneratedCodeContracts(code, 'typescript', ['timer-input.ts'], fileExports);
    expect(violations.some(v => v.includes("TS2307") && v.includes("fs"))).toBe(true);
  });
});

describe('postProcessTsJsCode', () => {
  it('strips the AI-written leading import run (the build adds its own)', () => {
    const code = `import { TimerInput } from '../timer-input/timer-input.ts';\nimport fs from 'fs';\n\nexport class App {}\n`;
    expect(postProcessTsJsCode(code)).toBe('export class App {}');
  });

  it('strips mid-file column-0 imports', () => {
    const code = `export const a = 1;\nimport { x } from './y';\nexport const b = 2;\n`;
    expect(postProcessTsJsCode(code)).toBe('export const a = 1;\nexport const b = 2;');
  });

  it('keeps indented import-looking text (template literals, strings)', () => {
    const code = `const s = \`import { x } from 'y'\`;\nexport const a = 1;\n`;
    expect(postProcessTsJsCode(code)).toContain('export const a = 1;');
  });
});

describe('bundlePreviewJs (esbuild preview wiring)', () => {
  const mkFile = (over: Partial<GeneratedFile>): GeneratedFile => ({
    fileName: 'x.ts',
    language: 'typescript',
    code: 'export const x = 1;',
    nodeId: 'n',
    nodeLabel: 'x',
    dependencies: [],
    exports: [],
    errors: [],
    validated: true,
    ...over,
  });

  it('resolves cross-module imports into a single bundle', () => {
    const dep = mkFile({
      fileName: 'core-engine.ts',
      nodeLabel: 'core_engine',
      code: `export class ChessEngine {\n  move() { return 'ok'; }\n}`,
      exports: ['ChessEngine'],
    });
    const ui = mkFile({
      fileName: 'ui-screens.ts',
      nodeLabel: 'ui_screens',
      code: `import { ChessEngine } from '../core-engine/core-engine.ts';\nexport function render(container: HTMLElement): void {\n  container.textContent = new ChessEngine().move();\n}`,
      exports: ['render', 'createChessScreen'],
    });

    const bundled = bundlePreviewJs([dep, ui]);
    expect(bundled).not.toBeNull();
    // Dependency code is inlined (no elided-import ReferenceError possible):
    // the ChessEngine identifier + its move() body only exist in the dep file.
    expect(bundled).toContain('ChessEngine');
    expect(bundled).toContain('move()');
    // The entry point is called with #app-container.
    expect(bundled).toContain('render(document.getElementById(');
    // No stale import statement / no legacy namespace IIFE.
    expect(bundled).not.toContain("from '../core-engine/core-engine.ts'");
    expect(bundled).not.toContain('typeof ui_screens !==');
  });

  it('calls the first export when no preferred entry exists', () => {
    const file = mkFile({
      fileName: 'logic.ts',
      nodeLabel: 'logic',
      code: `export function boot(container: HTMLElement): void { container.textContent = 'booted'; }`,
      exports: ['boot'],
    });
    const bundled = bundlePreviewJs([file]);
    expect(bundled).not.toBeNull();
    expect(bundled).toContain('boot(document.getElementById(');
  });

  it('returns null when bundling fails (unresolvable import) so the caller can fall back', () => {
    const bad = mkFile({
      fileName: 'bad.ts',
      nodeLabel: 'bad',
      code: `import { x } from 'definitely-not-a-real-package-xyz';\nexport const y = x;`,
      exports: ['y'],
    });
    expect(bundlePreviewJs([bad])).toBeNull();
  });

  it('bundles plain JavaScript files too', () => {
    const file = mkFile({
      fileName: 'app.js',
      nodeLabel: 'app',
      language: 'javascript',
      code: `export function render(c) { c.textContent = 'hi'; }`,
      exports: ['render'],
    });
    const bundled = bundlePreviewJs([file]);
    expect(bundled).not.toBeNull();
    expect(bundled).toContain('render(document.getElementById(');
  });
});

describe('assembleLegacyPreviewJs (fallback)', () => {
  it('emits namespaces, IIFEs and init calls (regression guard)', () => {
    const file: GeneratedFile = {
      fileName: 'ui-screens.ts',
      language: 'typescript',
      code: `export function render(c: HTMLElement): void { c.textContent = 'hi'; }`,
      nodeId: 'n',
      nodeLabel: 'ui_screens',
      dependencies: [],
      exports: ['render'],
      errors: [],
      validated: true,
    };
    const legacy = assembleLegacyPreviewJs([file]);
    expect(legacy.namespaceDeclarations).toContain('var ui_screens = {};');
    expect(legacy.jsSectionLines.join('\n')).toContain('(function(exports)');
    expect(legacy.initSetupCalls.join('\n')).toContain('ui_screens.render(document.getElementById(\'app-container\'));');
  });
});

describe('projectGraphSignature', () => {
  it('is stable regardless of node/edge ordering', () => {
    const projectA: any = {
      name: 'p', targetOS: 'web',
      nodes: [
        { id: 'a', data: { label: 'x.ts', description: 'd', type: 'logic', language: 'typescript' } },
        { id: 'b', data: { label: 'y.ts', description: 'e', type: 'ui', language: 'typescript' } },
      ],
      edges: [{ source: 'a', target: 'b' }],
    };
    const projectB: any = {
      name: 'p', targetOS: 'web',
      nodes: [
        { id: 'b', data: { label: 'y.ts', description: 'e', type: 'ui', language: 'typescript' } },
        { id: 'a', data: { label: 'x.ts', description: 'd', type: 'logic', language: 'typescript' } },
      ],
      edges: [{ source: 'a', target: 'b' }],
    };
    expect(projectGraphSignature(projectA)).toBe(projectGraphSignature(projectB));
  });

  it('changes when the graph changes', () => {
    const base: any = {
      name: 'p', targetOS: 'web',
      nodes: [{ id: 'a', data: { label: 'x.ts', description: 'd', type: 'logic', language: 'typescript' } }],
      edges: [],
    };
    const changed: any = { ...base, nodes: [{ id: 'a', data: { label: 'z.ts', description: 'd', type: 'logic', language: 'typescript' } }] };
    expect(projectGraphSignature(base)).not.toBe(projectGraphSignature(changed));
  });
});
