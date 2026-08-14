/**
 * nodeContext.ts — Canvas Node Scanner
 * ======================================
 *
 * Reads all nodes from the project store and builds a condensed but
 * informative text summary that can be injected into LLM prompts.
 *
 * Use cases:
 *   - User asks "what nodes do I have?"
 *   - User asks "describe the architecture"
 *   - User asks a question about a specific node
 *   - Any node-related query should trigger a full scan
 */

import { useProjectStore } from '../store/projectStore';

// ─── Node-related keyword detection ────────────────────────────────────

const NODE_KEYWORDS = [
  'node', 'nodes', 'canvas', 'architecture', 'architect',
  'component', 'components', 'module', 'modules',
  'file', 'files', 'structure', 'layout',
  'diagram', 'graph', 'flow', 'pipeline',
  'design', 'blueprint', 'schema', 'topology',
  'connection', 'connections', 'edge', 'edges',
  'dependency', 'dependencies', 'data flow',
  'building block', 'building blocks',
  'what.*canvas', 'show.*node', 'list.*node',
  'scan', 'current.*project', 'project.*status',
  'how many', 'overview', 'summary',
  // ── Common typos/mishearings ──
  'nods',   // typo for "nodes" (most common — the user hit this exact one)
  'noded',  // typo for "node"
];

/**
 * Check if user text contains node-related keywords.
 * Returns true if the user is asking about nodes/canvas/architecture.
 */
export function isNodeQuery(text: string): boolean {
  const lower = text.toLowerCase().trim();
  for (const keyword of NODE_KEYWORDS) {
    if (keyword.includes('.*')) {
      // Regex pattern match
      try {
        const re = new RegExp(keyword, 'i');
        if (re.test(lower)) return true;
      } catch { /* skip invalid regex patterns */ }
    } else if (lower.includes(keyword)) {
      return true;
    }
  }
  return false;
}

/**
 * Get the total character length of all generated code on the canvas.
 */
function getTotalCodeChars(nodes: any[]): number {
  return nodes.reduce((sum, n) => {
    const code = n.data?.generatedCode || '';
    return sum + code.length;
  }, 0);
}

/**
 * Build a condensed but informative string describing every node
 * currently on the canvas. Returns null if there are no nodes.
 *
 * Example output:
 * ```
 * [CANVAS NODES]
 * ────────────────────────────────────────
 * Total: 4 nodes · 2 edges · 12,845 chars of code
 *
 * 1. main.go (logic · go) — Entry point, HTTP server, routes
 *    Status: ✅ generated · Language: go
 *
 * 2. database.go (database · go) — PostgreSQL connection, migrations
 *    Status: ⏳ pending · Language: go
 * ...
 * ```
 */
export function buildNodeContext(): string | null {
  const state = useProjectStore.getState();
  const { nodes, edges } = state;

  if (nodes.length === 0) return null;

  // Filter out master/blueprint nodes from the detailed list
  const workNodes = nodes.filter(n => n.type !== 'master');
  const totalCodeChars = getTotalCodeChars(nodes);

  const lines: string[] = [];
  lines.push(`[CANVAS NODES]`);
  lines.push(`Project: ${state.projectName || 'Untitled'}`);
  lines.push(`Goal: ${state.userGoal || '(not set)'}`);
  lines.push(`Target OS: ${state.targetOS}`);
  lines.push(`────────────────────────────────────────`);
  lines.push(`Total: ${workNodes.length} nodes · ${edges.length} edges · ${totalCodeChars.toLocaleString()} chars of generated code`);
  lines.push('');

  if (workNodes.length === 0) {
    lines.push('(No work nodes on canvas — only a master/blueprint node)');
    return lines.join('\n');
  }

  workNodes.forEach((n, i) => {
    const type = n.type || 'unknown';
    const label = n.data?.label || n.id || `Node ${i + 1}`;
    const language = n.data?.language || '?';
    const description = (n.data?.description || '').trim();
    const status = n.data?.status || 'pending';
    const generatedCode = n.data?.generatedCode || '';
    const codeLen = generatedCode.length;

    const statusIcon =
      status === 'generated' || status === 'done' ? '✅ generated' :
      status === 'error' ? '❌ error' :
      status === 'filling' ? '⏳ filling' :
      status === 'pending' ? '⏳ pending' : `📄 ${status}`;

    lines.push(`${i + 1}. ${label}`);
    lines.push(`   Type: ${type} · Language: ${language}`);

    if (description) {
      // Truncate long descriptions
      const desc = description.length > 120
        ? description.substring(0, 120) + '...'
        : description;
      lines.push(`   ${desc}`);
    }

    lines.push(`   Status: ${statusIcon}`);

    if (codeLen > 0) {
      lines.push(`   Generated code: ${codeLen.toLocaleString()} chars`);
    }

    // Include connections if edges exist
    const connectedEdges = edges.filter(e => e.source === n.id || e.target === n.id);
    if (connectedEdges.length > 0) {
      const connections = connectedEdges.map(e => {
        const otherId = e.source === n.id ? e.target : e.source;
        const otherNode = nodes.find(on => on.id === otherId);
        return otherNode?.data?.label || otherId;
      });
      lines.push(`   Connected to: ${connections.join(', ')}`);
    }

    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Build a compact one-line summary of the canvas for lightweight context.
 * Example: "4 nodes (logic, database, api, ui) · 2 edges · go"
 */
export function buildNodeSummary(): string {
  const state = useProjectStore.getState();
  const { nodes, edges } = state;
  const workNodes = nodes.filter(n => n.type !== 'master');

  if (workNodes.length === 0) return '(empty canvas)';

  const types = [...new Set(workNodes.map(n => n.type))].join(', ');
  const languages = [...new Set(workNodes.map(n => n.data?.language || '?'))].join(', ');
  const totalChars = getTotalCodeChars(nodes);

  return `${workNodes.length} nodes (${types}) · ${edges.length} edges · ${languages} · ${totalChars.toLocaleString()} chars`;
}

/**
 * Get a single node's details by label or id.
 * Returns a formatted string or null if not found.
 */
export function getNodeDetail(query: string): string | null {
  const state = useProjectStore.getState();
  const { nodes, edges } = state;

  const lower = query.toLowerCase().trim();
  const node = nodes.find(n =>
    (n.data?.label || '').toLowerCase().includes(lower) ||
    n.id.toLowerCase().includes(lower)
  );

  if (!node) return null;

  const connectedEdges = edges.filter(e => e.source === node.id || e.target === node.id);
  const connections = connectedEdges.map(e => {
    const otherId = e.source === node.id ? e.target : e.source;
    const otherNode = nodes.find(on => on.id === otherId);
    return `${e.source === node.id ? '→' : '←'} ${otherNode?.data?.label || otherId}`;
  });

  const lines: string[] = [];
  lines.push(`📦 ${node.data?.label || node.id}`);
  lines.push(`   Type: ${node.type}`);
  lines.push(`   Language: ${node.data?.language || '?'}`);
  if (node.data?.description) lines.push(`   Description: ${node.data.description}`);
  lines.push(`   Status: ${node.data?.status || 'pending'}`);
  if (node.data?.generatedCode) {
    lines.push(`   Code: ${node.data.generatedCode.length.toLocaleString()} chars`);
  }
  if (connections.length > 0) {
    lines.push(`   Connections:`);
    connections.forEach(c => lines.push(`     ${c}`));
  }
  return lines.join('\n');
}
