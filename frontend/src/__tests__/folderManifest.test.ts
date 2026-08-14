import { describe, it, expect } from 'vitest';
import {
  detectFolderRoot,
  extensionCounts,
  formatBytes,
  buildFolderManifest,
  type ManifestFile,
} from '../utils/folderManifest';

const F = (path: string, content = ''): ManifestFile => ({ path, content });

describe('detectFolderRoot', () => {
  it('returns null for an empty list', () => {
    expect(detectFolderRoot([])).toBeNull();
  });

  it('returns the shared top-level folder', () => {
    const files = [F('myapp/src/a.ts'), F('myapp/src/b.ts'), F('myapp/package.json')];
    expect(detectFolderRoot(files)).toBe('myapp');
  });

  it('returns null when top-level items differ', () => {
    const files = [F('src/a.ts'), F('lib/b.ts')];
    expect(detectFolderRoot(files)).toBeNull();
  });

  it('handles single-file folders', () => {
    expect(detectFolderRoot([F('main.py')])).toBe('main.py');
  });
});

describe('extensionCounts', () => {
  it('counts extensions case-insensitively', () => {
    const files = [F('a.ts'), F('b.TS'), F('c.html'), F('d.json')];
    expect(extensionCounts(files)).toEqual({ ts: 2, html: 1, json: 1 });
  });

  it('uses the whole name as the key when a file has no dot extension', () => {
    // split('.').pop() on a dotless name returns the name itself, so
    // 'README' becomes { readme: 1 } — never 'unknown'.
    expect(extensionCounts([F('README')])).toEqual({ readme: 1 });
  });

  it('returns an empty object for no files', () => {
    expect(extensionCounts([])).toEqual({});
  });
});

describe('formatBytes', () => {
  it('formats bytes, KB and MB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('hits the B→KB and KB→MB boundaries exactly', () => {
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024 - 1)).toBe('1024.0 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
  });
});

describe('buildFolderManifest', () => {
  it('summarizes files, sizes and types', () => {
    const files = [F('src/a.ts', 'x'.repeat(100)), F('src/b.ts', 'y'.repeat(50))];
    const out = buildFolderManifest(files);
    expect(out).toContain('Folder root: src');
    expect(out).toContain('Files: 2');
    expect(out).toContain('File types: ts (2)');
  });

  it('caps listed files with maxFiles', () => {
    const files = Array.from({ length: 10 }, (_, i) => F(`f${i}.ts`));
    const out = buildFolderManifest(files, { maxFiles: 3 });
    expect(out).toContain('... and 7 more');
    expect(out.split('\n').filter(l => l.startsWith('  f')).length).toBe(3);
  });

  it('truncates sample contents to maxContentChars', () => {
    const files = [F('big.ts', 'z'.repeat(2000))];
    const out = buildFolderManifest(files, { maxContentChars: 100 });
    const sample = out.split('\n').find(l => l.startsWith('zzz')) || '';
    expect(sample.length).toBeLessThanOrEqual(100);
  });

  it('limits the number of sampled files', () => {
    const files = [F('a.ts', 'A'), F('b.ts', 'B'), F('c.ts', 'C')];
    const out = buildFolderManifest(files, { maxSampleFiles: 2 });
    expect(out).toContain('--- a.ts ---');
    expect(out).toContain('--- b.ts ---');
    expect(out).not.toContain('--- c.ts ---');
  });

  it('omits the sample section when no file has content', () => {
    const out = buildFolderManifest([F('empty.ts')]);
    expect(out).not.toContain('Sample contents');
  });

  it('handles an empty file list gracefully', () => {
    const out = buildFolderManifest([]);
    expect(out).toContain('Files: 0');
    expect(out).toContain('(multiple top-level items)');
  });
});
