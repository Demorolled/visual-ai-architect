import { useCallback, useRef, useEffect, useState } from 'react';
import { NodeType, NodeStatus, CodeLanguage, WizardStep } from '../types';
import { Node } from 'reactflow';
import Canvas3D, { resetCameraView, panCamera, centerOnNodes } from './Canvas3D';
import type { UIDragData } from './Canvas3D';
import NodeDetailOverlay from './NodeDetailOverlay';
import NodeCodeEditor from './NodeCodeEditor';
import NodeSetupDialog, { NodeSetupResult } from './NodeSetupDialog';
import ConnectNodesDialog from './ConnectNodesDialog';
import PlanLibraryDialog from './PlanLibraryDialog';
import PlanCoworkerPanel from './PlanCoworkerPanel';
import PlanResumeBanner from './PlanResumeBanner';
import { broadcastReasoningMessage } from '../utils/reasoningSync';
import { api } from '../api/client';
import { useProjectStore, getNextNodeId } from '../store/projectStore';
import { autoLearn } from '../utils/autoLearn';
import { userProfile } from '../utils/userProfile';
import './Canvas.css';

const POST_GEN_STEPS: WizardStep[] = ['review', 'saving', 'complete'];

// (The per-type colour map that used to live here moved into the setup window's
// type badge; the inline prompt it styled is gone.)

