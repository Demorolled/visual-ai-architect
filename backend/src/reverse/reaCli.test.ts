import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEEP_SCAN_FILTER_OUTPUT,
  REA_PINNED_VERSION,
  describeReaFailure,
  isReaFailure,
  isReaInstalled,
  parseReaStdout,
  progressFromStderr,
  reaInstallHint,
  resolveReaEntry,
  runRea,
} from './reaCli.js';

// The parsing helpers are pure, so they are tested against the exact shapes the
// pinned CLI produced on this machine. The two tests that actually spawn REA are
// guarded by isReaInstalled() so a checkout without `npm install` still passes.

describe('resolveReaEntry', () => {
  it('finds the pinned CLI entry the backend depends on', () => {
    const entry = resolveReaEntry();
    if (!isReaInstalled()) {
      // Needs `npm install --workspace=backend`; the package is a real dependency.
      expect(entry).toBeNull();
      return;
    }
    expect(entry).toMatch(/node_modules[/\\]rea-agents[/\\]scripts[/\\]rea\.mjs$/);
  });
});

describe('reaInstallHint', () => {
  it('names the pinned version and the workspace that owns the dependency', () => {
    expect(reaInstallHint()).toContain(`rea-agents@${REA_PINNED_VERSION}`);
    expect(reaInstallHint()).toContain('--workspace=backend');
  });
});

describe('progressFromStderr', () => {
  it('reads NDJSON progress and ignores ordinary logging', () => {
    const stderr = [
      'Starting analysis',
      '{"rea_progress":{"phase":"inventory","completed":1,"total":3,"message":"walking","sequence":1}}',
      '{"rea_progress":{"phase":"parse","completed":2,"total":3,"sequence":2}}',
      '{"unrelated":{"field":true}}',
      'not json at all',
      '',
    ].join('\n');

    const progress = progressFromStderr(stderr);
    expect(progress).toHaveLength(2);
    expect(progress[0]).toEqual({ phase: 'inventory', completed: 1, total: 3, message: 'walking', sequence: 1 });
    expect(progress[1].phase).toBe('parse');
  });

  it('returns nothing for empty stderr', () => {
    expect(progressFromStderr('')).toEqual([]);
  });
});

describe('parseReaStdout', () => {
  it('returns the envelope for a successful run', () => {
    const envelope = { evidence_id: 'ev_1', operation: 'analyze_javascript_application', normalized_result: {} };
    const parsed = parseReaStdout(JSON.stringify(envelope));
    expect(parsed.error).toBeNull();
    expect(parsed.failure).toBeNull();
    expect(parsed.envelope?.evidence_id).toBe('ev_1');
  });

  it('separates a structured refusal from a transport failure', () => {
    const failure = {
      error: 'target_unavailable',
      code: 'target_unavailable',
      category: 'input',
      message: 'The selected target cannot be analyzed by this operation.',
      retryable: false,
      remediation: { action: 'Use `rea analyze <directory>` for application directories.' },
    };
    const parsed = parseReaStdout(JSON.stringify(failure));
    expect(parsed.envelope).toBeNull();
    expect(parsed.error).toBeNull();
    expect(parsed.failure?.code).toBe('target_unavailable');
  });

  it('separates a refusal that has no `error` key at all', () => {
    // The measured missing-engine shape: `{code, category, message, retryable,
    // remediation, details}`. Reading this as a successful scan is what turned
    // "jadx is not installed" into "the artifact has no files".
    const capability = {
      code: 'capability_unavailable',
      category: 'unsupported_provider',
      message: 'Set REA_JADX_MCP_JAR to the absolute path of a caller-supplied jadx-headless-mcp 0.7.1 JAR.',
      retryable: false,
      remediation: { action: 'Set REA_JADX_MCP_JAR to the absolute path of a caller-supplied jadx-headless-mcp 0.7.1 JAR.' },
      details: { provider_id: 'jadx', operation: 'inspect_android_package' },
    };
    const parsed = parseReaStdout(JSON.stringify(capability));
    expect(parsed.envelope).toBeNull();
    expect(parsed.failure?.code).toBe('capability_unavailable');
    expect(parsed.error).toBeNull();
  });

  it('takes the last JSON object when stdout carries trailing noise', () => {
    const stdout = '{"log":"warming up"}\n{"evidence_id":"ev_2","operation":"analyze_javascript_application"}\n';
    const parsed = parseReaStdout(stdout);
    expect(parsed.envelope?.evidence_id).toBe('ev_2');
  });

  it('reports unparseable output as an error rather than an empty success', () => {
    const empty = parseReaStdout('');
    expect(empty.envelope).toBeNull();
    expect(empty.error).toMatch(/no output/);

    const garbage = parseReaStdout('Segmentation fault');
    expect(garbage.envelope).toBeNull();
    expect(garbage.failure).toBeNull();
    expect(garbage.error).toMatch(/not JSON/);
  });
});

