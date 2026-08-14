import { memo, useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { useProjectStore } from '../store/projectStore';

interface UIFunctionSuggestion {
  id: string;
  label: string;
  type: 'button' | 'slider' | 'toggle' | 'display' | 'input' | 'knob' | 'label';
  description: string;
  defaultAction: string;
  category: string;
  linkedNodeLabel?: string;
  reasoning?: string;
}

interface ConnectedStatus {
  nodeId: string;
  nodeLabel: string;
  connected: boolean;
  linkedWidget: string | null;
  widgetType: string | null;
}

const FUNCTION_TYPE_ICONS: Record<string, string> = {
  button: '🔘', slider: '🎚', toggle: '⤶', display: '📟', input: '✏️', knob: '🎛', label: '🏷',
};

const NODE_TYPE_ICONS: Record<string, string> = {
  master: '🎯', input: '⬅', output: '➡', logic: '⚙', api: '🌐', database: '📦', ui: '🖥', 'ui-functions': '🎛',
};



function UIFunctionNode({ id, selected }: NodeProps) {
  const [functions, setFunctions] = useState<UIFunctionSuggestion[]>([]);
  const [reasoning, setReasoning] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [connectedStatus, setConnectedStatus] = useState<ConnectedStatus[]>([]);
  const [showBridge, setShowBridge] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalCode, setFinalCode] = useState('');
  const [selectedFnId, setSelectedFnId] = useState<string | null>(null);
  const [nodeMapping, setNodeMapping] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const nodes = useProjectStore((s) => s.nodes);
  const masterNode = nodes.find((n) => n.type === 'master');
  const codeNodes = nodes.filter((n) => n.type !== 'master' && n.type !== 'ui-functions');
  const goal = masterNode?.data?.appGoal || '';
  const purpose = masterNode?.data?.appPurpose || '';
  const targetOS = masterNode?.data?.selectedOS || 'linux';

  const checkConnectedStatus = useCallback(async (funcs?: UIFunctionSuggestion[]) => {
    const fns = funcs || functions;
    if (fns.length === 0) return;
    try {
      const res = await fetch('/api/ui-functions/connected-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          architectNodes: fns.map((f) => ({
            id: f.id,
            label: f.label,
            type: f.type,
          })),
          placedWidgets: [],
        }),
      });
      const json = await res.json();
      if (json.success) {
        setConnectedStatus(json.connections || []);
      }
    } catch {}
  }, [functions]);

  const fetchSuggestions = useCallback(async () => {
    if (!goal && codeNodes.length === 0) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/ui-functions/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: goal || 'My App',
          purpose,
          targetOS,
          nodes: codeNodes.map((n) => ({
            id: n.id,
            label: n.data?.label || n.id,
            type: n.type,
            description: n.data?.description || '',
          })),
        }),
      });
      const json = await res.json();          if (json.success && json.functions) {
            setFunctions(json.functions);
            if (json.reasoning) setReasoning(json.reasoning);
            // Build initial node mapping from linkedNodeLabel
            const mapping: Record<string, string> = {};
            json.functions.forEach((fn: UIFunctionSuggestion) => {
              if (fn.linkedNodeLabel) {
                mapping[fn.id] = fn.linkedNodeLabel;
              }
            });
            setNodeMapping(mapping);
            checkConnectedStatus(json.functions);
          } else {
            setError(json.error || 'Failed to generate suggestions');
          }
    } catch (err: any) {
      setError(err.message || 'Request failed');
    }
    setLoading(false);
  }, [goal, purpose, targetOS, codeNodes, checkConnectedStatus]);

  const handleFinalize = useCallback(async () => {
    if (functions.length === 0) return;
    setFinalizing(true);
    setFinalCode('');
    try {
      const placedWidgets = functions.map((f) => ({
        label: f.label,
        type: f.type,
        description: f.description,
        x: 0, y: 0, width: 0, height: 0,
        linkedNodeId: f.id,
      }));

      const res = await fetch('/api/ui-functions/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal,
          purpose,
          targetOS,
          nodes: codeNodes.map((n) => ({
            label: n.data?.label || n.id,
            type: n.type,
            description: n.data?.description || '',
          })),
          placedWidgets,
          connections: [],
        }),
      });
      const json = await res.json();
      if (json.success) {
        setFinalCode(json.code);
        // Store the code in the node data so it flows through generation
        useProjectStore.getState().updateNode(id, { generatedCode: json.code });
      } else {
        setError(json.error || 'Finalize failed');
      }
    } catch (err: any) {
      setError(err.message || 'Finalize request failed');
    }
    setFinalizing(false);
  }, [functions, goal, purpose, targetOS, codeNodes, id]);

  // Filter functions by search query
  const filteredFunctions = useMemo(() => {
    if (!searchQuery.trim()) return functions;
    const q = searchQuery.toLowerCase();
    return functions.filter(
      (fn) =>
        fn.label.toLowerCase().includes(q) ||
        fn.description.toLowerCase().includes(q) ||
        fn.type.toLowerCase().includes(q) ||
        fn.category.toLowerCase().includes(q) ||
        (fn.linkedNodeLabel || '').toLowerCase().includes(q)
    );
  }, [functions, searchQuery]);

  // Drag handler for function items — lets user drag onto canvas to create a node
  const handleFunctionDragStart = useCallback(
    (e: React.DragEvent, fn: UIFunctionSuggestion) => {
      // Store the function data for the canvas drop handler
      const nodeData = JSON.stringify({
        label: fn.label,
        description: `UI ${fn.type}: ${fn.description}`,
        type: 'ui', // Create a 'ui' type node on the architect canvas
        defaultAction: fn.defaultAction,
        category: fn.category,
        functionId: fn.id,
        linkedNodeLabel: fn.linkedNodeLabel || '',
      });
      e.dataTransfer.setData('application/ui-function', nodeData);
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setDragImage(
        (e.currentTarget as HTMLElement).cloneNode(true) as Element,
        60, 15
      );
    },
    []
  );

  // Copy final code to clipboard
  const handleCopyCode = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* fallback */ }
  }, []);

  // Track last fetched inputs so we auto-refresh when goal/codeNodes change,
  // but don't loop when internal state (functions) triggers callback recreation
  const lastFetchedInputs = useRef('');

  useEffect(() => {
    const inputKey = `${goal}|${codeNodes.length}|${purpose}|${targetOS}`;
    if ((goal || codeNodes.length > 0) && inputKey !== lastFetchedInputs.current) {
      lastFetchedInputs.current = inputKey;
      fetchSuggestions();
    }
  }, [goal, codeNodes, purpose, targetOS, fetchSuggestions]);

  const connectedCount = connectedStatus.filter((s) => s.connected).length;
  const totalCount = connectedStatus.length;
  const placedRatio = totalCount > 0 ? connectedCount / totalCount : 0;

  return (
    <div
      className={`custom-node ${selected ? 'selected' : ''}`}
      style={{
        borderColor: '#f472b6',
        minWidth: 320,
        maxWidth: 440,
        position: 'relative',
      }}
    >
      <div className="node-header" style={{ backgroundColor: '#f472b6' }}>
        <span className="node-icon">🎛</span>
        <span className="node-label">UI Functions</span>
        <button
          className="node-expand-btn react-flow__nodrag"
          onClick={(e) => {
            e.stopPropagation();
            setShowBridge(!showBridge);
          }}
          title={showBridge ? 'Collapse' : 'Expand'}
        >
          {showBridge ? '−' : '+'}
        </button>
      </div>

      <div className="node-body" style={{ padding: '10px 12px' }}>
        {/* Loading */}
        {loading && (
          <div style={{ fontSize: 12, color: '#94a3b8', padding: '8px 0', textAlign: 'center' }}>
            ⏳ Analyzing app and suggesting UI controls...
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ fontSize: 11, color: '#ef4444', padding: '4px 0', marginBottom: 4 }}>
            {error}
          </div>
        )}

        {/* No goal yet — improved empty state */}
        {!loading && !error && functions.length === 0 && (
          <div style={{ fontSize: 12, color: '#94a3b8', padding: '12px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.5 }}>🎛</div>
            <p style={{ marginBottom: 6, color: '#e2e8f0', fontWeight: 600 }}>
              Set your app goal in the Blueprint node
            </p>
            <p style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
              This node will automatically analyze your app architecture and suggest
              the UI controls you need — buttons, sliders, displays, inputs, and more.
            </p>
            {(goal || codeNodes.length > 0) && (
              <button
                className="react-flow__nodrag"
                onClick={fetchSuggestions}
                style={{
                  marginTop: 10, padding: '6px 16px',
                  background: '#7c3aed', border: 'none', borderRadius: 4,
                  color: '#fff', fontWeight: 600, fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                🎯 Generate Suggestions Now
              </button>
            )}
          </div>
        )}

        {/* Reasoning box */}
        {reasoning && (
          <div style={{
            marginBottom: 8, padding: '6px 8px',
            background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 4,
            fontSize: 10, color: '#94a3b8', lineHeight: 1.5,
          }}>
            <span style={{ fontWeight: 600, color: '#a78bfa', display: 'block', marginBottom: 2 }}>
              💡 LLM Reasoning
            </span>
            {reasoning}
          </div>
        )}

        {/* Button list */}
        {functions.length > 0 && (
          <>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #2a2a4a'
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>
                🎯 {functions.length} Control{functions.length !== 1 ? 's' : ''} Needed
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="react-flow__nodrag"
                  onClick={fetchSuggestions}
                  style={{
                    padding: '2px 8px', fontSize: 10, background: '#242438',
                    border: '1px solid #3a3a5a', borderRadius: 4, color: '#94a3b8',
                    cursor: 'pointer',
                  }}
                >
                  ↻ Regenerate
                </button>
              </div>
            </div>

            {/* Search/filter bar */}
            {functions.length > 4 && (
              <div style={{ marginBottom: 6, position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: 8, top: '50%',
                  transform: 'translateY(-50%)', fontSize: 10, color: '#4a4a6a',
                  pointerEvents: 'none',
                }}>🔍</span>
                <input
                  className="react-flow__nodrag"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter controls..."
                  style={{
                    width: '100%', padding: '5px 8px 5px 24px',
                    background: '#1a1a2e', border: '1px solid #2a2a4a',
                    borderRadius: 4, color: '#e2e8f0', fontSize: 10,
                    outline: 'none',
                  }}
                />
                {searchQuery && (
                  <button
                    className="react-flow__nodrag"
                    onClick={() => setSearchQuery('')}
                    style={{
                      position: 'absolute', right: 6, top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none', border: 'none', color: '#4a4a6a',
                      cursor: 'pointer', fontSize: 10, padding: '2px 4px',
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            )}

            {/* Placement summary bar */}
            {connectedStatus.length > 0 && (
              <div style={{
                marginBottom: 6, padding: '4px 8px',
                background: '#1a1a2e', borderRadius: 4,
                fontSize: 10, color: '#64748b',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span>Placement:</span>
                  <span>
                    <span style={{ color: '#10b981' }}>✓ {connectedCount} placed</span>
                    <span style={{ color: '#64748b' }}> · </span>
                    <span style={{ color: '#94a3b8' }}>{totalCount - connectedCount} unplaced</span>
                  </span>
                </div>
                {/* Progress bar */}
                <div style={{
                  height: 4, background: '#2a2a4a', borderRadius: 2,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', width: `${placedRatio * 100}%`,
                    background: placedRatio === 1 ? '#10b981' : placedRatio > 0.5 ? '#a78bfa' : '#f472b6',
                    borderRadius: 2,
                    transition: 'width 0.3s ease, background 0.3s ease',
                  }} />
                </div>
              </div>
            )}

            {/* Drag hint */}
            {!showBridge && functions.length > 0 && (
              <div style={{
                fontSize: 9, color: '#4a4a6a', marginBottom: 6, textAlign: 'center',
                padding: '2px 0',
              }}>
                💡 Drag any control onto the canvas to create a UI node, or expand to configure links
              </div>
            )}

            {/* Filtered count hint */}
            {searchQuery && filteredFunctions.length === 0 && (
              <div style={{
                textAlign: 'center', padding: '8px', fontSize: 10, color: '#64748b',
              }}>
                No controls match "{searchQuery}"
              </div>
            )}

            <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filteredFunctions.map((fn) => {
                const status = connectedStatus.find((s) => s.nodeId === fn.id);
                const isPlaced = status?.connected;
                const isSelected = selectedFnId === fn.id;
                const linkedTo = nodeMapping[fn.id] || fn.linkedNodeLabel || '';
                const linkedNode = codeNodes.find(
                  (n) => n.data?.label?.toLowerCase() === linkedTo.toLowerCase()
                );
                return (
                  <div
                    key={fn.id}
                    className="react-flow__nodrag"
                    onClick={() => setSelectedFnId(isSelected ? null : fn.id)}
                    onDragStart={(e) => handleFunctionDragStart(e, fn)}
                    draggable
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 3,
                      padding: '5px 8px', background: isSelected ? '#2a1a3e' : '#242438',
                      border: '1px solid',
                      borderColor: isSelected ? 'rgba(167,139,250,0.5)' : isPlaced ? 'rgba(16,185,129,0.3)' : '#2a2a4a',
                      borderRadius: 4, fontSize: 11,
                      cursor: 'grab',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                    title="Drag onto canvas to create a UI node"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>
                        {FUNCTION_TYPE_ICONS[fn.type] || '🔘'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontWeight: 600, color: '#e2e8f0', fontSize: 11,
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          {fn.label}
                          {fn.id && (
                            <span style={{ fontSize: 8, color: '#4a4a6a', fontFamily: 'monospace' }}>
                              {fn.id}
                            </span>
                          )}
                        </div>
                        <div style={{ color: '#64748b', fontSize: 10 }}>{fn.description}</div>
                        {linkedTo && (
                          <div style={{
                            fontSize: 9, marginTop: 2,
                            color: linkedNode ? '#a78bfa' : '#94a3b8',
                            display: 'flex', alignItems: 'center', gap: 4,
                          }}>
                            <span>→</span>
                            <span
                              style={{
                                background: linkedNode ? 'rgba(167,139,250,0.1)' : 'rgba(148,163,184,0.1)',
                                padding: '1px 5px', borderRadius: 2,
                              }}
                            >
                              {linkedTo}
                            </span>
                            {!linkedNode && (
                              <span style={{ color: '#dc2626' }}>⚠ unknown node</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        {isPlaced ? (
                          <span style={{
                            fontSize: 9, color: '#10b981',
                            background: 'rgba(16,185,129,0.12)',
                            padding: '2px 6px', borderRadius: 3, whiteSpace: 'nowrap',
                            display: 'flex', alignItems: 'center', gap: 3,
                          }}>
                            ✓ {status?.widgetType || fn.type}
                          </span>
                        ) : (
                          <span style={{
                            fontSize: 9, color: '#64748b',
                            background: 'rgba(100,116,139,0.12)',
                            padding: '2px 6px', borderRadius: 3, whiteSpace: 'nowrap',
                            display: 'flex', alignItems: 'center', gap: 3,
                          }}>
                            ○ unplaced
                          </span>
                        )}
                        <span style={{ fontSize: 9, color: '#4a4a6a', marginLeft: 2 }}>
                          ⠿
                        </span>
                      </div>
                    </div>

                    {/* Expanded: Node remapping & reasoning */}
                    {isSelected && (
                      <div style={{
                        marginTop: 4, paddingTop: 4,
                        borderTop: '1px solid #2a2a4a',
                      }}>
                        {/* Improved node mapping dropdown with icons */}
                        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>
                          Connect to architect node:
                        </div>
                        <select
                          className="react-flow__nodrag"
                          value={nodeMapping[fn.id] || linkedTo}
                          onChange={(e) => setNodeMapping(prev => ({ ...prev, [fn.id]: e.target.value }))}
                          style={{
                            width: '100%', padding: '4px 6px',
                            background: '#1a1a2e', border: '1px solid #3a3a5a',
                            borderRadius: 3, color: '#e2e8f0', fontSize: 10,
                            outline: 'none', cursor: 'pointer',
                          }}
                        >
                          <option value="">— Select a node —</option>
                          {codeNodes.map((n) => (
                            <option key={n.id} value={n.data?.label || n.id}>
                              {NODE_TYPE_ICONS[n.type || 'logic'] || '⬡'} {n.data?.label || n.id} ({n.type})
                            </option>
                          ))}
                        </select>

                        {/* Quick link button to selected node */}
                        {codeNodes.length > 1 && (
                          <div style={{
                            marginTop: 4, display: 'flex', gap: 4,
                            flexWrap: 'wrap',
                          }}>
                            {codeNodes.slice(0, 6).map((n) => {                                  const nodeLabel = n.data?.label || n.id;
                              const isActive = (nodeMapping[fn.id] || fn.linkedNodeLabel) === nodeLabel;
                              return (
                                <button
                                  key={n.id}
                                  className="react-flow__nodrag"
                                  onClick={() => setNodeMapping(prev => ({
                                    ...prev,
                                    [fn.id]: isActive ? '' : nodeLabel,
                                  }))}
                                  style={{
                                    padding: '2px 6px', fontSize: 9,
                                    background: isActive ? 'rgba(167,139,250,0.2)' : '#1a1a2e',
                                    border: `1px solid ${isActive ? '#a78bfa' : '#2a2a4a'}`,
                                    borderRadius: 3, cursor: 'pointer',
                                    color: isActive ? '#a78bfa' : '#64748b',
                                    transition: 'all 0.15s',
                                  }}
                                >
                                  {NODE_TYPE_ICONS[n.type || 'logic'] || '⬡'} {nodeLabel}
                                </button>
                              );
                            })}
                            {codeNodes.length > 6 && (
                              <span style={{ fontSize: 9, color: '#4a4a6a', alignSelf: 'center' }}>
                                +{codeNodes.length - 6} more
                              </span>
                            )}
                          </div>
                        )}

                        {/* Reasoning */}
                        {fn.reasoning && (
                          <div style={{
                            marginTop: 4, fontSize: 9,
                            color: '#6b7280', fontStyle: 'italic',
                            lineHeight: 1.4, padding: '3px 0',
                          }}>
                            💬 {fn.reasoning}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Widget Finalize Panel */}
            {showBridge && (
              <div style={{ marginTop: 10, padding: 8, background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#a78bfa', marginBottom: 6 }}>
                  Widget Finalize
                </div>
                <p style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>
                  Finalize widget placement and generate connection code.
                </p>
                <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>
                  Connected: {connectedCount}/{connectedStatus.length}
                </div>

                {/* Finalize Button */}
                <button
                  className="react-flow__nodrag"
                  onClick={handleFinalize}
                  disabled={finalizing || functions.length === 0}
                  style={{
                    width: '100%', padding: '8px 0', marginTop: 4,
                    background: finalizing ? '#3a3a5a' : '#7c3aed',
                    border: 'none', borderRadius: 4,
                    color: finalizing ? '#94a3b8' : '#fff',
                    fontWeight: 600, fontSize: 12, cursor: 'pointer',
                  }}
                >
                  {finalizing ? '⏳ Finalizing...' : '🚀 Finalize — Build App UI'}
                </button>

                {/* Generated code with copy button */}
                {finalCode && (
                  <details style={{ marginTop: 8 }} open>
                    <summary style={{ fontSize: 10, color: '#10b981', cursor: 'pointer', fontWeight: 600 }}>
                      ✅ Connection Code Generated
                    </summary>
                    <div style={{ position: 'relative', marginTop: 6 }}>
                      <pre style={{
                        padding: 8, paddingRight: 36, background: '#0f0f1a',
                        border: '1px solid #2a2a4a', borderRadius: 4,
                        fontSize: 10, color: '#6ee7b7', maxHeight: 150, overflow: 'auto',
                        whiteSpace: 'pre-wrap', fontFamily: 'monospace',
                      }}>
                        {finalCode}
                      </pre>
                      <button
                        className="react-flow__nodrag"
                        onClick={() => handleCopyCode(finalCode)}
                        title="Copy to clipboard"
                        style={{
                          position: 'absolute', top: 6, right: 6,
                          padding: '3px 8px', fontSize: 10,
                          background: copied ? 'rgba(16,185,129,0.2)' : '#1a1a2e',
                          border: `1px solid ${copied ? '#10b981' : '#3a3a5a'}`,
                          borderRadius: 3, cursor: 'pointer',
                          color: copied ? '#10b981' : '#94a3b8',
                          transition: 'all 0.15s',
                        }}
                      >
                        {copied ? '✓ Copied' : '📋 Copy'}
                      </button>
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* Expand hint */}
            <div style={{
              marginTop: 4, fontSize: 10, color: '#64748b', textAlign: 'center',
              cursor: 'pointer', userSelect: 'none',
            }} onClick={() => setShowBridge(!showBridge)}>
              {showBridge ? '− Hide Finalize Panel' : '+ Finalize Widgets'}
            </div>
          </>
        )}
      </div>

      <Handle type="target" position={Position.Top} className="handle-top" />
      <Handle type="source" position={Position.Bottom} className="handle-bottom" />
    </div>
  );
}

export default memo(UIFunctionNode);
