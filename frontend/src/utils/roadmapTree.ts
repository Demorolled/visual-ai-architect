export type TreeNode = {
  id: string;
  node?: { id: string; data?: { label?: string; status?: string; type?: string; subNodes?: { id: string }[] } };
  children: TreeNode[];
};

export function buildTrees(
  nodes: { id: string; data?: { label?: string; status?: string; type?: string; subNodes?: { id: string }[] } }[],
  edges: { source: string; target: string }[]
) {
  const childrenMap: Record<string, string[]> = {};
  const hasParent: Record<string, boolean> = {};

  nodes.forEach((n) => {
    childrenMap[n.id] = [];
    hasParent[n.id] = false;
  });

  edges.forEach((e) => {
    if (childrenMap[e.source]) {
      childrenMap[e.source].push(e.target);
    }
    hasParent[e.target] = true;
  });

  const roots = nodes.filter((n) => !hasParent[n.id]);

  return roots.map((root) => buildTree(root.id, childrenMap, nodes));
}

function buildTree(
  nodeId: string,
  childrenMap: Record<string, string[]>,
  allNodes: { id: string; data?: { label?: string; status?: string; type?: string; subNodes?: { id: string }[] } }[]
): TreeNode {
  const node = allNodes.find((n) => n.id === nodeId);
  const children: TreeNode[] = (childrenMap[nodeId] || []).map((childId) =>
    buildTree(childId, childrenMap, allNodes)
  );
  return { id: nodeId, node, children };
}
