import { useCallback, useState } from 'react';
import { useProjectStore } from '../store/projectStore';
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
  const { setLogicEditorOpen, setSelectedNode } = useProjectStore();
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

  const handleOpenLogic = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedNode(treeNode.id);
      setLogicEditorOpen(true);
    },
    [treeNode.id, setSelectedNode, setLogicEditorOpen]
  );

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
        <button
          className="tree-open-logic-btn"
          onClick={handleOpenLogic}
          title="Open node logic editor"
        >
          ⚙
        </button>
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

export default function RoadmapDocked() {
  const { nodes, edges, selectedNode, setSelectedNode, setRoadmapDetached } = useProjectStore();

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      setSelectedNode(nodeId === selectedNode ? null : nodeId);
    },
    [selectedNode, setSelectedNode]
  );

  const handleDetach = useCallback(() => {
    const w = window.open('/roadmap.html', 'roadmap-window', 'width=500,height=800,menubar=no,toolbar=no');
    if (w) {
      setRoadmapDetached(true);
    }
  }, [setRoadmapDetached]);

  const trees = buildTrees(nodes, edges);

  return (
    <div className="roadmap-panel docked">
      <div className="roadmap-header">
        <div className="roadmap-header-left">
          <h3 className="roadmap-title">Roadmap</h3>
        </div>
        <div className="roadmap-header-actions">
          <button
            className="roadmap-action-btn"
            onClick={handleDetach}
            title="Open roadmap in new window"
          >
            ↗
          </button>
        </div>
      </div>

      <div className="roadmap-content docked">
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
                onNodeClick={handleNodeClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
