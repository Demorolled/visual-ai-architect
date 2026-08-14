import { useState } from 'react';
import { Node, Edge } from 'reactflow';
import { buildTrees, TreeNode } from '../utils/roadmapTree';
import './Roadmap.css';

function TreeNodeView({
  treeNode,
  depth,
  selectedNode,
  onNodeClick,
}: {
  treeNode: TreeNode;
  depth: number;
  selectedNode: string | null;
  onNodeClick: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const { node } = treeNode;
  if (!node) return null;

  const hasChildren = treeNode.children.length > 0;
  const isSelected = selectedNode === treeNode.id;
  const subNodeCount = (node.data?.subNodes as { id: string }[])?.length || 0;

  const statusIcon = (status?: string) => {
    switch (status) {
      case 'valid': return '✓';
      case 'error': return '✗';
      case 'generating': return '⏳';
      default: return '○';
    }
  };

  const nodeColor = (type?: string) => {
    const colors: Record<string, string> = {
      input: '#4ade80',
      output: '#f87171',
      logic: '#60a5fa',
      api: '#a78bfa',
      database: '#fbbf24',
      ui: '#f472b6',
    };
    return colors[type || 'logic'] || '#666';
  };

  return (
    <div className="tree-node">
      <div
        className={`tree-node-row ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: depth * 20 }}
        onClick={() => onNodeClick(treeNode.id)}
      >
        {hasChildren ? (
          <button
            className="tree-toggle"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? '▼' : '▶'}
          </button>
        ) : (
          <span className="tree-leaf-indicator" />
        )}
        <span
          className="tree-status-dot"
          style={{ backgroundColor: nodeColor(node.data?.type) }}
        >
          {statusIcon(node.data?.status)}
        </span>
        <span className="tree-label">{node.data?.label || treeNode.id}</span>
        {subNodeCount > 0 && (
          <span className="tree-subnode-badge">{subNodeCount}</span>
        )}
        <span className="tree-type">{node.data?.type}</span>
      </div>

      {expanded && hasChildren && (
        <div className="tree-children">
          {treeNode.children.map((child: TreeNode) => (
            <TreeNodeView
              key={child.id}
              treeNode={child}
              depth={depth + 1}
              selectedNode={selectedNode}
              onNodeClick={onNodeClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface RoadmapWindowProps {
  nodes: Node[];
  edges: Edge[];
  selectedNode: string | null;
  onNodeClick: (id: string) => void;
}

export default function RoadmapWindow({ nodes, edges, selectedNode, onNodeClick }: RoadmapWindowProps) {
  const trees = buildTrees(
    nodes.map((n) => ({
      id: n.id,
      data: n.data as { label?: string; status?: string; type?: string; subNodes?: { id: string }[] },
    })),
    edges
  );

  return (
    <div className="roadmap-content window-content">
      {nodes.length === 0 ? (
        <p className="roadmap-empty">Drag nodes onto the canvas to begin</p>
      ) : (
        <div className="tree-root">
          {trees.map((tree) => (
            <TreeNodeView
              key={tree.id}
              treeNode={tree}
              depth={0}
              selectedNode={selectedNode}
              onNodeClick={onNodeClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
