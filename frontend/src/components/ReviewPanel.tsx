import { useState } from 'react';
import { useProjectStore } from '../store/projectStore';
import { nodeDatabase } from '../utils/nodeDatabase';

interface ReviewPanelProps {
  onApprove: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
}

export default function ReviewPanel({ onApprove, onRegenerate, onCancel }: ReviewPanelProps) {
  const nodes = useProjectStore(s => s.nodes);
  const edges = useProjectStore(s => s.edges);
  const projectName = useProjectStore(s => s.projectName);
  const targetOS = useProjectStore(s => s.targetOS);
  const includeGUI = useProjectStore(s => s.includeGUI);
  const [expandedNode, setExpandedNode] = useState<string | null>(null);
  const [expandedEdge, setExpandedEdge] = useState(false);
  const [saving, setSaving] = useState(false);

  const codeNodes = nodes.filter(n => n.type !== 'master');
  const allNodesHaveCode = codeNodes.every(n => n.data?.generatedCode);

  // Build edge map: node ID → list of connected node labels
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const edgeList = edges.map(e => {
    const sourceNode = nodeMap.get(e.source);
    const targetNode = nodeMap.get(e.target);
    return {
      id: e.id,
      source: sourceNode?.data?.label || e.source,
      target: targetNode?.data?.label || e.target,
      sourceType: sourceNode?.type || '?',
      targetType: targetNode?.type || '?',
    };
  });

  const handleLearnNodes = () => {
    for (const node of codeNodes) {
      if (node.data) {
        nodeDatabase.learnFromNode({
          type: node.type || 'logic',
          label: node.data.label || node.id,
          description: node.data.description || '',
          language: node.data.language,
        });
      }
    }
  };

  const handleApprove = async () => {
    setSaving(true);
    handleLearnNodes();
    await onApprove();
    setSaving(false);
  };

  return (
    <div className="review-panel">
      <div className="rp-header">
        <h2>📋 Review Your Application</h2>
        <span className="rp-subtitle">
          {projectName} · {targetOS}{includeGUI ? ' · 🖥 With GUI' : ' · 💻 CLI Only'} · {codeNodes.length} nodes · {edges.length} connections
        </span>
      </div>

      <div className="rp-summary">
        <div className="rp-summary-item">
          <span className="rp-summary-label">All nodes have code:</span>
          <span className={`rp-summary-value ${allNodesHaveCode ? 'yes' : 'no'}`}>
            {allNodesHaveCode ? '✅ Yes' : '⚠️ Some nodes missing code'}
          </span>
        </div>
        <div className="rp-summary-item">
          <span className="rp-summary-label">File connections (edges):</span>
          <span className="rp-summary-value">{edges.length} import/call relationships</span>
        </div>
      </div>

      {/* ── Edge / File Dependency Map ── */}
      {edgeList.length > 0 && (
        <div className="rp-edge-section" style={{ marginBottom: 12 }}>
          <div
            className="rp-edge-header"
            onClick={() => setExpandedEdge(!expandedEdge)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              background: 'rgba(167,139,250,0.08)',
              border: '1px solid rgba(167,139,250,0.2)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              color: '#a78bfa',
            }}
          >
            <span>🔗 File Dependency Graph ({edgeList.length} connections)</span>
            <span style={{ marginLeft: 'auto' }}>{expandedEdge ? '▼' : '▶'}</span>
          </div>
          {expandedEdge && (
            <div className="rp-edge-list" style={{ padding: 6, border: '1px solid rgba(167,139,250,0.15)', borderTop: 'none' }}>
              {edgeList.map(e => (
                <div key={e.id} className="rp-edge-item" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 6px',
                  fontSize: 11,
                  color: '#cbd5e1',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                  <span className={`rp-node-type-dot type-${e.sourceType}`} style={{ width: 6, height: 6 }} />
                  <span>{e.source}</span>
                  <span style={{ color: '#64748b' }}>→</span>
                  <span className={`rp-node-type-dot type-${e.targetType}`} style={{ width: 6, height: 6 }} />
                  <span>{e.target}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: '#64748b' }}>import/call</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rp-node-list">
        <h3>📦 Files / Nodes</h3>
        {codeNodes.map(node => (
          <div key={node.id} className={`rp-node-card ${expandedNode === node.id ? 'expanded' : ''}`}>
            <div className="rp-node-header" onClick={() => setExpandedNode(expandedNode === node.id ? null : node.id)}>
              <span className={`rp-node-type-dot type-${node.type || 'logic'}`} />
              <span className="rp-node-label">{node.data?.label || node.id}</span>
              <span className="rp-node-type">{node.type}</span>
              <span className="rp-node-lang">{node.data?.language || 'ts'}</span>
              <span className={`rp-node-status ${node.data?.status || 'pending'}`}>
                {node.data?.generatedCode ? '✅' : '⏳'}
              </span>
              <span className="rp-node-expand">{expandedNode === node.id ? '▼' : '▶'}</span>
            </div>
            {expandedNode === node.id && (
              <div className="rp-node-detail">
                <div className="rp-node-desc">
                  <strong>Description:</strong> {node.data?.description || 'No description'}
                </div>
                {/* Show file-specific edges for this node */}
                {(() => {
                  const nodeEdges = edgeList.filter(e => e.source === (node.data?.label || node.id) || e.target === (node.data?.label || node.id));
                  return nodeEdges.length > 0 ? (
                    <div className="rp-node-edges" style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>
                      <strong>Connections:</strong>
                      {nodeEdges.map(e => (
                        <div key={e.id} style={{ paddingLeft: 8 }}>
                          {e.source === (node.data?.label || node.id)
                            ? `📤 Exports/calls → ${e.target}`
                            : `📥 Imports from ← ${e.source}`
                          }
                        </div>
                      ))}
                    </div>
                  ) : null;
                })()}
                {node.data?.generatedCode && (
                  <pre className="rp-node-code">
                    <code>{node.data.generatedCode.substring(0, 500)}</code>
                    {node.data.generatedCode.length > 500 && <span className="rp-code-truncated">... (truncated)</span>}
                  </pre>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="rp-actions">
        <button className="rp-btn rp-btn-cancel" onClick={onCancel}>
          🔄 Back to Editing
        </button>
        <button className="rp-btn rp-btn-regenerate" onClick={onRegenerate}>
          ⚡ Regenerate Code
        </button>
        <button
          className="rp-btn rp-btn-approve"
          onClick={handleApprove}
          disabled={saving}
        >
          {saving ? '⏳ Saving Design...' : '✅ Approve & Save Design'}
        </button>
      </div>
      {saving && <div className="rp-saving">Saving design to library and generating training datasheet...</div>}
    </div>
  );
}