export default function Canvas() {
  const store = useProjectStore();
  const {
    addNode, setSelectedNode, updateNodePosition, targetOS, wizardStep,
    planMode, planSeedId, setPlanSeedId, setUserGoal,
  } = store;

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [pendingNode, setPendingNode] = useState<{ node: { id: string; type: NodeType; x: number; y: number }; index: number } | null>(null);
  const [nodeName, setNodeName] = useState('');
  const [nodeDesc, setNodeDesc] = useState('');
  const { canUndo, canRedo, undo, redo } = useProjectStore();

  // ── Plan-mode manual wiring ──
  // Big Plan Mode's "wirring link": the user picks the two nodes themselves
  // rather than relying on auto-detected connections.
  const [wiringOpen, setWiringOpen] = useState(false);
  // Reopening a saved design is part of the same plan surface, so the picker
  // sits next to the wiring button rather than in a separate menu.
  const [libraryOpen, setLibraryOpen] = useState(false);
  // Mapping the design to files/folders (no code). Kept as local UI state: the
  // backend is the source of truth about whether a map exists (it refreshes it
  // on every autosave once mapped).
  const [mapping, setMapping] = useState(false);
  const planCodeNodes = store.nodes.filter(n => n.type !== 'master');

  const handleMapDesign = useCallback(async () => {
    const st = useProjectStore.getState();
    const design = st.nodes.filter(n => n.id !== 'master-node');
    if (design.length === 0) return;
    setMapping(true);
    try {
      const res = await api.mapPlan({
        projectName: st.projectName,
        goal: st.userGoal,
        nodes: design.map(n => {
          const d = n.data as any;
          return {
            id: n.id,
            type: d?.type || n.type || 'logic',
            label: d?.label || n.id,
            description: d?.description || '',
            language: d?.language,
            isMaster: n.id === st.planSeedId,
            qa: (d?.planQa || []).map((x: any) => ({ q: x.q, a: x.a })),
          };
        }),
        edges: st.edges.map(e => ({ source: e.source, target: e.target, label: (e as any).label })),
      });
      const data = res.data || {};
      const count = Array.isArray(data.files) ? data.files.length : 0;
      const removed = Array.isArray(data.removed) ? data.removed.length : 0;
      broadcastReasoningMessage({
        role: 'ai',
        text:
          `🗺 Mapped the design to ${count} file${count === 1 ? '' : 's'} → data/plans/${data.dirName}/map/ ` +
          `(wiring.md + map.json, no code generated)` +
          (removed ? ` · dropped ${removed} file${removed === 1 ? '' : 's'} no longer in the design` : '') +
          `. It now refreshes with every autosave.`,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      broadcastReasoningMessage({
        role: 'ai',
        text: `⚠ Could not map the design: ${err?.response?.data?.error || err?.message || 'unknown error'}`,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setMapping(false);
    }
  }, []);

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

  const handleConfirmNode = useCallback((result: NodeSetupResult) => {
    if (!pendingNode) return;
    const { type, language, name, purpose } = result;
    // The first node placed while Plan Mode is on is the plan's seed: its
    // purpose is the statement of intent, so it also becomes the goal the
    // LLM co-pilot reasons from.
    const isPlanSeed = planMode && !planSeedId;
    const newNode: Node = {
      id: getNextNodeId(),
      type,
      position: { x: pendingNode.node.x, y: pendingNode.node.y },
      data: {
        label: name,
        description: purpose,
        type,
        status: 'pending' as NodeStatus,
        // Language comes from the setup window, NOT from
        // `userProfile.preferences.preferredLanguages[0]`: the window is where
        // the choice is actually made, and the profile only seeds it.
        language,
        ...(isPlanSeed && purpose ? { appGoal: purpose } : {}),
      },
    };
    addNode(newNode);
    autoLearn.nodeCreated(name, type, language, purpose);
    if (isPlanSeed) {
      setPlanSeedId(newNode.id);
      if (purpose) setUserGoal(purpose);
    }
    // Auto-open code editor for every newly placed node so the user can
    // read, write, or modify code immediately
    setCodeEditorNodeId(newNode.id);
    setPendingNode(null);
  }, [pendingNode, planMode, planSeedId, setPlanSeedId, setUserGoal, addNode, setCodeEditorNodeId]);

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

      {/* ── Big Plan Mode: manual wiring link ── */}
      {planMode && (
        <div className="plan-wire-bar">
          <span className="plan-wire-hint">
            🧭 Design only — nothing is generated while you plan.
          </span>
          <button
            className="plan-wire-btn"
            onClick={() => setWiringOpen(true)}
            disabled={planCodeNodes.length < 2}
            title={
              planCodeNodes.length < 2
                ? 'Add a second node first — a link needs two nodes'
                : 'Pick two nodes and describe how they connect'
            }
          >
            🔗 Wire two nodes
          </button>
          <button
            className="plan-wire-btn plan-wire-btn-secondary"
            onClick={handleMapDesign}
            disabled={mapping || planCodeNodes.length === 0}
            title={
              planCodeNodes.length === 0
                ? 'Place the master node first — there is nothing to map yet'
                : 'Map the design onto real files and folders — one per node, wired as a build would wire them. No code is generated.'
            }
          >
            {mapping ? 'Mapping…' : '🗺 Map design to files'}
          </button>
          <button
            className="plan-wire-btn plan-wire-btn-secondary"
            onClick={() => setLibraryOpen(true)}
            title="Reopen a design autosaved to data/plans and keep working on it"
          >
            📂 Open plan
          </button>
        </div>
      )}

      {wiringOpen && (
        <ConnectNodesDialog mode="plan" onClose={() => setWiringOpen(false)} />
      )}

      {libraryOpen && <PlanLibraryDialog onClose={() => setLibraryOpen(false)} />}

      {/* ── Big Plan Mode: the co-worker's questions, answered against the
             node each one is about ── */}
      <PlanCoworkerPanel />

      {/* ── An empty canvas that has a saved design on disk: offer to resume ── */}
      <PlanResumeBanner />

      {/* ── Node setup window: type + language + name + purpose ── */}
      {pendingNode && (
        <NodeSetupDialog
          initialType={pendingNode.node.type}
          mode={planMode ? 'plan' : 'build'}
          isSeed={planMode && !planSeedId}
          initialName={nodeName}
          initialPurpose={nodeDesc}
          defaultLanguage={
            (userProfile.get().preferences.preferredLanguages?.[0] || 'typescript') as CodeLanguage
          }
          onConfirm={handleConfirmNode}
          onCancel={handleCancelNode}
        />
      )}

      {/* ── Node Code Editor ── */}
      <NodeCodeEditor node={codeEditorNode as any} onClose={closeCodeEditor} />
    </div>
  );
}
