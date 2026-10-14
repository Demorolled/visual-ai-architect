import { describe, it, expect } from 'vitest';
import { findHardcodedSecrets, formatSecretGateErrors } from './secretGate.js';

const f = (path: string, content: string) => ({ path, content });

describe('findHardcodedSecrets', () => {
  it('detects known credential formats', () => {
    const cases: Array<[string, string]> = [
      ['aws_access_key_id', 'const k = "AKIAIOSFODNN7EXAMPLE";'],
      ['github_token', `const t = 'ghp_${'a'.repeat(36)}';`],
      ['slack_token', "const t = 'xoxb-123456789012-abcdefghijkl';"],
      ['openai_key', `const k = 'sk-${'A'.repeat(24)}';`],
      ['stripe_key', `const k = 'sk_live_${'a'.repeat(20)}';`],
      ['google_api_key', `const k = 'AIza${'a'.repeat(35)}';`],
      ['private_key_block', '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----'],
    ];
    for (const [kind, code] of cases) {
      const found = findHardcodedSecrets([f('src/config.ts', code)]);
      expect(found.map((x) => x.kind), `${kind} <- ${code}`).toContain(kind);
    }
  });

  it('detects a real-looking assigned credential', () => {
    const found = findHardcodedSecrets([
      f('src/db.ts', "const DB_PASSWORD = 'Ab3kL9mN2pQ7rS4tU6vW';\n"),
    ]);
    expect(found.some((x) => x.kind === 'assigned_credential')).toBe(true);
  });

  it('ignores placeholder values', () => {
    const values = [
      'your-api-key-here',
      'changeme123456',
      '<your-token>',
      'xxxxxxxxxxxxxxxxxxxx',
      'replace-me-with-a-real-key',
      // Long enough to pass the entropy rule, so only the placeholder filter
      // can reject it — the case that motivated keeping both filters.
      'your-super-secret-api-key-that-is-long',
    ];
    for (const v of values) {
      const found = findHardcodedSecrets([f('src/config.ts', `const API_KEY = '${v}';\n`)]);
      expect(found, `placeholder wrongly flagged: ${v}`).toEqual([]);
    }
  });

  it('ignores env lookups and short values', () => {
    expect(findHardcodedSecrets([
      f('src/db.ts', 'const DB_PASSWORD = process.env.DB_PASSWORD;\n'),
      f('src/api.ts', "const API_KEY = 'abc';\n"),
    ])).toEqual([]);
  });

  it('ignores comments', () => {
    expect(findHardcodedSecrets([
      f('src/x.ts', "// const API_KEY = 'Ab3kL9mN2pQ7rS4tU6vW';\n"),
      f('src/y.ts', "# const SECRET = 'Ab3kL9mN2pQ7rS4tU6vW'\n"),
    ])).toEqual([]);
  });

  it('skips docs, examples and non-source files', () => {
    const secretish = "const API_KEY = 'Ab3kL9mN2pQ7rS4tU6vW';";
    expect(findHardcodedSecrets([f('README.md', secretish)])).toEqual([]);
    expect(findHardcodedSecrets([f('.env.example', 'API_KEY=Ab3kL9mN2pQ7rS4tU6vW')])).toEqual([]);
    expect(findHardcodedSecrets([f('package-lock.json.txt', secretish)])).toEqual([]);
  });

  it('does not fire on ordinary generated code', () => {
    // The false-positive guard: none of this is a credential, and a gate that
    // flags it would send every build into the repair loop.
    const code = [
      "import express from 'express';",
      'const app = express();',
      'const PORT = 3000;',
      "app.get('/health', (_req, res) => res.json({ ok: true }));",
      "console.log('listening on', PORT);",
      'const c = Math.random();',
      "document.body.innerHTML = '<div>hi</div>';",
      "const url = 'http://example.com/api';",
    ].join('\n');
    expect(findHardcodedSecrets([f('src/server.ts', code)])).toEqual([]);
  });

  it('sorts findings by path then line', () => {
    const found = findHardcodedSecrets([
      f('src/z.ts', "const API_KEY = 'Ab3kL9mN2pQ7rS4tU6vW';\nconst AUTH_TOKEN = 'Cx4mN8pQ2rS6tU1vW3yZ';\n"),
      f('src/a.ts', "const DB_PASSWORD = 'Dq5nP9rT3uV7wX2yZ4bC';\n"),
    ]);
    expect(found.map((x) => `${x.path}:${x.line}`)).toEqual([
      'src/a.ts:1', 'src/z.ts:1', 'src/z.ts:2',
    ]);
  });
});

describe('formatSecretGateErrors', () => {
  const findings = findHardcodedSecrets([
    f('src/db.ts', "const API_KEY = 'Ab3kL9mN2pQ7rS4tU6vW';\n"),
  ]);

  it('leads every error with the file path (the repair-grouping contract)', () => {
    const errs = formatSecretGateErrors(findings);
    expect(errs).toHaveLength(1);
    // groupGateErrorsByFile attributes an error to a file only when the line
    // contains that file's path; an error without one is silently dropped.
    expect(errs[0].startsWith('src/db.ts:1:')).toBe(true);
    expect(errs[0]).toContain('SECURITY');
  });

  it('redacts the credential instead of echoing it', () => {
    const [err] = formatSecretGateErrors(findings);
    expect(err).not.toContain('Ab3kL9mN2pQ7rS4tU6vW');
  });
});
