import { useState, useEffect, useCallback } from 'react';
import { Node } from 'reactflow';
import { useProjectStore } from '../store/projectStore';
import './NodeCodeEditor.css';

interface NodeCodeEditorProps {
  node: Node | null;
  onClose: () => void;
}

export default function NodeCodeEditor({ node, onClose }: NodeCodeEditorProps) {
  const updateNode = useProjectStore((s) => s.updateNode);
  const [code, setCode] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (node) {
      setCode((node.data as any)?.generatedCode || '');
      setSaved(false);
    }
  }, [node]);

  const handleSave = useCallback(() => {
    if (node) {
      updateNode(node.id, { generatedCode: code });
      setSaved(true);
      // Flash the save indicator, then close
      setTimeout(() => onClose(), 600);
    }
  }, [node, code, updateNode, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  }, [handleSave, onClose]);

  if (!node) return null;

  const nodeData = node.data as any;
  const hasCode = !!code?.trim();
  const nodeColor =
    nodeData?.type === 'master' ? '#f59e0b' :
    nodeData?.type === 'input' ? '#4ade80' :
    nodeData?.type === 'output' ? '#f87171' :
    nodeData?.type === 'logic' ? '#60a5fa' :
    nodeData?.type === 'api' ? '#a78bfa' :
    nodeData?.type === 'database' ? '#fbbf24' :
    nodeData?.type === 'ui' || nodeData?.type === 'ui-functions' ? '#f472b6' :
    nodeData?.type === 'gui-layout' ? '#00d9ff' : '#666';

  const language = nodeData?.language || 'typescript';

  return (
    <div className="node-code-overlay" onClick={onClose}>
      <div
        className={`node-code-panel ${saved ? 'saved-flash' : ''}`}
        onClick={(e) => e.stopPropagation()}
        style={{ borderColor: nodeColor }}
      >
        {/* ── Header ── */}
        <div className="node-code-header" style={{ borderBottomColor: nodeColor }}>
          <div className="node-code-header-left">
            <span className="node-code-type-badge" style={{ background: nodeColor }}>
              {nodeData?.type || 'node'}
            </span>
            <span className="node-code-title">
              {nodeData?.label || node.id}
            </span>
            <span className="node-code-lang-badge">{language}</span>
          </div>
          <div className="node-code-header-actions">
            {saved && <span className="node-code-saved-indicator">✅ Saved!</span>}
            <button
              className="node-code-btn node-code-btn-save"
              onClick={handleSave}
              title="Save (Ctrl+S)"
              style={{ borderColor: nodeColor, color: nodeColor }}
            >
              💾 Save
            </button>
            <button
              className="node-code-btn node-code-btn-close"
              onClick={onClose}
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Description context strip ── */}
        {nodeData?.description && (
          <div className="node-code-desc-bar">
            <span className="node-code-desc-icon">📝</span>
            <span className="node-code-desc-text">{nodeData.description}</span>
          </div>
        )}

        {/* ── Code textarea ── */}
        <textarea
          className="node-code-textarea"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setSaved(false);
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            hasCode
              ? "// Edit your code here..."
              : `// Write your ${language} code for this ${nodeData?.type || 'node'} node here.\n// Describe what you want — the AI will use this during code generation.\n// Or paste in existing code you'd like to attach to this component.`
          }
          autoFocus
          spellCheck={false}
        />

        {/* ── Footer status bar ── */}
        <div className="node-code-footer">
          <span className="node-code-footer-info">
            {hasCode
              ? `${code.split('\n').length} lines · ${code.length} chars`
              : `💡 No code written yet — start typing or generate from the toolbar`}
          </span>
          <span className="node-code-footer-hint">
            {saved ? '✅ Saved' : hasCode ? 'unsaved changes' : 'Ctrl+S to save · Esc to close'}
          </span>
        </div>
      </div>
    </div>
  );
}