describe('isReaFailure / describeReaFailure', () => {
  it('identifies a failure by shape, with or without an `error` field', () => {
    expect(isReaFailure({ error: 'x' })).toBe(true);
    expect(isReaFailure({ code: 'capability_unavailable', message: 'engine missing' })).toBe(true);
  });

  it('never mistakes a success envelope for a failure', () => {
    expect(isReaFailure({ evidence_id: 'ev_1', operation: 'analyze_javascript_application', normalized_result: {} })).toBe(false);
    // `code` alone is not enough when the envelope carries a result.
    expect(isReaFailure({ code: 'ok', operation: 'inspect_artifact', normalized_result: { graph: {} } })).toBe(false);
    expect(isReaFailure(null)).toBe(false);
    expect(isReaFailure('boom')).toBe(false);
  });

  it('surfaces the message, the code and REA’s own remediation', () => {
    const described = describeReaFailure({
      error: 'missing_analysis_engine',
      code: 'missing_analysis_engine',
      message: 'Ghidra is not configured.',
      remediation: { action: 'Install Ghidra and set GHIDRA_HOME.' },
    });
    expect(described).toContain('Ghidra is not configured.');
    expect(described).toContain('missing_analysis_engine');
    expect(described).toContain('Install Ghidra and set GHIDRA_HOME.');
  });

  it('accepts a plain-string remediation and an absent one', () => {
    expect(describeReaFailure({ error: 'e', remediation: 'try again' })).toContain('try again');
    expect(describeReaFailure({ error: 'e' })).toBe('e');
    expect(describeReaFailure(null)).toBe('REA failed');
  });

  it('still says something useful for a code-only failure', () => {
    expect(describeReaFailure({ code: 'capability_unavailable', message: 'jadx is missing' })).toContain('jadx is missing');
    expect(describeReaFailure({ code: 'capability_unavailable' })).toContain('capability_unavailable');
  });
});

describe('DEEP_SCAN_FILTER_OUTPUT', () => {
  it('asks for the graph AND the failure keys', () => {
    // `--filter-output` applies to success and refusal alike: asking only for the
    // graph keys reduced a refusal to `{}`, silently erasing the reason.
    const keys = DEEP_SCAN_FILTER_OUTPUT.split(',');
    for (const key of ['normalized_result.graph', 'normalized_result.limitations', 'subject', 'provider', 'operation', 'evidence_id']) {
      expect(keys).toContain(key);
    }
    for (const key of ['code', 'message', 'remediation', 'details', 'error']) {
      expect(keys).toContain(key);
    }
  });

  it('also asks for the source-graph keys, which share nothing with the envelope', () => {
    // Live regression: `import-reference-source` returns a HistoricalSourceGraph,
    // so a filter naming only envelope keys stripped a Java scan down to `{}`.
    const keys = DEEP_SCAN_FILTER_OUTPUT.split(',');
    for (const key of ['schema', 'authority', 'entries', 'relationships', 'languages', 'inventory_state', 'limitations']) {
      expect(keys).toContain(key);
    }
  });
});

describe('runRea (live CLI)', () => {
  it.skipIf(!isReaInstalled())('keeps a large envelope parseable by filtering it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vaca-rea-filter-'));
    try {
      await mkdir(join(dir, 'src'), { recursive: true });
      await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'filter-app', version: '1.0.0' }));
      await writeFile(join(dir, 'src', 'index.js'), 'console.log(1);\n');

      const run = await runRea(['analyze', dir], { timeoutMs: 180_000, filterOutput: DEEP_SCAN_FILTER_OUTPUT });
      expect(run.error).toBeNull();
      expect(run.ok).toBe(true);
      const envelope: any = run.envelope;
      // The mapping data survived...
      expect(envelope.normalized_result.graph.nodes.length).toBeGreaterThan(0);
      expect(envelope.operation).toBe('analyze_javascript_application');
      // ...and the multi-megabyte dumps that no mapping rule reads did not arrive.
      expect(envelope.raw_result).toBeUndefined();
      expect(envelope.normalized_result.semantic_graph).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 240_000);

  it.skipIf(!isReaInstalled())('keeps a filter from erasing a source-tree import', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vaca-rea-source-'));
    try {
      await mkdir(join(dir, 'src/main/java/com/tictactoe'), { recursive: true });
      await writeFile(join(dir, 'src/main/java/com/tictactoe/Main.java'), 'public class Main {}\n');

      const run = await runRea(['import-reference-source', dir], {
        timeoutMs: 120_000,
        filterOutput: DEEP_SCAN_FILTER_OUTPUT,
      });
      expect(run.error).toBeNull();
      expect(run.ok).toBe(true);
      const graph: any = run.envelope;
      expect(graph.schema).toBe('HistoricalSourceGraph');
      expect(graph.entries.length).toBeGreaterThan(0);
      expect(graph.entries.some((e: any) => e.path.endsWith('Main.java') && e.language === 'Java')).toBe(true);
      expect(Array.isArray(graph.languages)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 180_000);

  it.skipIf(!isReaInstalled())('reports a cut-off result as cut off, not as broken JSON', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vaca-rea-cutoff-'));
    try {
      await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'cutoff-app', version: '1.0.0' }));
      await writeFile(join(dir, 'index.js'), 'console.log(1);\n');

      const run = await runRea(['analyze', dir], { timeoutMs: 120_000, maxOutputBytes: 2048 });
      expect(run.ok).toBe(false);
      expect(run.error).toMatch(/cut off/);
      expect(run.error).not.toMatch(/not JSON/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 180_000);

  it.skipIf(!isReaInstalled())(
    'reports a structured refusal with remediation instead of throwing',
    async () => {
      // `inspect-artifact` is the universal probe and it refuses a directory —
      // REA says so itself, which is exactly what the caller needs to see.
      const run = await runRea(['inspect-artifact', process.cwd()], { timeoutMs: 120_000 });

      expect(run.ok).toBe(false);
      expect(run.envelope).toBeNull();
      expect(run.error).toBeNull();
      expect(run.failure?.code).toBeTruthy();
      expect(JSON.stringify(run.failure)).toMatch(/analyze/);
      expect(run.durationMs).toBeGreaterThanOrEqual(0);
    },
    180_000,
  );
});
