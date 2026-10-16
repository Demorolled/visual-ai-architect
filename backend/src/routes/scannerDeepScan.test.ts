import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scannerRoutes } from './scanner.js';
import { isReaInstalled } from '../reverse/reaCli.js';

// POST /api/scan/deep-scan is the wire contract the drop dialog uses, so it is
// exercised over a real HTTP server rather than by calling the handler direct.

let server: import('node:http').Server | undefined;
let baseUrl = '';
let appDir = '';

async function post(body: Record<string, unknown>) {
  const res = await fetch(`${baseUrl}/api/scan/deep-scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/scan', scannerRoutes);
  const srv = app.listen(0);
  await new Promise<void>((resolve) => srv.once('listening', resolve));
  server = srv;
  baseUrl = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;

  // A real (tiny) app on disk: this is what a dropped FOLDER looks like once a
  // real path is available, and its sources are also what a staged drop replays.
  appDir = await mkdtemp(join(tmpdir(), 'vaca-route-scan-'));
  await mkdir(join(appDir, 'src'), { recursive: true });
  await writeFile(join(appDir, 'package.json'), JSON.stringify({ name: 'dropped-app', version: '1.0.0', main: 'src/index.js' }));
  await writeFile(join(appDir, 'src', 'math.js'), 'export function add(a, b) { return a + b; }\n');
  await writeFile(join(appDir, 'src', 'index.js'), 'import { add } from "./math.js";\nconsole.log(add(1, 2));\n');
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server!.close((err) => (err ? reject(err) : resolve())));
  if (appDir) await rm(appDir, { recursive: true, force: true });
});

describe('POST /api/scan/deep-scan — request validation', () => {
  it('rejects a request with neither a path nor files', async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Drop a folder or a file/);
  });

  it('rejects an empty file list', async () => {
    const res = await post({ files: [] });
    expect(res.status).toBe(400);
  });

  it('rejects a relative path, because REA needs the real one', async () => {
    const res = await post({ path: 'some/relative/dir' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/absolute path/);
  });

  it('reports a target that does not exist instead of failing the request', async () => {
    const res = await post({ path: '/definitely/not/here/app.apk' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.source).toBe('rea');
    expect(res.body.error).toMatch(/does not exist/);
  });
});

describe.skipIf(!isReaInstalled())('POST /api/scan/deep-scan — real REA', () => {
  it('scans a real path and returns a canvas-ready architecture', async () => {
    const res = await post({ path: appDir });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.source).toBe('rea');
    expect(res.body.mode).toBe('path');
    expect(res.body.plan).toMatchObject({ command: 'analyze' });

    const arch = res.body.architecture;
    expect(arch.projectName).toBe('dropped-app');
    expect(arch.nodes.map((n: any) => n.label)).toContain('src');
    expect(arch.nodes.flatMap((n: any) => n.files)).toContain('src/index.js');
    expect(arch.edges.map((e: any) => `${e.source}->${e.target}`)).toContain('src/index.js->src/math.js');
    expect(res.body.evidence.evidenceId).toBeTruthy();
  });

  it('scans a staged copy of dropped text and accounts for what it could not use', async () => {
    const res = await post({
      name: 'Staged App',
      files: [
        { path: 'src/index.js', content: 'import { add } from "./math.js";\nconsole.log(add(1, 2));\n' },
        { path: 'src/math.js', content: 'export function add(a, b) { return a + b; }\n' },
        { path: 'package.json', content: JSON.stringify({ name: 'staged-app', version: '1.0.0' }) },
        { path: 'app.exe', content: '[binary file: app.exe]' },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.mode).toBe('staged');
    expect(res.body.stagedFiles).toBe(3);
    expect(res.body.skippedFiles).toBe(1);
    expect(res.body.skipped.join('\n')).toMatch(/not readable as text/);
    // The dropped name wins over whatever the staged package.json says.
    expect(res.body.architecture.projectName).toBe('Staged App');
    expect(res.body.architecture.nodes.flatMap((n: any) => n.files)).toContain('src/math.js');
  }, 240_000);

  it('names a staged scan after the folder that was dropped, not the temp dir', async () => {
    const res = await post({
      files: [
        { path: 'myapp/src/index.js', content: 'import { add } from "./math.js";\nconsole.log(add(1, 2));\n' },
        { path: 'myapp/src/math.js', content: 'export function add(a, b) { return a + b; }\n' },
        { path: 'myapp/package.json', content: JSON.stringify({ name: 'from-manifest', version: '1.0.0' }) },
      ],
    });

    expect(res.body.success).toBe(true);
    // The staged target lives in a temp dir, so `vaca-deep-scan-XXXX` must never
    // be what the user sees on the canvas.
    expect(res.body.architecture.projectName).toBe('myapp');
    expect(res.body.architecture.projectName).not.toMatch(/vaca-deep-scan/);
  }, 240_000);

  it('stops with a hint when a drop carried no usable text at all', async () => {
    const res = await post({ files: [{ path: 'app.exe', content: '[binary file: app.exe]' }] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.stagedFiles).toBe(0);
    expect(res.body.error).toMatch(/only carries text/);
    expect(res.body.hint).toMatch(/desktop app/);
  });
});
