import React, { memo, useCallback, useRef, useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { NodeData, NodeType, NodeStatus, CodeLanguage, LANGUAGE_OPTIONS, hasExtensionConflict, getLanguageExtension, extractLabelExtension } from '../types';
import { useProjectStore } from '../store/projectStore';
import { useNodeSuggestion } from '../hooks/useSuggestion';
import { speak } from '../utils/tts';
import './CustomNode.css';

const nodeColors: Record<string, string> = {
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

const nodeIcons: Record<string, string> = {
  master: '🎯',
  input: '⬅',
  output: '➡',
  logic: '⚙',
  api: '🌐',
  database: '📦',
  ui: '🖥',
  'ui-functions': '🎛',
  'gui-layout': '⛭',
};

interface CustomNodeData extends NodeData {
  label: string;
  description: string;
  status: NodeStatus;
  error?: string;
  generatedCode?: string;
}

/** Styles for the hover popover (injected once) */
const popoverStyles: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 8px)',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 100,
  minWidth: '260px',
  maxWidth: '340px',
  background: '#1a1a2e',
  border: '1px solid #2d2d4e',
  borderRadius: 0,
  padding: '10px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  pointerEvents: 'auto',
};

function CustomNode({ id, data, selected }: NodeProps<CustomNodeData>) {
  const updateNode = useProjectStore((s) => s.updateNode);
  const setNodeLanguage = useProjectStore((s) => s.setNodeLanguage);
  const toggleNodeExpanded = useProjectStore((s) => s.toggleNodeExpanded);
  const nodeBeingFilled = useProjectStore((s) => s.nodeBeingFilled);
  const setCodeEditorNodeId = useProjectStore((s) => s.setCodeEditorNodeId);
  const isBeingFilled = nodeBeingFilled === id;
  const color = nodeColors[data.type as NodeType] || '#666';
  const icon = nodeIcons[data.type as NodeType] || '?';
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const expanded = data.expanded || false;
  const [showPopover, setShowPopover] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scaffoldLoading, setScaffoldLoading] = useState(false);
  const [scaffoldResult, setScaffoldResult] = useState<'idle' | 'success' | 'error'>('idle');
  const [guiCodeGenLoading, setGuiCodeGenLoading] = useState(false);
  const [guiCodeGenResult, setGuiCodeGenResult] = useState<string | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugResult, setDebugResult] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  // Big Plan Mode: show the co-worker's questions and the user's answers here,
  // on the node they belong to. Closed by default — the node is a design
  // surface, and the answers are reference material, not the headline.
  const [qaOpen, setQaOpen] = useState(false);
  const isGuiLayout = data.type === 'gui-layout';

  // Detect language extension conflict
  const extensionConflict = hasExtensionConflict(data.label || '', data.language || 'typescript');
  const labelExt = extensionConflict ? extractLabelExtension(data.label || '') : null;
  const langExt = getLanguageExtension(data.language || 'typescript');
  const conflictMessage = labelExt
    ? `Label uses .${labelExt} but language ${data.language} expects .${langExt}`
    : null;

  // Get master node goal for context
  const masterGoal = useProjectStore((s) =>
    s.nodes.find((n) => n.type === 'master')?.data?.appGoal || ''
  );
  const masterPurpose = useProjectStore((s) =>
    s.nodes.find((n) => n.type === 'master')?.data?.appPurpose || ''
  );

  // Node-specific suggestion hook
  const { suggestion, isLoading: suggestLoading, fetchSuggestion } = useNodeSuggestion(
    data.type || '',
    data.label || data.type || '',
    data.description || '',
    data.language,
    masterGoal,
    masterPurpose
  );

  const onDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNode(id, { description: e.target.value });
    },
    [id, updateNode]
  );

  const onLanguageChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setNodeLanguage(id, e.target.value as CodeLanguage);
    },
    [id, setNodeLanguage]
  );

  const onIdTagChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNode(id, { idTag: e.target.value || undefined });
    },
    [id, updateNode]
  );

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
  }, []);

  // --- Hover handlers for suggestion popover ---
  const onMouseEnter = useCallback(() => {
    // Small delay before showing popover to avoid flickering
    hoverTimerRef.current = setTimeout(() => {
      setShowPopover(true);
      // Fetch suggestion if not already loaded
      if (!suggestion) fetchSuggestion();
    }, 600);
  }, [suggestion, fetchSuggestion]);

  const onMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setShowPopover(false);
  }, []);

  const handleSuggest = useCallback(async () => {
    updateNode(id, { suggestionLoading: true });

    const state = useProjectStore.getState();
    const masterNode = state.nodes.find((n) => n.type === 'master');
    const goal = masterNode?.data?.appGoal || '';
    const purpose = masterNode?.data?.appPurpose || '';

    const systemPrompt = 'You are an expert software architect. Provide concise, actionable suggestions for implementing a single node in a software project. Respond in 3-5 short bullet points. No markdown, no formatting.';
    const prompt = `Project goal: ${goal}\nPurpose: ${purpose}\n\nNode "${data.label}" (${data.type}, ${data.language || 'typescript'}):\nDescription: ${data.description || 'Not specified yet'}\n\nSuggest how to implement this node: what patterns, libraries, or approaches would work best.`;

    try {
      const res = await fetch('/api/reason', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, system: systemPrompt, maxTokens: 256 }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error('Request failed');
      const json = await res.json();
      updateNode(id, { suggestion: json.response || 'No suggestions returned.', suggestionLoading: false });
    } catch {
      updateNode(id, { suggestion: 'Could not get suggestions. Check LLM connection.', suggestionLoading: false });
    }
  }, [id, data, updateNode]);

  const handleScaffold = useCallback(async () => {
    setScaffoldLoading(true);
    setScaffoldResult('idle');
    try {
      const res = await fetch('/api/scaffold/node', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          node: {
            type: data.type,
            data: {
              label: data.label,
              description: data.description,
              language: data.language,
            },
          },
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error('Request failed');
      const json = await res.json();
      updateNode(id, { resourceFiles: json.fileNames });
      setScaffoldResult('success');
    } catch {
      setScaffoldResult('error');
    } finally {
      setScaffoldLoading(false);
    }
  }, [id, data, updateNode]);

  // ── Generate Code from GUI Layout ──
  const handleGuiCodeGen = useCallback(async () => {
    setGuiCodeGenLoading(true);
    setGuiCodeGenResult(null);

    try {
      // 1. Save project state first
      const state = useProjectStore.getState();
      const saved = state.saveProject();
      if (!saved) {
        setGuiCodeGenResult('❌ Could not save project state.');
        return;
      }

      // 2. Ensure the project exists on the backend, then scaffold
      const goal = masterGoal || state.projectName || '';
      const purpose = masterPurpose || '';
      const allNodes = state.nodes;
      const allEdges = state.edges;

      // 2a. Create the project on the backend if it doesn't exist yet
      let projectId = state.projectId;
      if (!projectId) {
        // Generate a temporary ID for the backend
        projectId = `proj_${Date.now()}`;
      }

      const createRes = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: state.projectName,
          targetOS: state.targetOS,
        }),
        signal: AbortSignal.timeout(10000),
      });

      let serverProjectId: string | null = null;
      if (createRes.ok) {
        const createData = await createRes.json();
        serverProjectId = createData?.id || projectId;
      } else if (createRes.status === 409) {
        // Project may already exist — try listing to find one
        try {
          const listRes = await fetch('/api/projects', { signal: AbortSignal.timeout(5000) });
          if (listRes.ok) {
            const list = await listRes.json();
            const existing = Array.isArray(list) ? list.find((p: any) => p.name === state.projectName) : null;
            if (existing?.id) serverProjectId = existing.id;
          }
        } catch { /* fall through */ }
      }

      if (!serverProjectId) {
        setGuiCodeGenResult('❌ Could not create project on backend. Is the server running?');
        setGuiCodeGenLoading(false);
        return;
      }

      // 2b. Sync project nodes to the backend project database
      const syncRes = await fetch(`/api/projects/${serverProjectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: allNodes,
          edges: allEdges,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!syncRes.ok) {
        setGuiCodeGenResult('⚠️ Project sync failed — trying scaffold anyway.');
      }

      // 2c. Also sync to the architect current state cache
      try {
        await fetch('/api/architect/current', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: state.projectName,
            goal,
            purpose,
            targetOS: state.targetOS,
            nodes: allNodes,
            edges: allEdges,
          }),
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        // Optional — ensures the designer bridge has the latest state
      }

      // 3. Call the per-file scaffold endpoint to generate code with gui-layout context
      //    (per-file architecture — each node becomes its own standalone source file)
      setGuiCodeGenResult('⏳ Generating code from GUI layout...');

      const scaffoldRes = await fetch(`/api/export/${serverProjectId}/per-file-scaffold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: state.projectName,
          targetOS: state.targetOS,
          linuxDistro: (allNodes.find(n => n.type === 'master')?.data as any)?.selectedDistro || undefined,
        }),
        signal: AbortSignal.timeout(120000),
      });

      if (scaffoldRes.ok) {
        const scaffoldData = await scaffoldRes.json();
        if (scaffoldData.success) {
          const fileCount = scaffoldData.files?.length || 0;
          setGuiCodeGenResult(`✅ GUI code generated! ${fileCount} files created in the project.`);
          updateNode(id, { status: 'valid' });
        } else {
          setGuiCodeGenResult(`⚠️ Scaffold completed but reported issues. Check the terminal for details.`);
        }
      } else {
        const errBody = await scaffoldRes.text().catch(() => 'unknown');
        setGuiCodeGenResult(`❌ Scaffold failed (${scaffoldRes.status}): ${errBody.substring(0, 120)}`);
      }
    } catch (err: any) {
      setGuiCodeGenResult(`❌ Error: ${err.message}`);
    }

    setGuiCodeGenLoading(false);
  }, [id, masterGoal, masterPurpose, updateNode]);

  const handleDebug = useCallback(async () => {
    setDebugLoading(true);
    setDebugResult(null);
    const state = useProjectStore.getState();
    const edges = state.edges.filter((e) => e.source === id || e.target === id);
    const connectedIds = new Set(edges.map((e) => (e.source === id ? e.target : e.source)));
    let context = `## Node "${data.label}" (${data.type})\n`;
    context += `Language: ${data.language || 'typescript'}\n`;
    context += `Description: ${data.description || 'N/A'}\n`;
    context += `Code:\n\`\`\`\n${data.generatedCode || '(no code written yet)'}\n\`\`\`\n`;
    if (connectedIds.size > 0) {
      context += `\n## Connected Nodes:\n`;
      connectedIds.forEach((nid) => {
        const cn = state.nodes.find((n) => n.id === nid);
        if (cn) {
          context += `\n### "${cn.data?.label || cn.id}" (${cn.type})\n`;
          context += `Code:\n\`\`\`\n${cn.data?.generatedCode || '(no code)'}\n\`\`\`\n`;
        }
      });
    }
    try {
      const res = await fetch('/api/reason', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Review the following code for bugs, type errors, and logical issues. Be concise (3-5 bullet points).\n\n${context}`,
          system: 'You are an expert debugger. Analyze code for bugs, type mismatches, and logic errors. Be brief and specific.',
          maxTokens: 512,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error('Request failed');
      const json = await res.json();
      setDebugResult(json.response || 'No debug results.');
    } catch {
      setDebugResult('⚠️ Debug request failed. Check LLM connection.');
    }
    setDebugLoading(false);
  }, [id, data]);

  const handleAI = useCallback(async () => {
    setAiLoading(true);
    setAiResult(null);
    try {
      const res = await fetch('/api/reason', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Suggest improvements for this code. Be concise (2-4 bullet points):\n\nLanguage: ${data.language || 'typescript'}\nDescription: ${data.description || 'N/A'}\nCode:\n\`\`\`\n${data.generatedCode || '(no code written yet)'}\n\`\`\``,
          system: 'You are an expert code reviewer. Suggest specific improvements for performance, readability, and best practices.',
          maxTokens: 512,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error('Request failed');
      const json = await res.json();
      setAiResult(json.response || 'No suggestions.');
    } catch {
      setAiResult('⚠️ AI request failed. Check LLM connection.');
    }
    setAiLoading(false);
  }, [id, data]);

  // Speak the hover suggestion aloud when it loads
  const handleSpeakSuggestion = useCallback(() => {
    if (suggestion) speak(suggestion);
  }, [suggestion]);

  return (
    <div
      className={`custom-node ${selected ? 'selected' : ''} ${expanded ? 'expanded' : ''} ${isBeingFilled ? 'typing' : ''}`}
      style={{
        borderColor: color,
        position: 'relative',
        ...(isBeingFilled ? { boxShadow: `0 0 20px ${color}88, 0 0 60px ${color}44`, transition: 'box-shadow 0.2s ease' } : {}),
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="node-header" style={{ backgroundColor: color }}>
        <span className="node-icon">{icon}</span>
        <span className="node-label">{data.label || data.type}</span>
        <select
          className="node-language-select react-flow__nodrag"
          value={data.language || 'typescript'}
          onChange={onLanguageChange}
          onPointerDown={onPointerDown}
          onClick={(e) => e.stopPropagation()}
          title="Set programming language for this node"
        >
          {LANGUAGE_OPTIONS.map((lang) => (
            <option key={lang.value} value={lang.value}>{lang.label}</option>
          ))}
        </select>
        {extensionConflict && conflictMessage && (
          <span
            className="node-lang-conflict-badge"
            title={conflictMessage}
          >
            ⚠️
          </span>
        )}
        <button
          className="node-expand-btn react-flow__nodrag"
          onClick={(e) => { e.stopPropagation(); toggleNodeExpanded(id); }}
          onPointerDown={onPointerDown}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '−' : '+'}
        </button>
      </div>

      {/* Hover suggestion popover */}
      {showPopover && !expanded && (
        <div style={popoverStyles} className="react-flow__nodrag">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', paddingBottom: '6px', borderBottom: '1px solid #2d2d4e' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0' }}>💡 How to build this</span>
            {suggestion && (
              <button
                onClick={handleSpeakSuggestion}
                title="Read aloud"
                style={{ background: 'none', border: '1px solid #3d3d5e', borderRadius: 0, padding: '2px 6px', cursor: 'pointer', color: '#94a3b8', fontSize: '11px' }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.background = '#2d2d4e'; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'none'; }}
              >
                🔊 Speak
              </button>
            )}
          </div>
          {suggestLoading && (
            <div style={{ padding: '8px 0', color: '#94a3b8', fontSize: '12px' }}>
              ⏳ Loading suggestions...
            </div>
          )}
          {!suggestLoading && suggestion && (
            <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {suggestion}
            </div>
          )}
          {!suggestLoading && !suggestion && (
            <div style={{ padding: '8px 0', color: '#94a3b8', fontSize: '12px' }}>
              Hover over a node for implementation tips.
            </div>
          )}
        </div>
      )}

      <div className={`node-body ${expanded ? 'node-body-expanded' : ''}`}>
        <textarea
          ref={inputRef}
          className="node-description react-flow__nodrag"
          placeholder="Describe what this node should do in plain English..."
          value={data.description || ''}
          onChange={onDescriptionChange}
          onPointerDown={onPointerDown}
          rows={expanded ? 6 : 3}
          title="Describe what this node should do — this helps the AI generate better code"
        />

        {/* ── Plan Mode: this node's co-worker answers ──
             The answers are filed against the node they were asked about, so
             they are shown here rather than only in the co-worker panel and
             plan.md — the decision lives with the thing it decides. ── */}
        {data.planQa && data.planQa.length > 0 && (
          <div className="node-qa">
            <button
              className="node-qa-badge react-flow__nodrag"
              onClick={(e) => { e.stopPropagation(); setQaOpen((o) => !o); }}
              onPointerDown={onPointerDown}
              title={
                qaOpen
                  ? 'Hide the questions and answers on this node'
                  : `${data.planQa.length} question${data.planQa.length === 1 ? '' : 's'} answered on this node`
              }
            >
              🤝 {data.planQa.length} answered {qaOpen ? '▴' : '▾'}
            </button>
            {qaOpen && (
              <div className="node-qa-list">
                {data.planQa.map((qa, i) => (
                  <div key={i} className="node-qa-item">
                    <div className="node-qa-q">{qa.q}</div>
                    <div className="node-qa-a">{qa.a}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Deep-scan metadata: the files this node connects to + external tag ── */}
        {(data.external || (data.files && data.files.length > 0)) && (
          <div className="node-scan-meta">
            {data.external && (
              <span className="node-scan-tag external">
                {data.externalKind === 'package' ? '📦 npm package'
                  : data.externalKind === 'app' ? '🔗 sibling app'
                  : '🌐 external service'}
              </span>
            )}
            {data.isFileNode && (
              <span className="node-scan-tag file">📄 file</span>
            )}
            {data.files && data.files.length > 0 && (
              <div className="node-scan-files">
                <span className="node-scan-files-title">
                  📄 {data.files.length} file{data.files.length === 1 ? '' : 's'}
                </span>
                <div className="node-scan-files-list">
                  {data.files.slice(0, 4).map((f, i) => (
                    <span key={i} className="node-scan-file">{f.split('/').pop() || f}</span>
                  ))}
                  {data.files.length > 4 && (
                    <span className="node-scan-file more">+{data.files.length - 4}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {expanded && (
          <div className="node-expanded-details">
            <div className="node-detail-row">
              <span className="node-detail-label">Node ID</span>
              <span className="node-detail-value">{id}</span>
            </div>
            <div className="node-detail-row">
              <span className="node-detail-label">Widget ID Tag</span>
              <input
                className="node-detail-idtag react-flow__nodrag"
                type="text"
                placeholder="—"
                value={data.idTag || ''}
                onChange={onIdTagChange}
                onPointerDown={onPointerDown}
                onClick={(e) => e.stopPropagation()}
                title="Optional widget ID tag for cross-referencing this node"
              />
            </div>
            <div className="node-detail-row">
              <span className="node-detail-label">Type</span>
              <span className="node-detail-value" style={{ color }}>{data.type}</span>
            </div>
            <div className="node-detail-row">
              <span className="node-detail-label">Language</span>
              <select
                className="node-detail-lang-select react-flow__nodrag"
                value={data.language || 'typescript'}
                onChange={onLanguageChange}
                onPointerDown={onPointerDown}
                onClick={(e) => e.stopPropagation()}
                title="Set programming language for this node"
              >
                {LANGUAGE_OPTIONS.map((lang) => (
                  <option key={lang.value} value={lang.value}>{lang.label}</option>
                ))}
              </select>
              {extensionConflict && conflictMessage && (
                <span
                  className="node-lang-conflict-badge detail"
                  title={conflictMessage}
                >
                  ⚠️
                </span>
              )}
            </div>

            {/* ── Extension conflict warning message ── */}
            {extensionConflict && conflictMessage && (
              <div className="node-lang-conflict-warning">
                <span className="conflict-icon">⚠️</span>
                <span className="conflict-text">
                  Label <strong>{data.label}</strong> uses <strong>.{labelExt}</strong> but language <strong>{data.language}</strong> expects <strong>.{langExt}</strong>. The generated file will use <strong>.{langExt}</strong> extension.
                </span>
              </div>
            )}

            <div className="node-detail-row">
              <span className="node-detail-label">Status</span>
              <span className={`node-detail-status ${data.status}`}>
                {data.status === 'generating' ? '⏳ Generating' :
                 data.status === 'valid' ? '✓ Validated' :
                 data.status === 'error' ? '✗ Error' : '○ Pending'}
              </span>
            </div>

            {data.resourceFiles && data.resourceFiles.length > 0 && (
              <div className="node-resource-files">
                <span className="node-detail-label">Resource Files</span>
                <div className="node-resource-list">
                  {data.resourceFiles.map((file, idx) => {
                    const icon =
                      file.endsWith('.sql') ? '🗄️' :
                      file.endsWith('.css') ? '🎨' :
                      file.endsWith('.json') ? '⚙️' :
                      file.endsWith('.md') ? '📝' :
                      '📄';
                    return (
                      <div key={idx} className="node-resource-file">
                        <span className="node-resource-icon">{icon}</span>
                        <span className="node-resource-path">{file}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="node-action-row">
              <button
                className="node-scaffold-btn react-flow__nodrag"
                onClick={(e) => { e.stopPropagation(); handleScaffold(); }}
                onPointerDown={onPointerDown}
                disabled={scaffoldLoading}
                title="Generate skeleton placeholder files for this node"
              >
                {scaffoldLoading ? '⏳ Scaffolding...' : '📁 Scaffold Files'}
              </button>
              {scaffoldResult === 'success' && (
                <span className="node-scaffold-msg success">✓ Files generated</span>
              )}
              {scaffoldResult === 'error' && (
                <span className="node-scaffold-msg error">✗ Failed</span>
              )}
            </div>

            {/* ── Generate Code from GUI Layout (gui-layout nodes only) ── */}
            {isGuiLayout && (
              <div className="node-action-row" style={{ marginTop: 4 }}>
                <button
                  className="node-gui-codegen-btn react-flow__nodrag"
                  onClick={(e) => { e.stopPropagation(); handleGuiCodeGen(); }}
                  onPointerDown={onPointerDown}
                  disabled={guiCodeGenLoading}
                  title="Generate production code from this finalized GUI layout — widget positions, sizes, bindings, and styles are all included in the LLM prompt"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontSize: 12,
                    fontWeight: 700,
                    background: guiCodeGenLoading
                      ? 'rgba(0,217,255,0.08)'
                      : 'rgba(0,217,255,0.2)',
                    border: '1px solid #00d9ff',
                    color: guiCodeGenLoading ? '#00d9ff66' : '#00d9ff',
                    cursor: guiCodeGenLoading ? 'default' : 'pointer',
                    opacity: guiCodeGenLoading ? 0.6 : 1,
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  <span style={{ fontSize: 16 }}>⛭</span>
                  {guiCodeGenLoading ? '⏳ Generating...' : 'Generate Code from GUI Layout'}
                </button>
              </div>
            )}
            {guiCodeGenResult && (
              <div style={{
                marginTop: 4,
                padding: '4px 8px',
                fontSize: 10,
                background: guiCodeGenResult.startsWith('✅')
                  ? 'rgba(74,222,128,0.1)'
                  : guiCodeGenResult.startsWith('⚠️') || guiCodeGenResult.startsWith('⏳')
                    ? 'rgba(245,158,11,0.1)'
                    : 'rgba(248,113,113,0.1)',
                border: '1px solid',
                borderColor: guiCodeGenResult.startsWith('✅')
                  ? 'rgba(74,222,128,0.2)'
                  : guiCodeGenResult.startsWith('⚠️') || guiCodeGenResult.startsWith('⏳')
                    ? 'rgba(245,158,11,0.2)'
                    : 'rgba(248,113,113,0.2)',
                color: guiCodeGenResult.startsWith('✅')
                  ? '#4ade80'
                  : guiCodeGenResult.startsWith('⚠️') || guiCodeGenResult.startsWith('⏳')
                    ? '#f59e0b'
                    : '#f87171',
              }}>
                {guiCodeGenResult}
              </div>
            )}

            <button
              className="node-suggest-btn react-flow__nodrag"
              onClick={(e) => { e.stopPropagation(); handleSuggest(); }}
              onPointerDown={onPointerDown}
              disabled={data.suggestionLoading}
              title="Get AI-powered implementation suggestions for this node"
            >
              {data.suggestionLoading ? '⏳ Thinking...' : '💡 Suggest'}
            </button>
            {data.suggestion && (
              <div className="node-suggestion">
                <div className="node-suggestion-header">
                  AI Suggestion
                  <button
                    onClick={handleSpeakSuggestion}
                    title="Read aloud"
                    style={{ background: 'none', border: '1px solid #3d3d5e', borderRadius: 0, padding: '2px 6px', cursor: 'pointer', color: '#94a3b8', fontSize: '11px', marginLeft: '8px' }}
                  >
                    🔊
                  </button>
                </div>
                <div className="node-suggestion-text">{data.suggestion}</div>
              </div>
            )}

            <div className="node-code-actions">
              <button
                className="node-code-action-btn edit-btn react-flow__nodrag"
                onClick={(e) => { e.stopPropagation(); setCodeEditorNodeId(id); }}
                onPointerDown={onPointerDown}
                title="Open code editor"
              >
                ✏️ Edit
              </button>
              <button
                className="node-code-action-btn debug-btn react-flow__nodrag"
                onClick={(e) => { e.stopPropagation(); handleDebug(); }}
                onPointerDown={onPointerDown}
                disabled={debugLoading}
                title="Debug this node and its connections"
              >
                {debugLoading ? '⏳' : '🐛'} Debug
              </button>
              <button
                className="node-code-action-btn ai-btn react-flow__nodrag"
                onClick={(e) => { e.stopPropagation(); handleAI(); }}
                onPointerDown={onPointerDown}
                disabled={aiLoading}
                title="AI code review"
              >
                {aiLoading ? '⏳' : '🤖'} AI
              </button>
            </div>
            {debugResult && (
              <div className="node-code-result debug-result">{debugResult}</div>
            )}
            {aiResult && (
              <div className="node-code-result ai-result">{aiResult}</div>
            )}
          </div>
        )}

        {data.status === 'generating' && (
          <div className="status generating">⏳ Generating...</div>
        )}
        {data.status === 'valid' && (
          <div className="status valid">✓ Validated</div>
        )}
        {data.status === 'error' && (
          <div className="status error">✗ {data.error}</div>
        )}

        {data.generatedCode && (
          <details className="code-preview" open={expanded}>
            <summary>Generated Code</summary>
            <pre>{data.generatedCode}</pre>
          </details>
        )}
      </div>

      {/* Badges — visible in collapsed mode */}
      {!expanded && (
        <div className="node-badges">
          {extensionConflict && conflictMessage && (
            <div className="node-lang-conflict-badge-row" title={conflictMessage}>
              <span className="conflict-icon">⚠️</span>
              <span className="conflict-text-short">Extension conflict</span>
            </div>
          )}
          {data.resourceFiles && data.resourceFiles.length > 0 && (
            <div className="node-resource-badge" title={`${data.resourceFiles.length} resource file${data.resourceFiles.length !== 1 ? 's' : ''}`}>
              <span className="resource-badge-icon">📄</span>
              <span className="resource-badge-count">{data.resourceFiles.length}</span>
            </div>
          )}
          {data.idTag && (
            <div className="node-idtag-badge">
              <span className="idtag-badge-icon">⎔</span>
              <span className="idtag-badge-text">{data.idTag}</span>
            </div>
          )}
        </div>
      )}

      <div className="node-footer-hint">
        <span>Double-click to edit code</span>
        <span className="node-footer-keys">+ Expand · 📁 Files · 💡 Suggest · ✏️ Edit · 🐛 Debug · 🤖 AI</span>
      </div>

      <Handle type="target" position={Position.Top} className="handle-top" />
      <Handle type="source" position={Position.Bottom} className="handle-bottom" />
    </div>
  );
}

export default memo(CustomNode);
