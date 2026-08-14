import { useCallback, useState } from 'react';
import { NodeData, CodeLanguage, LANGUAGE_OPTIONS, hasExtensionConflict, getLanguageExtension, extractLabelExtension } from '../types';
import { useProjectStore } from '../store/projectStore';

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

interface NodeDetailOverlayProps {
  nodeId: string | null;
  onClose: () => void;
}

export default function NodeDetailOverlay({ nodeId, onClose }: NodeDetailOverlayProps) {
  const nodes = useProjectStore((s) => s.nodes);
  const updateNode = useProjectStore((s) => s.updateNode);
  const setNodeLanguage = useProjectStore((s) => s.setNodeLanguage);
  const setCodeEditorNodeId = useProjectStore((s) => s.setCodeEditorNodeId);

  const [suggestion, setSuggestion] = useState('');
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [debugResult, setDebugResult] = useState('');
  const [debugLoading, setDebugLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const node = nodes.find(n => n.id === nodeId);

  // ── All hooks must be BEFORE the early return to avoid 'more hooks' error ──
  // Use nodeId to look up the node inside each callback instead of using the
  // outer `node` variable (which would be null when no node is selected).
  const handleDescriptionChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const n = nodes.find(n => n.id === nodeId);
    if (n) updateNode(n.id, { description: e.target.value });
  }, [nodes, nodeId, updateNode]);

  const handleLanguageChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const n = nodes.find(n => n.id === nodeId);
    if (n) setNodeLanguage(n.id, e.target.value as CodeLanguage);
  }, [nodes, nodeId, setNodeLanguage]);

  const handleSuggest = useCallback(async () => {
    setSuggestLoading(true);
    const state = useProjectStore.getState();
    const currentNodes = state.nodes;
    const currentNode = currentNodes.find(n => n.id === nodeId);
    const currentData = currentNode?.data as NodeData | undefined;
    const masterNode = currentNodes.find((n) => n.type === 'master');
    const goal = masterNode?.data?.appGoal || '';

    const systemPrompt = 'You are an expert software architect. Provide concise, actionable suggestions for implementing a single node in a software project. Respond in 3-5 short bullet points. No markdown, no formatting.';
    const prompt = `Project goal: ${goal}\nNode "${currentData?.label || nodeId}" (${currentData?.type || '?'}, ${currentData?.language || 'typescript'}):\nDescription: ${currentData?.description || 'Not specified yet'}\n\nSuggest how to implement this node.`;

    try {
      const res = await fetch('/api/reason', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, system: systemPrompt, maxTokens: 256 }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error('Request failed');
      const json = await res.json();
      setSuggestion(json.response || 'No suggestions returned.');
    } catch {
      setSuggestion('Could not get suggestions. Check LLM connection.');
    }
    setSuggestLoading(false);
  }, [nodeId]);

  const handleDebug = useCallback(async () => {
    setDebugLoading(true);
    const currentNodes = useProjectStore.getState().nodes;
    const currentNode = currentNodes.find(n => n.id === nodeId);
    const currentData = currentNode?.data as NodeData | undefined;
    const context = `## Node "${currentData?.label || nodeId}" (${currentData?.type || '?'})\nLanguage: ${currentData?.language || 'typescript'}\nDescription: ${currentData?.description || 'N/A'}\nCode:\n\`\`\`\n${currentData?.generatedCode || '(no code written yet)'}\n\`\`\``;
    try {
      const res = await fetch('/api/reason', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Review the following code for bugs, type errors, and logical issues. Be concise (3-5 bullet points).\n\n${context}`,
          system: 'You are an expert debugger. Analyze code for bugs, type mismatches, and logic errors.',
          maxTokens: 512,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error('Request failed');
      const json = await res.json();
      setDebugResult(json.response || 'No debug results.');
    } catch {
      setDebugResult('⚠️ Debug request failed.');
    }
    setDebugLoading(false);
  }, [nodeId]);

  const handleAI = useCallback(async () => {
    setAiLoading(true);
    const currentNodes = useProjectStore.getState().nodes;
    const currentNode = currentNodes.find(n => n.id === nodeId);
    const currentData = currentNode?.data as NodeData | undefined;
    try {
      const res = await fetch('/api/reason', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Suggest improvements for this code. Be concise (2-4 bullet points):\n\nLanguage: ${currentData?.language || 'typescript'}\nDescription: ${currentData?.description || 'N/A'}\nCode:\n\`\`\`\n${currentData?.generatedCode || '(no code written yet)'}\n\`\`\``,
          system: 'You are an expert code reviewer.',
          maxTokens: 512,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error('Request failed');
      const json = await res.json();
      setAiResult(json.response || 'No suggestions.');
    } catch {
      setAiResult('⚠️ AI request failed.');
    }
    setAiLoading(false);
  }, [nodeId]);

  // Only render the overlay if a valid node is selected
  if (!node || node.type === 'master' || node.type === 'ui-functions') return null;

  const data = node.data as NodeData;
  const color = nodeColors[data.type] || '#666';
  const icon = nodeIcons[data.type] || '?';

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        width: 320,
        maxHeight: 'calc(100% - 32px)',
        overflowY: 'auto',
        background: '#1a1a2e',
        border: `1px solid ${color}`,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '10px 12px',
        background: color,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 13, color: '#0f0f1a' }}>
          {data.label || data.type}
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#0f0f1a', opacity: 0.7 }}>
          {data.type}
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(0,0,0,0.2)', border: 'none', color: '#0f0f1a',
            cursor: 'pointer', fontSize: 14, padding: '2px 6px', lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12, color: '#cbd5e1' }}>
        {/* Description */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Description</span>
          <textarea
            value={data.description || ''}
            onChange={handleDescriptionChange}
            placeholder="Describe what this node should do..."
            rows={3}
            style={{
              background: '#242438', border: '1px solid #3a3a5a',
              color: '#e2e8f0', padding: '8px', fontSize: 12,
              fontFamily: 'inherit', resize: 'vertical',
            }}
          />
        </label>

        {/* Language */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8' }}>Language</span>
          <select
            value={data.language || 'typescript'}
            onChange={handleLanguageChange}
            style={{
              flex: 1, background: '#242438', border: '1px solid #3a3a5a',
              color: '#e2e8f0', padding: '4px 8px', fontSize: 11,
              cursor: 'pointer',
            }}
          >
            {LANGUAGE_OPTIONS.map(lang => (
              <option key={lang.value} value={lang.value}>{lang.label}</option>
            ))}
          </select>
          {node && hasExtensionConflict(data.label || '', data.language || 'typescript') && (
            <span
              style={{
                fontSize: 13, cursor: 'help', flexShrink: 0,
              }}
              title={`Extension conflict: label "${data.label}" uses .${extractLabelExtension(data.label || '') || '?'} but language ${data.language} expects .${getLanguageExtension(data.language || 'typescript')}`}
            >
              ⚠️
            </span>
          )}
        </label>

        {/* ── Extension conflict warning message ── */}
        {node && (() => {
          const conflict = hasExtensionConflict(data.label || '', data.language || 'typescript');
          if (!conflict) return null;
          const ext = extractLabelExtension(data.label || '') || '?';
          const langExt = getLanguageExtension(data.language || 'typescript');
          return (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 6,
              padding: '6px 8px', fontSize: 10, lineHeight: 1.4,
              background: 'rgba(245,158,11,0.1)',
              border: '1px solid rgba(245,158,11,0.3)',
              color: '#fbbf24', borderRadius: 0,
            }}>
              <span style={{ fontSize: 12, flexShrink: 0 }}>⚠️</span>
              <span>
                Label <strong style={{ color: '#fde68a' }}>{data.label}</strong> uses <strong>.{ext}</strong> but language <strong>{data.language}</strong> expects <strong>.{langExt}</strong>. The file will use <strong>.{langExt}</strong>.
              </span>
            </div>
          );
        })()}

        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8' }}>Status</span>
          <span style={{
            fontSize: 11, fontWeight: 600,
            color: data.status === 'valid' ? '#4ade80' :
                   data.status === 'error' ? '#f87171' :
                   data.status === 'generating' ? '#fbbf24' : '#64748b',
          }}>
            {data.status === 'generating' ? '⏳ Generating' :
             data.status === 'valid' ? '✓ Validated' :
             data.status === 'error' ? '✗ Error' : '○ Pending'}
          </span>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button
            onClick={() => { setCodeEditorNodeId(node.id); onClose(); }}
            style={{
              flex: 1, padding: '6px 8px', fontSize: 11, fontWeight: 600,
              border: '1px solid #60a5fa', background: 'rgba(96,165,250,0.1)',
              color: '#60a5fa', cursor: 'pointer', minWidth: 60,
            }}
          >
            ✏️ Edit Code
          </button>
          <button
            onClick={handleSuggest}
            disabled={suggestLoading}
            style={{
              flex: 1, padding: '6px 8px', fontSize: 11, fontWeight: 600,
              border: '1px solid #a78bfa', background: 'rgba(167,139,250,0.1)',
              color: '#a78bfa', cursor: suggestLoading ? 'default' : 'pointer', minWidth: 60,
              opacity: suggestLoading ? 0.6 : 1,
            }}
          >
            {suggestLoading ? '⏳' : '💡'} Suggest
          </button>
          <button
            onClick={handleDebug}
            disabled={debugLoading}
            style={{
              flex: 1, padding: '6px 8px', fontSize: 11, fontWeight: 600,
              border: '1px solid #fbbf24', background: 'rgba(251,191,36,0.1)',
              color: '#fbbf24', cursor: debugLoading ? 'default' : 'pointer', minWidth: 60,
              opacity: debugLoading ? 0.6 : 1,
            }}
          >
            {debugLoading ? '⏳' : '🐛'} Debug
          </button>
          <button
            onClick={handleAI}
            disabled={aiLoading}
            style={{
              flex: 1, padding: '6px 8px', fontSize: 11, fontWeight: 600,
              border: '1px solid #a78bfa', background: 'rgba(167,139,250,0.1)',
              color: '#a78bfa', cursor: aiLoading ? 'default' : 'pointer', minWidth: 60,
              opacity: aiLoading ? 0.6 : 1,
            }}
          >
            {aiLoading ? '⏳' : '🤖'} AI
          </button>
        </div>

        {/* Suggestion result */}
        {suggestion && (
          <div style={{
            padding: '8px', background: 'rgba(167,139,250,0.08)',
            border: '1px solid rgba(167,139,250,0.2)', fontSize: 11, color: '#c4b5fd',
            lineHeight: 1.5, whiteSpace: 'pre-wrap',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 10, color: '#a78bfa' }}>
              💡 AI Suggestion
            </div>
            {suggestion}
          </div>
        )}

        {/* Debug result */}
        {debugResult && (
          <div style={{
            padding: '8px', background: 'rgba(251,191,36,0.08)',
            border: '1px solid rgba(251,191,36,0.2)', fontSize: 11, color: '#fbbf24',
            lineHeight: 1.5, whiteSpace: 'pre-wrap',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 10, color: '#fbbf24' }}>
              🐛 Debug Results
            </div>
            {debugResult}
          </div>
        )}

        {/* AI result */}
        {aiResult && (
          <div style={{
            padding: '8px', background: 'rgba(167,139,250,0.08)',
            border: '1px solid rgba(167,139,250,0.2)', fontSize: 11, color: '#c4b5fd',
            lineHeight: 1.5, whiteSpace: 'pre-wrap',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 10, color: '#a78bfa' }}>
              🤖 Code Review
            </div>
            {aiResult}
          </div>
        )}

        {/* Generated code preview */}
        {data.generatedCode && (
          <details>
            <summary style={{
              fontSize: 11, fontWeight: 600, color: '#60a5fa',
              cursor: 'pointer', padding: '4px 0',
            }}>
              📄 Generated Code
            </summary>
            <pre style={{
              marginTop: 4, padding: '8px', background: '#0f0f1a',
              border: '1px solid #2a2a4a', fontSize: 11, color: '#6ee7b7',
              maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap',
              fontFamily: 'monospace',
            }}>
              {data.generatedCode}
            </pre>
          </details>
        )}

        {/* Resource files */}
        {data.resourceFiles && data.resourceFiles.length > 0 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>
              📁 Resource Files
            </div>
            {data.resourceFiles.map((file, i) => (
              <div key={i} style={{
                padding: '3px 6px', fontSize: 11, fontFamily: 'monospace',
                color: '#94a3b8', background: '#242438',
                border: '1px solid #3a3a5a', marginBottom: 2,
              }}>
                {file}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
