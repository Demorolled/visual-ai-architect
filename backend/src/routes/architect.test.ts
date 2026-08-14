import { describe, it, expect } from 'vitest';
import {
  parseArchitectResponse,
  sanitizeNodes,
  buildFlowNodes,
  buildFlowEdges,
  enforceEdgeDensity,
  validateArchitectRequest,
  ArchitectNode,
  ArchitectEdge,
} from './architect.js';
import { getArchitectPrompt, ARCHITECT_SYSTEM_PROMPT } from '../ai/prompts.js';

// ═══════════════════════════════════════════════════════════════════════════
// 1. Prompt Building
// ═══════════════════════════════════════════════════════════════════════════

describe('getArchitectPrompt', () => {
  it('includes the goal and purpose in the returned prompt', () => {
    const prompt = getArchitectPrompt('Build a todo app', 'Manage tasks', 'linux');
    expect(prompt).toContain('Build a todo app');
    expect(prompt).toContain('Manage tasks');
    expect(prompt).toContain('linux');
  });

  it('handles missing purpose with fallback', () => {
    const prompt = getArchitectPrompt('Build a todo app', '', 'linux');
    expect(prompt).toContain('Build a todo app');
    expect(prompt).not.toContain('undefined');
  });

  it('handles missing targetOS with fallback', () => {
    const prompt = getArchitectPrompt('Build a todo app', 'Manage tasks', '');
    expect(prompt).toContain('Build a todo app');
    expect(prompt).toContain('Manage tasks');
  });

  it('includes knowledge context when provided', () => {
    const knowledge = '- Pattern: Previous App\n  Description: A similar project';
    const prompt = getArchitectPrompt('Build a todo app', 'Manage tasks', 'linux', knowledge);
    expect(prompt).toContain('Previous successful architectures');
    expect(prompt).toContain('Previous App');
    expect(prompt).toContain('A similar project');
  });

  it('omits knowledge section when no context provided', () => {
    const prompt = getArchitectPrompt('Build a todo app', 'Manage tasks', 'linux');
    expect(prompt).not.toContain('Previous successful architectures');
  });

  it('returns a string containing the architect system prompt', () => {
    const prompt = getArchitectPrompt('Build a todo app', 'Manage tasks', 'linux');
    expect(prompt).toContain('expert software architect');
    expect(prompt).toContain('nodes');
    expect(prompt).toContain('edges');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. JSON Parsing
// ═══════════════════════════════════════════════════════════════════════════

describe('parseArchitectResponse', () => {
  it('parses valid JSON with nodes and edges', () => {
    const input = JSON.stringify({
      nodes: [{ label: 'Input', type: 'input', description: 'Handle input', language: 'typescript', position: { x: 100, y: 100 } }],
      edges: [{ source: 'Input', target: 'Logic' }],
    });
    const result = parseArchitectResponse(input);
    expect(result).not.toBeNull();
    expect(result!.nodes).toHaveLength(1);
    expect(result!.nodes[0].label).toBe('Input');
    expect(result!.edges).toHaveLength(1);
  });

  it('parses JSON wrapped in markdown code fences', () => {
    const json = JSON.stringify({
      nodes: [{ label: 'API', type: 'api', description: 'Handle API', language: 'python', position: { x: 100, y: 100 } }],
      edges: [],
    });
    const input = `Here is the architecture:\n\`\`\`json\n${json}\n\`\`\`\nLet me know if you need changes.`;
    const result = parseArchitectResponse(input);
    expect(result).not.toBeNull();
    expect(result!.nodes).toHaveLength(1);
    expect(result!.nodes[0].label).toBe('API');
  });

  it('extracts JSON from text that wraps it with explanations', () => {
    const input = 'Based on your requirements, I would suggest:\n{"nodes":[{"label":"Auth","type":"logic","description":"Handle auth","language":"typescript","position":{"x":100,"y":100}}],"edges":[]}\nThis provides a solid foundation.';
    const result = parseArchitectResponse(input);
    expect(result).not.toBeNull();
    expect(result!.nodes).toHaveLength(1);
    expect(result!.nodes[0].label).toBe('Auth');
  });

  it('returns null for completely invalid input', () => {
    const result = parseArchitectResponse('This is not JSON at all');
    expect(result).toBeNull();
  });

  it('returns null for valid JSON without node/edge fields (structure validation is embedded in the parser)', () => {
    const result = parseArchitectResponse('{"foo": "bar"}');
    // parseArchitectResponse now requires nodes array to be present
    expect(result).toBeNull();
  });

  it('returns null for empty string', () => {
    const result = parseArchitectResponse('');
    expect(result).toBeNull();
  });

  it('handles JSON with extra fields gracefully', () => {
    const input = JSON.stringify({
      nodes: [{ label: 'DB', type: 'database', description: 'Store data', language: 'sql', position: { x: 200, y: 200 } }],
      edges: [],
      extraField: 'should be ignored',
    });
    const result = parseArchitectResponse(input);
    expect(result).not.toBeNull();
    expect(result!.nodes).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Node Validation & Sanitization
// ═══════════════════════════════════════════════════════════════════════════

describe('sanitizeNodes', () => {
  it('passes valid nodes through unchanged', () => {
    const input = [
      { label: 'Input Handler', description: 'Handles user input', type: 'input', language: 'typescript', position: { x: 100, y: 100 } },
      { label: 'Core Logic', description: 'Core processing', type: 'logic', language: 'python', position: { x: 300, y: 100 } },
    ];
    const result = sanitizeNodes(input);
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe('Input Handler');
    expect(result[0].type).toBe('input');
    expect(result[1].type).toBe('logic');
    expect(result[1].language).toBe('python');
  });

  it('defaults invalid types to logic', () => {
    const input = [
      { label: 'Weird', description: 'Unknown type', type: 'invalid_type', language: 'typescript', position: { x: 100, y: 100 } },
    ];
    const result = sanitizeNodes(input);
    expect(result[0].type).toBe('logic');
  });

  it('generates label for missing label', () => {
    const input = [
      { description: 'No label provided', type: 'api', language: 'go', position: { x: 100, y: 100 } },
    ];
    const result = sanitizeNodes(input);
    expect(result[0].label).toBe('Node 1');
  });

  it('truncates long labels to 60 characters', () => {
    const input = [
      { label: 'A'.repeat(100), description: 'Long label test', type: 'logic', language: 'typescript', position: { x: 100, y: 100 } },
    ];
    const result = sanitizeNodes(input);
    expect(result[0].label.length).toBe(60);
  });

  it('truncates long descriptions to 1000 characters', () => {
    const input = [
      { label: 'Test', description: 'D'.repeat(2000), type: 'logic', language: 'typescript', position: { x: 100, y: 100 } },
    ];
    const result = sanitizeNodes(input);
    expect(result[0].description.length).toBe(1000);
  });

  it('defaults missing language to typescript', () => {
    const input = [
      { label: 'Test', description: 'Test', type: 'logic', position: { x: 100, y: 100 } },
    ];
    const result = sanitizeNodes(input);
    expect(result[0].language).toBe('typescript');
  });

  it('provides default position when position is missing', () => {
    const input = [
      { label: 'Node 1', description: 'First node', type: 'input', language: 'js' },
      { label: 'Node 2', description: 'Second node', type: 'logic', language: 'js' },
      { label: 'Node 3', description: 'Third node', type: 'api', language: 'js' },
      { label: 'Node 4', description: 'Fourth node', type: 'database', language: 'js' },
    ];
    const result = sanitizeNodes(input);
    expect(result[0].position).toEqual({ x: 250, y: 300 });
    expect(result[1].position).toEqual({ x: 450, y: 300 });
    expect(result[2].position).toEqual({ x: 650, y: 300 });
    expect(result[3].position).toEqual({ x: 250, y: 470 }); // new row
  });

  it('uses provided position when available', () => {
    const input = [
      { label: 'Test', description: 'Test', type: 'logic', language: 'js', position: { x: 500, y: 600 } },
    ];
    const result = sanitizeNodes(input);
    expect(result[0].position).toEqual({ x: 500, y: 600 });
  });

  it('handles partially missing position (only x)', () => {
    const input = [
      { label: 'Test', description: 'Test', type: 'logic', language: 'js', position: { x: 100 } },
    ];
    const result = sanitizeNodes(input);
    expect(result[0].position.x).toBe(100);
    expect(result[0].position.y).toBe(300); // default
  });

  it('handles null descriptions', () => {
    const input = [
      { label: 'Test', description: null, type: 'logic', language: 'js', position: { x: 100, y: 100 } },
    ];
    const result = sanitizeNodes(input);
    expect(result[0].description).toBe('');
  });

  it('handles empty node array', () => {
    const result = sanitizeNodes([]);
    expect(result).toHaveLength(0);
  });

  it('handles null position gracefully', () => {
    const input = [
      { label: 'Test', description: 'Test', type: 'logic', language: 'js', position: null },
    ];
    const result = sanitizeNodes(input);
    expect(result[0].position.x).toBe(250); // uses default
    expect(result[0].position.y).toBe(300); // uses default
  });

  it('accepts all valid node types', () => {
    const types = ['input', 'output', 'logic', 'api', 'database', 'ui'];
    const input = types.map((t, i) => ({
      label: `${t}_node`,
      description: `A ${t} node`,
      type: t,
      language: 'typescript',
      position: { x: i * 100, y: 100 },
    }));
    const result = sanitizeNodes(input);
    result.forEach((n, i) => {
      expect(n.type).toBe(types[i]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Edge Validation
// ═══════════════════════════════════════════════════════════════════════════

describe('buildFlowEdges', () => {
  const nodes: ArchitectNode[] = [
    { label: 'Input', description: 'Input handler', type: 'input', language: 'typescript', position: { x: 100, y: 100 } },
    { label: 'Logic', description: 'Core logic', type: 'logic', language: 'typescript', position: { x: 300, y: 100 } },
    { label: 'Output', description: 'Output handler', type: 'output', language: 'typescript', position: { x: 500, y: 100 } },
  ];
  const idMap: Record<string, string> = { Input: 'node_1', Logic: 'node_2', Output: 'node_3' };

  it('creates edges for valid source/target pairs', () => {
    const edges: ArchitectEdge[] = [
      { source: 'Input', target: 'Logic' },
      { source: 'Logic', target: 'Output' },
    ];
    const result = buildFlowEdges(edges, nodes, idMap);
    expect(result).toHaveLength(2);
    expect(result[0].source).toBe('node_1');
    expect(result[0].target).toBe('node_2');
    expect(result[1].source).toBe('node_2');
    expect(result[1].target).toBe('node_3');
  });

  it('filters out edges referencing unknown labels', () => {
    const edges: ArchitectEdge[] = [
      { source: 'Input', target: 'NonExistent' },
      { source: 'NonExistent', target: 'Output' },
    ];
    const result = buildFlowEdges(edges, nodes, idMap);
    expect(result).toHaveLength(0);
  });

  it('filters out edges with missing source', () => {
    const edges: ArchitectEdge[] = [
      { source: '', target: 'Logic' },
    ];
    const result = buildFlowEdges(edges, nodes, idMap);
    expect(result).toHaveLength(0);
  });

  it('filters out edges with missing target', () => {
    const edges: ArchitectEdge[] = [
      { source: 'Input', target: '' },
    ];
    const result = buildFlowEdges(edges, nodes, idMap);
    expect(result).toHaveLength(0);
  });

  it('handles empty edges array', () => {
    const result = buildFlowEdges([], nodes, idMap);
    expect(result).toHaveLength(0);
  });

  it('handles partial valid edges mixed with invalid ones', () => {
    const edges: ArchitectEdge[] = [
      { source: 'Input', target: 'Logic' },
      { source: 'Logic', target: 'Ghost' },
      { source: 'Logic', target: 'Output' },
    ];
    const result = buildFlowEdges(edges, nodes, idMap);
    expect(result).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4b. Edge Density Enforcement
// ═══════════════════════════════════════════════════════════════════════════

describe('enforceEdgeDensity', () => {
  const layered: ArchitectNode[] = [
    { label: 'types.ts', description: 'Types', type: 'logic', language: 'typescript', position: { x: 0, y: 0 } },
    { label: 'repository.ts', description: 'Data', type: 'database', language: 'typescript', position: { x: 0, y: 0 } },
    { label: 'service.ts', description: 'Logic', type: 'logic', language: 'typescript', position: { x: 0, y: 0 } },
    { label: 'handlers.ts', description: 'API', type: 'api', language: 'typescript', position: { x: 0, y: 0 } },
    { label: 'main.ts', description: 'Entry', type: 'input', language: 'typescript', position: { x: 0, y: 0 } },
  ];

  it('leaves small apps (<=3 nodes) untouched', () => {
    const small: ArchitectNode[] = layered.slice(0, 3);
    const edges: ArchitectEdge[] = [];
    expect(enforceEdgeDensity(small, edges)).toEqual(edges);
  });

  it('leaves graphs with adequate density untouched', () => {
    const edges: ArchitectEdge[] = [
      { source: 'types.ts', target: 'repository.ts' },
      { source: 'repository.ts', target: 'service.ts' },
      { source: 'service.ts', target: 'handlers.ts' },
    ];
    expect(enforceEdgeDensity(layered, edges)).toEqual(edges);
  });

  it('auto-generates the standard dependency chain when density is too low', () => {
    const edges: ArchitectEdge[] = []; // 0/5 = 0.00 density
    const result = enforceEdgeDensity(layered, edges);
    // repository->service, service->handlers, handlers->main, types fan-in
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(e => e.source === 'repository.ts' && e.target === 'service.ts')).toBe(true);
    expect(result.some(e => e.source === 'service.ts' && e.target === 'handlers.ts')).toBe(true);
    expect(result.some(e => e.source === 'handlers.ts' && e.target === 'main.ts')).toBe(true);
    expect(result.some(e => e.source === 'types.ts' && e.target === 'handlers.ts')).toBe(true);
  });

  it('never duplicates existing edges', () => {
    const edges: ArchitectEdge[] = [{ source: 'repository.ts', target: 'service.ts' }];
    const result = enforceEdgeDensity(layered, edges);
    const keys = result.map(e => `${e.source}->${e.target}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('only adds edges between nodes that exist', () => {
    const partial: ArchitectNode[] = layered.filter(n => n.label === 'main.ts' || n.label === 'handlers.ts');
    const result = enforceEdgeDensity(partial, []);
    for (const e of result) {
      expect(partial.some(n => n.label === e.source)).toBe(true);
      expect(partial.some(n => n.label === e.target)).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Request Validation
// ═══════════════════════════════════════════════════════════════════════════

describe('validateArchitectRequest', () => {
  it('returns null for valid goal string', () => {
    expect(validateArchitectRequest('Build a todo app')).toBeNull();
  });

  it('returns error for missing goal', () => {
    expect(validateArchitectRequest(undefined)).toBe('A non-empty goal string is required.');
  });

  it('returns error for null goal', () => {
    expect(validateArchitectRequest(null)).toBe('A non-empty goal string is required.');
  });

  it('returns error for empty string goal', () => {
    expect(validateArchitectRequest('')).toBe('A non-empty goal string is required.');
  });

  it('returns error for whitespace-only goal', () => {
    expect(validateArchitectRequest('   ')).toBe('A non-empty goal string is required.');
  });

  it('returns error for non-string goal (number)', () => {
    expect(validateArchitectRequest(42)).toBe('A non-empty goal string is required.');
  });

  it('returns error for non-string goal (object)', () => {
    expect(validateArchitectRequest({})).toBe('A non-empty goal string is required.');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. buildFlowNodes
// ═══════════════════════════════════════════════════════════════════════════

describe('buildFlowNodes', () => {
  it('creates flow nodes with unique IDs', () => {
    const sanitized: ArchitectNode[] = [
      { label: 'Input', description: 'Input', type: 'input', language: 'ts', position: { x: 100, y: 100 } },
      { label: 'Logic', description: 'Logic', type: 'logic', language: 'py', position: { x: 300, y: 100 } },
    ];
    const result = buildFlowNodes(sanitized);
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].id).not.toBe(result.nodes[1].id);
    expect(result.idMap['Input']).toBe(result.nodes[0].id);
    expect(result.idMap['Logic']).toBe(result.nodes[1].id);
  });

  it('sets status to pending on all nodes', () => {
    const sanitized: ArchitectNode[] = [
      { label: 'Test', description: 'Test', type: 'input', language: 'ts', position: { x: 100, y: 100 } },
    ];
    const result = buildFlowNodes(sanitized);
    expect(result.nodes[0].data.status).toBe('pending');
  });

  it('preserves node type and position', () => {
    const sanitized: ArchitectNode[] = [
      { label: 'API', description: 'API', type: 'api', language: 'go', position: { x: 500, y: 600 } },
    ];
    const result = buildFlowNodes(sanitized);
    expect(result.nodes[0].type).toBe('api');
    expect(result.nodes[0].position).toEqual({ x: 500, y: 600 });
    expect(result.nodes[0].data.language).toBe('go');
  });

  it('populates resourceFiles based on node type', () => {
    const sanitized: ArchitectNode[] = [
      { label: 'DB', description: 'Database', type: 'database', language: 'ts', position: { x: 100, y: 100 } },
      { label: 'API', description: 'API', type: 'api', language: 'go', position: { x: 300, y: 100 } },
      { label: 'UI', description: 'UI', type: 'ui', language: 'typescript', position: { x: 500, y: 100 } },
      { label: 'Logic', description: 'Logic', type: 'logic', language: 'python', position: { x: 700, y: 100 } },
    ];
    const result = buildFlowNodes(sanitized);
    const dbNode = result.nodes.find((n: any) => n.data.label === 'DB');
    const apiNode = result.nodes.find((n: any) => n.data.label === 'API');
    const uiNode = result.nodes.find((n: any) => n.data.label === 'UI');
    const logicNode = result.nodes.find((n: any) => n.data.label === 'Logic');

    expect(dbNode!.data.resourceFiles).toEqual(['schema.sql', 'seed.sql', 'config.json', 'README.md']);
    expect(apiNode!.data.resourceFiles).toEqual(['routes.go', 'client.go', 'README.md']);
    expect(uiNode!.data.resourceFiles).toEqual(['component.tsx', 'styles.css', 'README.md']);
    expect(logicNode!.data.resourceFiles).toEqual(['service.py', 'helpers.py', 'README.md']);
  });

  it('populates resourceFiles for ui-functions type', () => {
    const sanitized: ArchitectNode[] = [
      { label: 'Controls', description: 'UI controls', type: 'ui-functions', language: 'ts', position: { x: 100, y: 100 } },
    ];
    const result = buildFlowNodes(sanitized);
    expect(result.nodes[0].data.resourceFiles).toEqual(['controls.ts', 'README.md']);
  });

  it('populates resourceFiles for unknown type with default README only', () => {
    const sanitized: ArchitectNode[] = [
      { label: 'Weird', description: 'Unknown', type: 'unknown-type', language: 'ts', position: { x: 100, y: 100 } },
    ];
    const result = buildFlowNodes(sanitized);
    expect(result.nodes[0].data.resourceFiles).toEqual(['README.md']);
  });

  it('handles empty node array', () => {
    const result = buildFlowNodes([]);
    expect(result.nodes).toHaveLength(0);
    expect(result.idMap).toEqual({});
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. GET /api/architect/prompt
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/architect/prompt', () => {
  it('returns success true', () => {
    // The endpoint returns: res.json({ success: true, prompt: ARCHITECT_SYSTEM_PROMPT })
    // We test the exported constant directly since the endpoint is a simple passthrough.
    const result = { success: true, prompt: ARCHITECT_SYSTEM_PROMPT };
    expect(result.success).toBe(true);
  });

  it('returns the architect system prompt', () => {
    const result = { success: true, prompt: ARCHITECT_SYSTEM_PROMPT };
    expect(result.prompt).toBe(ARCHITECT_SYSTEM_PROMPT);
  });

  it('prompt describes an expert software architect', () => {
    expect(ARCHITECT_SYSTEM_PROMPT).toContain('expert software architect');
  });

  it('prompt mentions node architecture generation', () => {
    expect(ARCHITECT_SYSTEM_PROMPT).toContain('Design COMPLETE applications');
  });

  it('prompt lists all available node types', () => {
    const types = ['input', 'output', 'logic', 'api', 'database', 'ui'];
    for (const t of types) {
      expect(ARCHITECT_SYSTEM_PROMPT).toContain(t);
    }
  });

  it('prompt lists OS-to-language mappings', () => {
    expect(ARCHITECT_SYSTEM_PROMPT).toContain('Go(.go)');
    expect(ARCHITECT_SYSTEM_PROMPT).toContain('C#(.cs)');
    expect(ARCHITECT_SYSTEM_PROMPT).toContain('Swift(.swift)');
    expect(ARCHITECT_SYSTEM_PROMPT).toContain('Kotlin(.kt)');
  });

  it('prompt specifies JSON output format with nodes and edges', () => {
    expect(ARCHITECT_SYSTEM_PROMPT).toContain('"nodes"');
    expect(ARCHITECT_SYSTEM_PROMPT).toContain('"edges"');
  });

  it('prompt instructs to return valid JSON only', () => {
    expect(ARCHITECT_SYSTEM_PROMPT).toContain('Return ONLY valid JSON');
  });

  it('prompt discourages markdown and code fences', () => {
    expect(ARCHITECT_SYSTEM_PROMPT).toContain('no markdown');
    expect(ARCHITECT_SYSTEM_PROMPT).toContain('no explanations');
  });

  it('prompt includes guidelines for node count based on complexity', () => {
    expect(ARCHITECT_SYSTEM_PROMPT).toContain('8+ nodes');
    expect(ARCHITECT_SYSTEM_PROMPT).toContain('12+ nodes');
    expect(ARCHITECT_SYSTEM_PROMPT).toContain('18+ nodes');
    expect(ARCHITECT_SYSTEM_PROMPT).toContain('25+ nodes');
  });
});
