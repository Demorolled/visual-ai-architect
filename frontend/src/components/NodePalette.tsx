import React from 'react';
import { NodeType, NODE_TYPE_OPTIONS } from '../types';
import { useProjectStore, isRootNode } from '../store/projectStore';

interface NodePaletteProps {
  onDragStart: (event: React.DragEvent, nodeType: NodeType) => void;
}

// The type registry now lives in types.ts (NODE_TYPE_OPTIONS) so the palette and
// the per-node setup window list the same types from one place.
const nodeTypes = NODE_TYPE_OPTIONS;

export default function NodePalette({ onDragStart }: NodePaletteProps) {
  const { nodes, selectedNode, setSelectedNode, deleteNode, planMode, planSeedId } = useProjectStore();

  // Plan Mode starts with exactly ONE node. Until it is placed there is nothing
  // to choose between, so the palette offers the seed instead of the type list —
  // the type is picked in the window that opens on drop.
  const needsSeed = planMode && !planSeedId;

  const handleDeleteSelected = () => {
    // Roots are protected here on purpose: deleting one must go through the
    // tree bar, which also deregisters the tree. Deleting the node alone would
    // leave an AppTree pointing at a root that is gone.
    if (!selectedNode || isRootNode(nodes.find((n) => n.id === selectedNode))) return;
    deleteNode(selectedNode);
    setSelectedNode(null);
  };

  const handleClearAll = () => {
    const nonMaster = nodes.filter((n) => !isRootNode(n));
    if (nonMaster.length === 0) return;
    if (confirm('Clear all nodes from the canvas? The app tree roots will be kept.')) {
      nonMaster.forEach((n) => deleteNode(n.id));
      setSelectedNode(null);
    }
  };

  return (
    <div className="node-palette">
      <h3>{planMode ? 'Plan' : 'Nodes'}</h3>
      <p className="palette-hint">
        {needsSeed
          ? 'Drag the starting node into the canvas to begin'
          : 'Drag nodes to the canvas'}
      </p>

      <div className="node-list">
        {needsSeed ? (
          <div
            className="node-item node-seed-item"
            draggable
            onDragStart={(e) => { onDragStart(e, 'logic'); }}
            title="Your starting node — you choose its type and language when it lands"
          >
            <span className="node-item-icon">◉</span>
            <div className="node-item-info">
              <span className="node-item-label">Starting node</span>
              <span className="node-item-desc">Drag in, then describe what you want to build</span>
            </div>
          </div>
        ) : (
          nodeTypes.map((node) => (
            <div
              key={node.type}
              className="node-item"
              draggable
              onDragStart={(e) => { onDragStart(e, node.type); } }
            >
              <span className="node-item-icon">{node.icon}</span>
              <div className="node-item-info">
                <span className="node-item-label">{node.label}</span>
                <span className="node-item-desc">{node.description}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="palette-divider" />

      <div className="palette-actions">
        <div className="placed-nodes-header">
          <span>On Canvas ({nodes.length})</span>
        </div>
        <div className="placed-nodes-list">
          {nodes.length === 0 ? (
            <p className="placed-nodes-empty">No nodes placed</p>
          ) : (
            nodes.map((n) => (
              <div
                key={n.id}
                className={`placed-node-item ${selectedNode === n.id ? 'selected' : ''} ${
                  planSeedId === n.id ? 'plan-seed' : ''
                }`}
                onClick={() => setSelectedNode(n.id === selectedNode ? null : n.id)}
              >
                <span className="placed-node-type">{n.data?.type || '?'}</span>
                <span className="placed-node-label">
                  {planSeedId === n.id ? '◉ ' : ''}{n.data?.label || n.id}
                </span>
                {!isRootNode(n) && (
                  <button
                    className="placed-node-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNode(n.id);
                      if (selectedNode === n.id) setSelectedNode(null);
                    }}
                    title="Delete this node"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))
          )}
        </div>
        <button
          className="palette-btn delete-btn"
          onClick={handleDeleteSelected}
          disabled={!selectedNode}
        >
          Delete Selected
        </button>
        <button
          className="palette-btn clear-btn"
          onClick={handleClearAll}
          disabled={nodes.length === 0}
        >
          Clear All
        </button>
      </div>
    </div>
  );
}
