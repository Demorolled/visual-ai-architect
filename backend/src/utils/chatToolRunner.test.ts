import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getRegistry } from '../tools/ToolRegistry.js';
import { fileSystemTools } from '../tools/tools/FileSystemTool.js';
import { runChatTool, truncateMid } from './chatToolRunner.js';

let tmpDir = '';

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'chat-tool-runner-'));
  // Register the real file tools so the runner executes them for real.
  getRegistry().registerAll(...fileSystemTools);
});

afterAll(() => {
  if (tmpDir && existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

describe('chatToolRunner', () => {
  it('reads a real file and puts the REAL content in the context block', async () => {
    const filePath = join(tmpDir, 'sample.txt');
    writeFileSync(filePath, 'hello from the runner test\nline two\n', 'utf-8');

    const out = await runChatTool({
      tool: 'read_file',
      input: { path: filePath },
      display: `file: ${filePath}`,
    });

    expect(out.handled).toBe(true);
    expect(out.tool).toBe('read_file');
    expect(out.contextBlock).toContain('[REAL FILE CONTENT');
    expect(out.contextBlock).toContain('hello from the runner test');
    expect(out.contextBlock).toContain('line two');
  });

  it('reports honestly when the file does not exist (no fabrication)', async () => {
    const out = await runChatTool({
      tool: 'read_file',
      input: { path: join(tmpDir, 'does-not-exist.ts') },
      display: 'file: does-not-exist.ts',
    });

    expect(out.handled).toBe(true);
    expect(out.contextBlock).toContain('FAILED');
    expect(out.contextBlock).toContain('could not be read');
  });

  it('searches a real directory and returns actual matches', async () => {
    const dir = join(tmpDir, 'search-me');
    const { mkdirSync } = await import('fs');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'a.ts'), 'const zorpToken = 42;\n', 'utf-8');
    writeFileSync(join(dir, 'b.txt'), 'nothing here\n', 'utf-8');

    const out = await runChatTool({
      tool: 'search_file',
      input: { pattern: 'zorpToken', path: dir, maxResults: 10 },
      display: 'code search: "zorpToken"',
    });

    expect(out.handled).toBe(true);
    expect(out.contextBlock).toContain('[REAL CODE SEARCH');
    expect(out.contextBlock).toContain('zorpToken');
    expect(out.contextBlock).toContain('a.ts');
  });

  it('truncateMid keeps head + tail and marks the cut', () => {
    const long = 'x'.repeat(10000);
    const out = truncateMid(long, 1000);
    expect(out.length).toBeLessThan(1100);
    expect(out).toContain('[truncated');
    expect(out.startsWith('xxxxx')).toBe(true);
    expect(out.endsWith('xxxxx')).toBe(true);
  });

  it('truncateMid passes through short strings unchanged', () => {
    expect(truncateMid('short', 1000)).toBe('short');
  });
});
