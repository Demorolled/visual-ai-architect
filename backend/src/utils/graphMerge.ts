/**
 * Graph merge — combine two VACA architecture graphs into one.
 *
 * Implements the merge-two-apps flow documented in the wiki (section 38) /
 * VACA-MASTER (Part N) / bible 04-web guide:
 *   1. LOAD both node graphs
 *   2. DETECT collisions (node ids, labels, edge ids)
 *   3. RESOLVE (deterministic re-id per source, rename labels, drop B's master)
 *   4. INTEGRATE (remap B edges, offset positions so canvases don't overlap)
 *   5. VALIDATE (report every rename / conflict / dropped edge)
 *
 * The merge is pure (no I/O) and unit-tested.
 */

export interface MergeableNode {
  id: string;
  type: string;
  position?: { x: number; y: number };
  data?: Record<string, any>;
  [key: string]: any;
}

export interface MergeableEdge {
  id: string;
  source: string;
  target: string;
  [key: string]: any;
}

export interface MergeGraph {
  name: string;
  nodes: MergeableNode[];
  edges: MergeableEdge[];
}

export interface MergeSummary {
  aName: string;
  bName: string;
  aNodeCount: number;
  bNodeCount: number;
  totalNodes: number;
  totalEdges: number;
  /** B nodes whose ids collided with A and were re-ids */
  renamedNodes: Array<{ oldId: string; newId: string; label: string }>;
  /** B nodes whose label matched an A label (renamed with a source suffix) */
  labelRenames: Array<{ label: string; newLabel: string }>;
  /** B edges dropped because they referenced missing nodes */
  droppedEdges: Array<{ id: string; source: string; target: string; reason: string }>;
  /** Dropped B master node (only A's master survives) */
  droppedMasters: string[];
  warnings: string[];
}

export interface MergeOptions {
  /** Offset B's nodes to the right of A so canvases don't overlap. Default true. */
  offsetB?: boolean;
  /** Horizontal gap between A and B when offsetting. Default 250. */
  offsetGap?: number;
}

const MASTER_TYPES = new Set(['master']);

/** Deterministic per-source id prefix (safe for graph ids). */
function prefixFor(name: string): string {
  const cleaned = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return (cleaned || 'b') + '_';
}

function nodeLabel(n: MergeableNode): string {
  return (n.data?.label as string) || (n.data?.name as string) || n.id;
}

function maxX(nodes: MergeableNode[]): number {
  let mx = 0;
  for (const n of nodes) {
    const x = typeof n.position?.x === 'number' ? n.position.x : 0;
    if (x > mx) mx = x;
  }
  return mx;
}

/**
 * Merge graph B into graph A. A keeps its ids; B's colliding ids are re-ids
 * deterministically (prefix = sanitized B name). Master nodes are excluded
 * from the output (the caller keeps project A's master).
 */
