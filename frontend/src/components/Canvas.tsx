import { useCallback, useRef, useEffect, useState } from 'react';
import { NodeType, NodeStatus, CodeLanguage, WizardStep } from '../types';
import { Node } from 'reactflow';
import Canvas3D, { resetCameraView, panCamera, centerOnNodes } from './Canvas3D';
import type { UIDragData } from './Canvas3D';
import NodeDetailOverlay from './NodeDetailOverlay';
import NodeCodeEditor from './NodeCodeEditor';
import { useProjectStore, getNextNodeId } from '../store/projectStore';
import { autoLearn } from '../utils/autoLearn';
import { userProfile } from '../utils/userProfile';
import './Canvas.css';

const POST_GEN_STEPS: WizardStep[] = ['review', 'saving', 'complete'];

const typeColors: Record<string, string> = {
  master: '#f59e0b',
  input: '#4ade80',
  output: '#f87171',
  logic: '#60a5fa',
  api: '#a78bfa',
  database: '#fbbf24',
  ui: '#f472b6',
  'ui-functions': '#f472b6',
  'gui-layout': '#00d9ff',
};

export default function Canvas() {
  const store = useProjectStore();
  const { addNode, setSelectedNode, updateNodePosition, targetOS, wizardStep } = store;

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [pendingNode, setPendingNode] = useState<{ node: { id: string; type: NodeType; x: number; y: number }; index: number } | null>(null);
  const [nodeName, setNodeName] = useState('');
  const [nodeDesc, setNodeDesc] = useState('');
  const { canUndo, canRedo, undo, redo } = useProjectStore();

  // ── Post-hoc rework state ──
  const [reworkNeeded, setReworkNeeded] = useState(false);
  const [reworking, setReworking] = useState(false);
  const nodeCountAtCodeGen = useRef(0);
  const prevCodeGenRef = useRef(false);

  const masterCreatedRef = useRef(false);

  // Track when we enter or exit code-gen/review/complete phase
  const isPostGen = POST_GEN_STEPS.includes(wizardStep);
  useEffect(() => {
    const wasPostGen = prevCodeGenRef.current;
    if (!wasPostGen && isPostGen) {
      nodeCountAtCodeGen.current = store.nodes.filter(n => n.type !== 'master').length;
    }
    prevCodeGenRef.current = isPostGen;
  }, [isPostGen, store.nodes]);

  // Detect new nodes added after code-gen phase
  useEffect(() => {
    if (!isPostGen) {
      setReworkNeeded(false);
      return;
    }
    const currentCodeNodes = store.nodes.filter(n => n.type !== 'master').length;
    if (currentCodeNodes > nodeCountAtCodeGen.current) {
      setReworkNeeded(true);
    }
  }, [store.nodes, isPostGen]);

  useEffect(() => {
    if (masterCreatedRef.current) return;
    const hasMaster = store.nodes.some((n: Node) => n.type === 'master');
    if (!hasMaster && store.nodes.length === 0) {
      const masterNode: Node = {
        id: 'master-node',
        type: 'master',
        position: { x: 250, y: 50 },
        data: {
          label: 'App Blueprint',
          appGoal: '',
          appPurpose: '',
          selectedOS: targetOS || 'linux',
          status: 'pending',
        },
      };
      addNode(masterNode);
      masterCreatedRef.current = true;
    }
  }, []);

  // ── Center camera on nodes when they first appear ──
  const centeringLock = useRef(false);
  useEffect(() => {
    if (centeringLock.current) return;
    if (store.nodes.length > 0) {
      const positions = store.nodes.map(n => ({ x: n.position.x, y: n.position.y }));
      centerOnNodes(positions);
      centeringLock.current = true;
    }
  }, [store.nodes.length]);

  // ── Node Selection (click in 3D scene) ──
  const handleSelectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
    setSelectedNode(id);
  }, [setSelectedNode]);

  // ── Node Double-click → Open Code Editor ──
  const codeEditorNodeId = useProjectStore((s) => s.codeEditorNodeId);
  const setCodeEditorNodeId = useProjectStore((s) => s.setCodeEditorNodeId);

  const handleDoubleClickNode = useCallback((id: string) => {
    const node = store.nodes.find(n => n.id === id);
    if (node && node.type !== 'master' && node.type !== 'ui-functions') {
      setCodeEditorNodeId(id);
    }
  }, [store.nodes, setCodeEditorNodeId]);

  // ── Node Drag in 3D ──
  const handleDragNode = useCallback((id: string, x: number, y: number) => {
    updateNodePosition(id, { x, y });
  }, [updateNodePosition]);

  // ── Drop from Palette ──
  const handleDropNode = useCallback((type: NodeType, x: number, y: number, uiData?: UIDragData) => {
    const tempId = `temp_${Date.now()}`;
    setPendingNode({ node: { id: tempId, type, x, y }, index: 0 });
    // Pre-fill name and description when dragging from UIFunctionNode widgets
    if (uiData) {
      setNodeName(uiData.label);
      setNodeDesc(uiData.description);
    } else {
      setNodeName('');
      setNodeDesc('');
    }
  }, []);

  const handleConfirmNode = useCallback(() => {
    if (!pendingNode) return;
    const name = nodeName.trim() || pendingNode.node.type;
    const newNode: Node = {
      id: getNextNodeId(),
      type: pendingNode.node.type,
      position: { x: pendingNode.node.x, y: pendingNode.node.y },
      data: {
        label: name,
        description: nodeDesc,
        type: pendingNode.node.type,
        status: 'pending' as NodeStatus,
        language: (userProfile.get().preferences.preferredLanguages?.[0] || 'typescript') as CodeLanguage,
      },
    };
    addNode(newNode);
    autoLearn.nodeCreated(name, pendingNode.node.type, 'typescript', nodeDesc);
    // Auto-open code editor for every newly placed node so the user can
    // read, write, or modify code immediately
    setCodeEditorNodeId(newNode.id);
    setPendingNode(null);
  }, [pendingNode, nodeName, nodeDesc, addNode, setCodeEditorNodeId]);

  const handleCancelNode = useCallback(() => {
    setPendingNode(null);
  }, []);

  // ── Rework Handler ──
  const handleRework = useCallback(async () => {
    setReworking(true);
    const state = useProjectStore.getState();
    const allNodes = state.nodes.filter(n => n.type !== 'master');
    const allEdges = state.edges;
    const masterNode = state.nodes.find(n => n.type === 'master');
    const goal = masterNode?.data?.appGoal || state.projectName || '';
    const purpose = masterNode?.data?.appPurpose || '';
    const os = masterNode?.data?.selectedOS || state.targetOS || 'linux';

    try {
      const res = await fetch('/api/architect/rework', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal, purpose, targetOS: os,
          existingNodes: allNodes.map(n => ({
            label: n.data?.label || n.id,
            type: n.type,
            description: n.data?.description || '',
            language: n.data?.language || 'typescript',
          })),
          existingEdges: allEdges.map(e => ({ source: e.source, target: e.target })),
        }),
        signal: AbortSignal.timeout(120000),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.nodes?.length) {
          const masterId = state.nodes.find(n => n.type === 'master')?.id;
          state.replaceNodes(data.nodes, data.edges, os as any, masterId);
          state.setWizardStep('filling-nodes');
          nodeCountAtCodeGen.current = data.nodes.length;
          setReworkNeeded(false);
        } else {
          alert('⚠️ Rework failed. The new node has been added but connections may need manual adjustment.');
        }
      } else {
        alert('⚠️ Rework API unavailable.');
      }
    } catch {
      alert('⚠️ Rework failed.');
    }
    setReworking(false);
  }, []);

  // ── Helper: nudge a selected node (10px) or pan the camera (uses passed step) ──
  const nudgeOrPan = useCallback((dx: number, dy: number) => {
    const state = useProjectStore.getState();
    const selId = state.selectedNode;
    if (selId && selId !== 'master-node') {
      const node = state.nodes.find(n => n.id === selId);
      if (node) {
        // Use sign of passed steps for direction, but always nudge by 10 units
        state.updateNodePosition(selId, {
          x: node.position.x + Math.sign(dx) * 10,
          y: node.position.y + Math.sign(dy) * 10,
        });
      }
    } else {
      panCamera(dx, dy);
    }
  }, []);

  // ── Keyboard shortcuts for D-pad (nudge or pan) ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip when user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;

      // Arrow keys: nudge selected node or pan camera
      const state = useProjectStore.getState();
      const selId = state.selectedNode;
      const hasSelection = selId && selId !== 'master-node';
      const step = hasSelection ? 10 : 30;

      if (e.key === 'ArrowUp') { e.preventDefault(); nudgeOrPan(0, -step); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); nudgeOrPan(0, step); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); nudgeOrPan(-step, 0); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); nudgeOrPan(step, 0); return; }

      // Ctrl+R / Cmd+R: reset camera view
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        resetCameraView();
        return;
      }

      // Shift+Escape: reset camera view
      if (e.shiftKey && e.key === 'Escape') {
        e.preventDefault();
        resetCameraView();
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [nudgeOrPan]);

  const codeEditorNode = codeEditorNodeId ? store.nodes.find((n) => n.id === codeEditorNodeId) : null;
  const closeCodeEditor = useCallback(() => {
    setCodeEditorNodeId(null);
  }, [setCodeEditorNodeId]);

  return (
    <div className="canvas-wrapper">
      {/* 3D Canvas */}
      <Canvas3D
        selectedNodeId={selectedNodeId}
        onSelectNode={handleSelectNode}
        onDoubleClickNode={handleDoubleClickNode}
        onDragNode={handleDragNode}
        onDropNode={handleDropNode}
      />

      {/* Node Detail Overlay (on right side when a node is selected) */}
      <NodeDetailOverlay
        nodeId={selectedNodeId}
        onClose={() => handleSelectNode(null)}
      />

      {/* ── Undo/Redo Floating Bar ── */}
      <div className="undo-redo-bar">
        <button
          className={`undoredo-btn ${canUndo ? '' : 'disabled'}`}
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          ↩ Undo
        </button>
        <button
          className={`undoredo-btn ${canRedo ? '' : 'disabled'}`}
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          ↪ Redo
        </button>
      </div>

      {/* ── Camera D-Pad Controls ── */}
      <div className="camera-dpad">
        <button className="dpad-btn dpad-up" onClick={() => nudgeOrPan(0, -30)} title="Pan forward (or nudge selected node)">
          <span className="dpad-arrow">▲</span>
          <span className="dpad-label">Up</span>
        </button>
        <button className="dpad-btn dpad-left" onClick={() => nudgeOrPan(-30, 0)} title="Pan left (or nudge selected node)">
          <span className="dpad-arrow">◀</span>
          <span className="dpad-label">Left</span>
        </button>
        <button className="dpad-btn dpad-stop" onClick={resetCameraView} title="Reset camera view">
          <span className="dpad-stop-icon">■</span>
          <span className="dpad-label">Stop</span>
        </button>
        <button className="dpad-btn dpad-right" onClick={() => nudgeOrPan(30, 0)} title="Pan right (or nudge selected node)">
          <span className="dpad-arrow">▶</span>
          <span className="dpad-label">Right</span>
        </button>
        <button className="dpad-btn dpad-down" onClick={() => nudgeOrPan(0, 30)} title="Pan backward (or nudge selected node)">
          <span className="dpad-arrow">▼</span>
          <span className="dpad-label">Down</span>
        </button>
      </div>

      {/* ── Post-hoc Rework Button ── */}
      {reworkNeeded && !reworking && (
        <div className="rework-floating-bar" style={{
          position: 'absolute',
          bottom: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 16px',
          background: 'rgba(245,158,11,0.12)',
          border: '1px solid #f59e0b',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          <span style={{ fontSize: 12, color: '#fbbf24' }}>
            🆕 New node added to completed project
          </span>
          <button
            className="rework-btn"
            onClick={handleRework}
            style={{
              padding: '5px 12px',
              fontSize: 11,
              fontWeight: 600,
              background: '#f59e0b',
              color: '#0f0f1a',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            🔄 Rework Connections
          </button>
        </div>
      )}

      {reworking && (
        <div className="rework-floating-bar" style={{
          position: 'absolute',
          bottom: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 16px',
          background: 'rgba(96,165,250,0.12)',
          border: '1px solid #60a5fa',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          <span style={{ fontSize: 12, color: '#93c5fd' }}>
            ⏳ Reworking connections to include the new node...
          </span>
        </div>
      )}

      {/* ── Pending Node Name Dialog ── */}
      {pendingNode && (
        <div className="node-name-overlay" onClick={handleCancelNode}>
          <div className="node-name-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="node-name-header">
              <span
                className="node-name-type-badge"
                style={{ background: typeColors[pendingNode.node.type] || '#666' }}
              >
                {pendingNode.node.type}
              </span>
              <span className="node-name-title">New Node</span>
            </div>
            <label className="node-name-field">
              <span>Name</span>
              <input
                value={nodeName}
                onChange={(e) => setNodeName(e.target.value)}
                placeholder={`New ${pendingNode.node.type} node`}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmNode();
                  if (e.key === 'Escape') handleCancelNode();
                }}
              />
            </label>
            <label className="node-name-field">
              <span>Description</span>
              <textarea
                value={nodeDesc}
                onChange={(e) => setNodeDesc(e.target.value)}
                placeholder="Describe what this node should do..."
                rows={3}
              />
            </label>
            <div className="node-name-actions">
              <button className="nn-btn nn-cancel" onClick={handleCancelNode}>Cancel</button>
              <button className="nn-btn nn-confirm" onClick={handleConfirmNode}>Add Node</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Node Code Editor ── */}
      <NodeCodeEditor node={codeEditorNode as any} onClose={closeCodeEditor} />
    </div>
  );
}
