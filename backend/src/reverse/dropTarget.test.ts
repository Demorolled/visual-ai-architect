import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describeStagedSkips, isDropPlaceholder, stageDroppedFiles } from './dropTarget.js';

const FILE = (path: string, content: string) => ({ path, content });

describe('isDropPlaceholder', () => {
  it('recognises what the frontend writes for a file it cannot read', () => {
    expect(isDropPlaceholder('[binary file: app.exe]')).toBe(true);
    expect(isDropPlaceholder('[binary/large file: bundle.js]')).toBe(true);
    expect(isDropPlaceholder('  [binary file: app.exe]  ')).toBe(true);
  });

  it('does not mistake real source for a placeholder', () => {
    expect(isDropPlaceholder('const x = 1;')).toBe(false);
    expect(isDropPlaceholder('')).toBe(false);
    expect(isDropPlaceholder('[binary file: a.exe] and more')).toBe(false);
  });
});

describe('stageDroppedFiles', () => {
  it('writes the dropped tree with its relative paths', async () => {
    const staged = await stageDroppedFiles([
      FILE('myapp/package.json', '{"name":"myapp"}'),
      FILE('myapp/src/index.js', 'export const x = 1;'),
      FILE('myapp/src/lib/util.js', 'export const y = 2;'),
    ]);
    try {
      expect(staged.written).toBe(3);
      expect(staged.skipped).toEqual([]);
      expect(readFileSync(join(staged.dir, 'myapp', 'src', 'lib', 'util.js'), 'utf8')).toBe('export const y = 2;');
    } finally {
      await staged.cleanup();
    }
  });

  it('skips a binary placeholder instead of writing a fake source file', async () => {
    const staged = await stageDroppedFiles([
      FILE('app/main.js', 'console.log(1)'),
      FILE('app/app.exe', '[binary file: app.exe]'),
    ]);
    try {
      expect(staged.written).toBe(1);
      expect(staged.skipped).toEqual([{ path: 'app/app.exe', reason: 'not-text' }]);
      // Nothing was invented in its place — REA must not analyze a placeholder as code.
      expect(existsSync(join(staged.dir, 'app', 'app.exe'))).toBe(false);
    } finally {
      await staged.cleanup();
    }
  });

  it('refuses a path that would escape the staged folder', async () => {
    const staged = await stageDroppedFiles([
      FILE('../../etc/passwd', 'root:x:0:0'),
      FILE('/etc/shadow', 'secret'),
      FILE('ok.txt', 'fine'),
    ]);
    try {
      expect(staged.written).toBe(1);
      expect(staged.skipped.map((s) => s.reason)).toEqual(['unsafe-path', 'unsafe-path']);
      expect(existsSync('/etc/passwd-staged')).toBe(false);
    } finally {
      await staged.cleanup();
    }
  });

  it('keeps the first copy of a duplicated path', async () => {
    const staged = await stageDroppedFiles([FILE('a.js', 'first'), FILE('a.js', 'second')]);
    try {
      expect(staged.written).toBe(1);
      expect(staged.skipped).toEqual([{ path: 'a.js', reason: 'duplicate' }]);
      expect(readFileSync(join(staged.dir, 'a.js'), 'utf8')).toBe('first');
    } finally {
      await staged.cleanup();
    }
  });

  it('stops at the size limit and says so', async () => {
    // 50 bytes fits the 60-byte budget; the next two would exceed it.
    const staged = await stageDroppedFiles(
      [FILE('a.js', 'x'.repeat(50)), FILE('b.js', 'y'.repeat(50)), FILE('c.js', 'z'.repeat(20))],
      { maxBytes: 60 },
    );
    try {
      expect(staged.written).toBe(1);
      expect(staged.skipped.map((s) => s.reason)).toEqual(['over-limit', 'over-limit']);
    } finally {
      await staged.cleanup();
    }
  });

  it('is a no-op for an empty drop and still cleans up', async () => {
    const staged = await stageDroppedFiles([]);
    const dir = staged.dir;
    expect(staged.written).toBe(0);
    await staged.cleanup();
    await staged.cleanup(); // idempotent
    expect(existsSync(dir)).toBe(false);
  });

  it('removes the whole staged tree on cleanup', async () => {
    const staged = await stageDroppedFiles([FILE('deep/nested/a.ts', 'x')]);
    expect(existsSync(join(staged.dir, 'deep', 'nested', 'a.ts'))).toBe(true);
    await staged.cleanup();
    expect(existsSync(staged.dir)).toBe(false);
  });
});

describe('describeStagedSkips', () => {
  it('groups the skips by reason so the user learns what was left out', () => {
    const lines = describeStagedSkips([
      { path: 'a.exe', reason: 'not-text' },
      { path: 'b.dll', reason: 'not-text' },
      { path: '../escape', reason: 'unsafe-path' },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines.join('\n')).toMatch(/2 file\(s\) not readable as text/);
    expect(lines.join('\n')).toMatch(/a\.exe/);
    expect(lines.join('\n')).toMatch(/would escape the staged folder/);
  });

  it('says nothing when nothing was skipped', () => {
    expect(describeStagedSkips([])).toEqual([]);
  });
});
