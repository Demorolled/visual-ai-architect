import React from 'react';
import { NodeType } from '../types';
import { useProjectStore } from '../store/projectStore';

interface NodePaletteProps {
  onDragStart: (event: React.DragEvent, nodeType: NodeType) => void;
}

const nodeTypes: { type: NodeType; label: string; icon: string; description: string }[] = [
  { type: 'input', label: 'Input', icon: '⬅', description: 'Data entry point' },
  { type: 'output', label: 'Output', icon: '➡', description: 'Result display' },
  { type: 'logic', label: 'Logic', icon: '⚙', description: 'Processing/conditions' },
  { type: 'api', label: 'API', icon: '🌐', description: 'External service call' },
  { type: 'database', label: 'Database', icon: '📦', description: 'Data storage' },
  { type: 'ui', label: 'UI', icon: '🖥', description: 'User interface element' },
  { type: 'ui-functions', label: 'UI Functions', icon: '🎛', description: 'Generates button/control list for the UI canvas' },
  { type: 'gui-layout', label: 'GUI Layout', icon: '⛭', description: 'Imported GUI widget layout' },
];

export default function NodePalette({ onDragStart }: NodePaletteProps) {
  const { nodes, selectedNode, setSelectedNode, deleteNode } = useProjectStore();

  const handleDeleteSelected = () => {
    if (!selectedNode || selectedNode === 'master-node') return;
    deleteNode(selectedNode);
    setSelectedNode(null);
  };

  const handleClearAll = () => {
    const nonMaster = nodes.filter((n) => n.id !== 'master-node');
    if (nonMaster.length === 0) return;
    if (confirm('Clear all nodes from the canvas? The blueprint node will be kept.')) {
      nonMaster.forEach((n) => deleteNode(n.id));
      setSelectedNode(null);
    }
  };

  return (
    <div className="node-palette">
      <h3>Nodes</h3>
      <p className="palette-hint">Drag nodes to the canvas</p>

      <div className="node-list">
        {nodeTypes.map((node) => (
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
        ))}
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
                className={`placed-node-item ${selectedNode === n.id ? 'selected' : ''}`}
                onClick={() => setSelectedNode(n.id === selectedNode ? null : n.id)}
              >
                <span className="placed-node-type">{n.data?.type || '?'}</span>
                <span className="placed-node-label">{n.data?.label || n.id}</span>
                {n.id !== 'master-node' && (
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
