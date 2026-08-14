import { describe, it, expect } from 'vitest';
import { buildTrees, type TreeNode } from '../utils/roadmapTree';

interface TestNode {
  id: string;
  data?: { label?: string; status?: string; type?: string; subNodes?: { id: string }[] };
}

const N = (id: string, label?: string): TestNode => ({ id, data: label ? { label } : {} });

function flatten(roots: TreeNode[]): string[] {
  const out: string[] = [];
  const walk = (n: TreeNode) => {
    out.push(n.id);
    n.children.forEach(walk);
  };
  roots.forEach(walk);
  return out;
}

describe('buildTrees', () => {
  it('returns an empty array for no nodes', () => {
    expect(buildTrees([], [])).toEqual([]);
  });

  it('treats every node as a root when there are no edges', () => {
    const roots = buildTrees([N('a'), N('b')], []);
    expect(roots.map(r => r.id)).toEqual(['a', 'b']);
    expect(roots.every(r => r.children.length === 0)).toBe(true);
  });

  it('builds a single tree from a parent→child edge', () => {
    const roots = buildTrees([N('a'), N('b')], [{ source: 'a', target: 'b' }]);
    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe('a');
    expect(roots[0].children.map(c => c.id)).toEqual(['b']);
  });

  it('builds a deep chain in dependency order', () => {
    const nodes = [N('root'), N('mid'), N('leaf')];
    const edges = [
      { source: 'root', target: 'mid' },
      { source: 'mid', target: 'leaf' },
    ];
    const roots = buildTrees(nodes, edges);
    expect(flatten(roots)).toEqual(['root', 'mid', 'leaf']);
  });

  it('produces multiple roots for a forest', () => {
    const nodes = [N('a'), N('b'), N('c')];
    const edges = [
      { source: 'a', target: 'c' },
      { source: 'b', target: 'c' },
    ];
    const roots = buildTrees(nodes, edges);
    expect(roots.map(r => r.id).sort()).toEqual(['a', 'b']);
    // 'c' appears under both parents
    const flat = flatten(roots);
    expect(flat.filter(id => id === 'c')).toHaveLength(2);
  });

  it('preserves node references and data on each tree node', () => {
    const roots = buildTrees([N('a', 'Alpha')], []);
    expect(roots[0].node?.data?.label).toBe('Alpha');
  });

  it('handles a diamond graph without infinite recursion', () => {
    const nodes = [N('root'), N('x'), N('y'), N('leaf')];
    const edges = [
      { source: 'root', target: 'x' },
      { source: 'root', target: 'y' },
      { source: 'x', target: 'leaf' },
      { source: 'y', target: 'leaf' },
    ];
    const roots = buildTrees(nodes, edges);
    const flat = flatten(roots);
    expect(flat).toHaveLength(5); // root + x + y + leaf ×2 (one per parent)
    expect(flat[0]).toBe('root');
    expect(flat.filter(id => id === 'leaf')).toHaveLength(2);
  });

  it('turns edges to unknown targets into empty child stubs (no crash)', () => {
    // buildTree recurses through the edge map even for ids missing from the
    // node list — the child exists but carries no node reference.
    const roots = buildTrees([N('a')], [{ source: 'a', target: 'ghost' }]);
    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe('a');
    expect(roots[0].children).toHaveLength(1);
    expect(roots[0].children[0].id).toBe('ghost');
    expect(roots[0].children[0].node).toBeUndefined();
  });

  it('does not crash on a self-loop (node pointing to itself)', () => {
    // A self-loop marks the node as having a parent, so it is not a root;
    // the loop is cut because the node is only expanded from the root set.
    const roots = buildTrees([N('a')], [{ source: 'a', target: 'a' }]);
    expect(roots).toEqual([]);
  });
});
