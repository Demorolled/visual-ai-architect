import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SYS_SCAFFOLD,
  buildScaffoldTask,
  buildScaffoldPrompt,
  formatScaffoldSection,
  trimScaffold,
  isScaffoldEnabled,
  generateScaffold,
  scaffoldFiles,
  clearScaffoldCache,
  type ScaffoldSpec,
} from './scaffolder.js';

const spec: ScaffoldSpec = {
  file: 'src/notes.ts',
  lang: 'typescript',
  expectedExports: ['getNotes', 'addNote'],
  appPlan: ['src/notes.ts', 'src/server.ts', 'index.html'],
  request: 'a note-taking app',
  summary: 'the notes store',
};

describe('scaffolder — prompt building', () => {
  it('builds the SAME task shape the acceptance gate parses', () => {
    const task = buildScaffoldTask(spec);
    expect(task).toContain('id=src-notes.ts');
    expect(task).toContain('file=src/notes.ts');
    expect(task).toContain('lang=typescript');
    expect(task).toContain('app plan: src/notes.ts, src/server.ts, index.html');
    expect(task).toContain('expected exports: getNotes, addNote');
    expect(task).toContain('task: a note-taking app :: the notes store');
  });

  it('omits empty exports/plan but never omits the task', () => {
    const task = buildScaffoldTask({ file: 'index.html', lang: 'html' });
    expect(task).not.toContain('expected exports:');
    expect(task).not.toContain('app plan:');
    expect(task).toContain('task: a VACA app');
  });

  it('wraps the task exactly like eval_acceptance (TASK: / PREV_SCAFFOLD:)', () => {
    const prompt = buildScaffoldPrompt(spec);
    expect(prompt.startsWith('TASK: ')).toBe(true);
    expect(prompt.endsWith('\nPREV_SCAFFOLD: (none)')).toBe(true);
  });

  it('leaves system prompt identical to the gate copy', () => {
    expect(SYS_SCAFFOLD).toContain('You are a VACA scaffold author.');
    expect(SYS_SCAFFOLD).toContain('propose a REFINED scaffold');
  });
});

describe('scaffolder — section formatting', () => {
  it('returns empty string for empty input (a no-op injection)', () => {
    expect(formatScaffoldSection('')).toBe('');
    expect(formatScaffoldSection('   ')).toBe('');
  });

  it('frames a non-empty scaffold as a REFINED SCAFFOLD block', () => {
    const s = formatScaffoldSection('exports: getNotes, addNote');
    expect(s).toContain('REFINED SCAFFOLD');
    expect(s).toContain('exports: getNotes, addNote');
  });
});

describe('scaffolder — trimScaffold (the injected block must not look like a file)', () => {
  it('strips a fenced code example — the writer otherwise CONTINUES it', () => {
    const scaffold = [
      '### REFINED SCAFFOLD',
      '**Expected Exports:**',
      '- `getNotes`: returns every note.',
      '```typescript',
      "import { Note } from './types';",
      'export function getNotes(): Note[] {',
    ].join('\n');
    const out = trimScaffold(scaffold);
    expect(out).not.toContain('```');
    expect(out).not.toContain('export function getNotes');
    expect(out).toContain('`getNotes`');
  });

  it('drops everything after an UNTERMINATED fence (truncated teacher example)', () => {
    const scaffold = 'Exports: `addNote`\n```typescript\nexport function addNote(\n  // truncated';
    const out = trimScaffold(scaffold);
    expect(out).toContain('`addNote`');
    expect(out).not.toContain('```');
    expect(out).not.toContain('truncated');
  });

  it('keeps the exports/types contract and drops symbol-free prose', () => {
    const scaffold = [
      '**Purpose:**',
      '- This module keeps the whole application lively and pleasant to use.',
      '**Expected Exports:**',
      '- `NoteStore`: a class owning the notes.',
      '**Internal Structure:**',
      '1. `load()`: read the store from disk.',
    ].join('\n');
    const out = trimScaffold(scaffold);
    expect(out).toContain('`NoteStore`');
    expect(out).not.toContain('pleasant to use');
  });

  it('never returns an odd number of fences', () => {
    for (const n of [0, 1, 2, 3]) {
      const out = trimScaffold('exports: `x`\n```ts\ncode\n```'.repeat(n));
      expect(out.split('```').length % 2).toBe(1);
    }
  });

  it('returns empty for empty input and for a scaffold that is only a code block', () => {
    expect(trimScaffold('')).toBe('');
    expect(trimScaffold('```ts\nexport const a = 1;\n```')).toBe('');
  });

  it('caps at maxChars without cutting a line in half', () => {
    const scaffold = Array.from({ length: 60 }, (_, i) => '- `sym' + i + '`: does a thing').join('\n');
    const out = trimScaffold(scaffold, 120);
    expect(out.length).toBeLessThanOrEqual(120);
    // Bullet markers are stripped, so every surviving line is a whole symbol line.
    for (const line of out.split('\n')) expect(line).toMatch(/^`sym\d+`: does a thing$/);
  });
});

describe('scaffolder — config gate', () => {
  const orig = process.env.VACA_SCAFFOLD;
  afterEach(() => {
    if (orig === undefined) delete process.env.VACA_SCAFFOLD;
    else process.env.VACA_SCAFFOLD = orig;
  });

  it('is OFF by default (repo llm-config has features.scaffold=false)', () => {
    delete process.env.VACA_SCAFFOLD;
    expect(isScaffoldEnabled()).toBe(false);
  });

  it('VACA_SCAFFOLD=1 forces it on and =0 forces it off', () => {
    process.env.VACA_SCAFFOLD = '1';
    expect(isScaffoldEnabled()).toBe(true);
    process.env.VACA_SCAFFOLD = '0';
    expect(isScaffoldEnabled()).toBe(false);
  });
});

describe('scaffolder — generation', () => {
  beforeEach(() => clearScaffoldCache());

  it('calls the model with the scaffold role + system prompt and returns the text', async () => {
    let seenSystem = '';
    let seenRole = '';
    const reason = async (_p: string, system?: string, opts?: { role?: string }) => {
      seenSystem = system || '';
      seenRole = opts?.role || '';
      return '  exports: getNotes, addNote\\n  structure: pure fns  ';
    };
    const out = await generateScaffold(reason, spec);
    expect(out).toBe('exports: getNotes, addNote\\n  structure: pure fns');
    expect(seenSystem).toBe(SYS_SCAFFOLD);
    expect(seenRole).toBe('scaffold');
  });

  it('caches: an identical task costs ONE model call', async () => {
    let calls = 0;
    const reason = async () => { calls += 1; return 'chart'; };
    await generateScaffold(reason, spec);
    await generateScaffold(reason, spec);
    expect(calls).toBe(1);
  });

  it('never throws — a failed call yields null so the build proceeds unscaffolded', async () => {
    const reason = async () => { throw new Error('endpoint down'); };
    await expect(generateScaffold(reason, spec)).resolves.toBeNull();
  });

  it('scaffoldFiles skips empty results', async () => {
    const reason = async (p: string) => (p.includes('notes.ts') ? 'good chart' : '');
    const map = await scaffoldFiles(reason, [spec, { file: 'src/other.ts', lang: 'typescript' }]);
    expect(map.get('src/notes.ts')).toBe('good chart');
    expect(map.has('src/other.ts')).toBe(false);
  });
});