export function mergeGraphs(a: MergeGraph, b: MergeGraph, opts: MergeOptions = {}): {
  nodes: MergeableNode[];
  edges: MergeableEdge[];
  summary: MergeSummary;
} {
  const offsetB = opts.offsetB !== false;
  const gap = opts.offsetGap ?? 250;
  const aName = a.name || 'Project A';
  const bName = b.name || 'Project B';
  const warnings: string[] = [];

  if (!Array.isArray(a.nodes) || !Array.isArray(b.nodes)) {
    throw new Error('Both projects must provide node arrays.');
  }
  if (!Array.isArray(a.edges)) throw new Error('Project A must provide an edges array.');
  if (!Array.isArray(b.edges)) throw new Error('Project B must provide an edges array.');

  const aNonMaster = a.nodes.filter(n => !MASTER_TYPES.has(n.type));
  const bNonMaster = b.nodes.filter(n => !MASTER_TYPES.has(n.type));
  const droppedMasters = b.nodes.filter(n => MASTER_TYPES.has(n.type)).map(n => n.id);

  const aIds = new Set<string>(aNonMaster.map(n => n.id));
  const aLabels = new Set<string>(aNonMaster.map(nodeLabel));

  // ── Step 3: resolve collisions (ids + labels) & remap ──
  const prefix = prefixFor(bName);
  const idMap = new Map<string, string>();
  const renamedNodes: MergeSummary['renamedNodes'] = [];
  const labelRenames: MergeSummary['labelRenames'] = [];

  const mergedNodes: MergeableNode[] = aNonMaster.map(n => ({ ...n }));

  let bOffsetX = offsetB ? maxX(aNonMaster) + gap : 0;

  for (const raw of bNonMaster) {
    const node: MergeableNode = { ...raw };
    const oldId = node.id;
    // Capture the label BEFORE the id mutation (a label-less node falls back
    // to its id — we must not rename that fallback to the NEW id).
    const label = nodeLabel(raw);

    let newId = oldId;
    if (aIds.has(oldId)) {
      newId = `${prefix}${oldId}`;
      // A prefix can itself collide if B is merged twice — keep extending.
      let guard = 0;
      while (aIds.has(newId)) {
        if (guard++ >= 50) {
          throw new Error(`Could not allocate a unique id for node "${oldId}" after 50 attempts.`);
        }
        newId = `${prefix}${oldId}_${guard}`;
      }
      renamedNodes.push({ oldId, newId, label });
    }
    idMap.set(oldId, newId);
    aIds.add(newId);
    node.id = newId;

    // Label conflict (vs project A's ORIGINAL labels only) → deterministic
    // rename with source suffix. B-internal duplicate labels are left alone.
    if (aLabels.has(label)) {
      const newLabel = `${label} (from ${bName})`;
      if (node.data) {
        node.data = { ...node.data, label: newLabel };
      } else {
        node.data = { label: newLabel };
      }
      labelRenames.push({ label, newLabel });
    }

    // Position offset → B sits to the right of A.
    if (offsetB && node.position && typeof node.position.x === 'number') {
      node.position = { ...node.position, x: node.position.x + bOffsetX };
    } else if (offsetB) {
      node.position = { x: bOffsetX, y: 0 };
    }

    mergedNodes.push(node);
  }

  // ── Step 4: remap B's edges through the id map, drop dangling edges ──
  const aEdgeIds = new Set<string>(a.edges.map(e => e.id));
  const mergedEdges: MergeableEdge[] = a.edges.map(e => ({ ...e }));
  const droppedEdges: MergeSummary['droppedEdges'] = [];

  for (const raw of b.edges) {
    const edge: MergeableEdge = { ...raw };
    const source = idMap.get(edge.source) || edge.source;
    const target = idMap.get(edge.target) || edge.target;
    const sourceExists = mergedNodes.some(n => n.id === source);
    const targetExists = mergedNodes.some(n => n.id === target);

    if (!sourceExists || !targetExists) {
      droppedEdges.push({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        reason: !sourceExists ? `source node "${edge.source}" not found` : `target node "${edge.target}" not found`,
      });
      continue;
    }
    if (source === target) {
      droppedEdges.push({ id: edge.id, source, target, reason: 'self-loop dropped' });
      continue;
    }

    let edgeId = edge.id;
    if (aEdgeIds.has(edgeId)) {
      edgeId = `${prefix}${edgeId}`;
      let guard = 0;
      while (aEdgeIds.has(edgeId)) {
        if (guard++ >= 50) {
          throw new Error(`Could not allocate a unique id for edge "${edge.id}" after 50 attempts.`);
        }
        edgeId = `${prefix}${edge.id}_${guard}`;
      }
    }
    aEdgeIds.add(edgeId);
    edge.id = edgeId;
    edge.source = source;
    edge.target = target;
    mergedEdges.push(edge);
  }

  // ── Step 5: report ──
  if (droppedMasters.length > 0) {
    warnings.push(`Project B's master node${droppedMasters.length > 1 ? 's were' : ' was'} excluded — keeping project A's master.`);
  }
  if (droppedEdges.length > 0) {
    warnings.push(`${droppedEdges.length} edge(s) from ${bName} were dropped (references to missing nodes).`);
  }
  if (labelRenames.length > 0) {
    warnings.push(`${labelRenames.length} label conflict(s) resolved by renaming ${bName}'s nodes.`);
  }
  if (bNonMaster.length === 0) {
    warnings.push(`${bName} has no nodes to merge.`);
  }

  return {
    nodes: mergedNodes,
    edges: mergedEdges,
    summary: {
      aName,
      bName,
      aNodeCount: aNonMaster.length,
      bNodeCount: bNonMaster.length,
      totalNodes: mergedNodes.length,
      totalEdges: mergedEdges.length,
      renamedNodes,
      labelRenames,
      droppedEdges,
      droppedMasters,
      warnings,
    },
  };
}
