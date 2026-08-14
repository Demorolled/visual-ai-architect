import { useState, useEffect, useRef, useCallback } from 'react';
import { useProjectStore } from '../store/projectStore';
import { useToolManifestStore } from '../store/toolManifestStore';
import { subscribeReasoning, ReasoningMessage } from '../utils/reasoningSync';
import { getCategoryLabel, getCategoryIcon } from '../utils/useToolManifest';
import './CodeOutputPanel.css';

const CODE_OUTPUT_CHANNEL = 'visual-ai-code-output';

interface CodeEntry {
  id: string;
  label: string;
  language: string;
  code: string;
  timestamp: string;
  source: 'node' | 'message' | 'file';
}

function extractCodeBlocks(text: string): { language: string; code: string }[] {
  const blocks: { language: string; code: string }[] = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      language: match[1] || 'typescript',
      code: match[2].trim(),
    });
  }
  return blocks;
}

function getLanguageIcon(lang: string): string {
  const icons: Record<string, string> = {
    javascript: '🟨',
    js: '🟨',
    typescript: '🔷',
    ts: '🔷',
    python: '🐍',
    py: '🐍',
    go: '🔵',
    rust: '🦀',
    rs: '🦀',
    java: '☕',
    csharp: '🔷',
    'c#': '🔷',
    cpp: '⚙️',
    'c++': '⚙️',
    swift: '🍎',
    kotlin: '🤖',
    php: '🐘',
    ruby: '💎',
    html: '🌐',
    css: '🎨',
    sql: '🗃️',
    bash: '💻',
    sh: '💻',
    shell: '💻',
    yaml: '📋',
    yml: '📋',
    json: '📦',
    xml: '📄',
    markdown: '📝',
    md: '📝',
    dockerfile: '🐳',
    docker: '🐳',
  };
  return icons[lang.toLowerCase()] || '📄';
}

function getLanguageLabel(lang: string): string {
  const labels: Record<string, string> = {
    javascript: 'JavaScript',
    js: 'JavaScript',
    typescript: 'TypeScript',
    ts: 'TypeScript',
    python: 'Python',
    py: 'Python',
  };
  return labels[lang.toLowerCase()] || lang || 'Unknown';
}

const CodeOutputPanel: React.FC = () => {
  const { codeOutputDetached, setCodeOutputDetached } = useProjectStore();
  const [codeEntries, setCodeEntries] = useState<CodeEntry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [showFiles, setShowFiles] = useState(true);
  const [showMessages, setShowMessages] = useState(true);
  const [showTools, setShowTools] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const codeOutputWindowRef = useRef<Window | null>(null);

  // ── Detach / Reattach ──
  useEffect(() => {
    if (codeOutputDetached) {
      const w = window.open('/code-output.html', 'code-output-window', 'width=700,height=600,menubar=no,toolbar=no');
      if (w) codeOutputWindowRef.current = w;
      else setCodeOutputDetached(false);
    } else {
      if (codeOutputWindowRef.current && !codeOutputWindowRef.current.closed) {
        codeOutputWindowRef.current.close();
      }
      codeOutputWindowRef.current = null;
    }
  }, [codeOutputDetached, setCodeOutputDetached]);

  // ── Broadcast-channel sync between main window and detached popup ──
  // Uses refs so the onmessage closure always has fresh data without
  // re-creating the channel (which would cause loops from re-subscribing).
  //
  // Both windows play both roles: on mount each sends a sync-request, and
  // each responds to sync-requests from the other window with its current
  // entries. The window that HAS entries responds to the window that DOESN'T.
  // BroadcastChannel never delivers to the sender, so there is no self-loop.
  const entriesRef = useRef(codeEntries);
  entriesRef.current = codeEntries;
  const selectedRef = useRef(selectedEntryId);
  selectedRef.current = selectedEntryId;

  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(CODE_OUTPUT_CHANNEL);
      ch.onmessage = (event: MessageEvent) => {
        const data = event.data || {};
        if (data.type === 'sync-request' && entriesRef.current.length > 0) {
          // Respond with our entries to the other window
          ch?.postMessage({
            type: 'initial-sync',
            entries: entriesRef.current,
            selectedId: selectedRef.current,
          });
        } else if (data.type === 'initial-sync' && data.entries?.length > 0) {
          // Accept incoming data only if we're empty OR if it differs from ours
          // Returning prev (same identity) when nothing changed prevents
          // re-render, which prevents Effect 2 from re-firing, which prevents
          // infinite broadcast loops between the two windows.
          setCodeEntries(prev => {
            if (prev.length === 0) return data.entries;
            if (prev.length !== data.entries.length) return data.entries;
            // Shallow check: different id or different code? then accept
            const changed = (data.entries as CodeEntry[]).some(
              (e, i) => prev[i]?.id !== e.id || prev[i]?.code !== e.code
            );
            return changed ? data.entries : prev;
          });
          if (data.selectedId) {
            setSelectedEntryId(prev => prev ?? data.selectedId);
          }
        }
      };
      // Request sync from the other window on mount
      ch.postMessage({ type: 'sync-request' });
    } catch {}
    return () => {
      if (ch) try { ch.close(); } catch {}
    };
  }, []); // no deps: runs once per mount, never re-creates

  // ── Push incremental updates whenever entries change ──
  // BroadcastChannel does NOT deliver to the sender, so no self-loop.
  // The receiver guard (prev.length === 0) prevents overriding populated state.
  useEffect(() => {
    if (codeEntries.length === 0) return;
    try {
      const ch = new BroadcastChannel(CODE_OUTPUT_CHANNEL);
      ch.postMessage({
        type: 'initial-sync',
        entries: codeEntries,
        selectedId: selectedEntryId,
      });
      ch.close();
    } catch {}
  }, [codeEntries]);

  // Tool manifest from WebSocket broadcast
  const manifestReceived = useToolManifestStore(s => s.received);
  const manifestGrouped = useToolManifestStore(s => s.grouped);
  const manifestCount = useToolManifestStore(s => s.manifest.length);

  // Subscribe to reasoning messages to capture code blocks
  useEffect(() => {
    const unsub = subscribeReasoning(
      (msg: ReasoningMessage) => {
        if (msg.role !== 'ai' || !msg.text) return;
        const blocks = extractCodeBlocks(msg.text);
        if (blocks.length === 0) return;

        const newEntries: CodeEntry[] = blocks.map((block, i) => ({
          id: `msg_${msg.timestamp}_${i}`,
          label: extractLabelFromContext(msg.text, block.code) || `Code Block ${i + 1}`,
          language: block.language,
          code: block.code,
          timestamp: msg.timestamp,
          source: 'message',
        }));
        setCodeEntries(prev => {
          const existing = new Set(prev.map(e => e.id));
          const deduped = newEntries.filter(e => !existing.has(e.id));
          if (deduped.length === 0) return prev;
          return [...prev, ...deduped];
        });
      },
      () => {},
      () => setCodeEntries([]),
    );
    return () => unsub();
  }, []);

  // Watch for node generatedCode changes
  const nodes = useProjectStore(s => s.nodes);
  const isGenerating = useProjectStore(s => s.isGenerating);

  useEffect(() => {
    if (nodes.length === 0) return;
    const nodeEntries: CodeEntry[] = [];
    for (const node of nodes) {
      const code = node.data?.generatedCode;
      if (code && code.trim()) {
        const existingEntry = codeEntries.find(
          e => e.source === 'node' && e.id === `node_${node.id}`
        );
        if (!existingEntry) {
          nodeEntries.push({
            id: `node_${node.id}`,
            label: node.data?.label || node.id,
            language: node.data?.language || 'typescript',
            code,
            timestamp: new Date().toISOString(),
            source: 'node',
          });
        } else if (existingEntry.code !== code) {
          // Update existing entry
          setCodeEntries(prev =>
            prev.map(e =>
              e.id === existingEntry.id ? { ...e, code, timestamp: new Date().toISOString() } : e
            )
          );
        }
      }
    }
    if (nodeEntries.length > 0) {
      setCodeEntries(prev => [...prev, ...nodeEntries]);
    }
  }, [nodes, isGenerating]);

  // Auto-select newest entry
  useEffect(() => {
    if (codeEntries.length > 0 && !selectedEntryId) {
      setSelectedEntryId(codeEntries[codeEntries.length - 1].id);
    }
  }, [codeEntries.length]);

  const filteredEntries = codeEntries.filter(e => {
    if (filterText) {
      const q = filterText.toLowerCase();
      return e.label.toLowerCase().includes(q) || e.code.toLowerCase().includes(q);
    }
    if (e.source === 'node' && !showFiles) return false;
    if (e.source === 'message' && !showMessages) return false;
    return true;
  });

  const selectedEntry = codeEntries.find(e => e.id === selectedEntryId);

  const handleClear = () => {
    setCodeEntries([]);
    setSelectedEntryId(null);
  };

  const handleCopyCode = useCallback(() => {
    if (selectedEntry?.code) {
      navigator.clipboard.writeText(selectedEntry.code);
    }
  }, [selectedEntry]);

  const entryCount = codeEntries.length;
  const fileCount = codeEntries.filter(e => e.source === 'node').length;
  const messageCount = codeEntries.filter(e => e.source === 'message').length;

  if (codeOutputDetached) {
    return (
      <div className="code-output-panel" ref={panelRef}>
        <div className="cop-header">
          <div className="cop-header-left">
            <span className="cop-title">📄 Generated Code</span>
            <span className="cop-badge">{entryCount}</span>
          </div>
          <div className="cop-header-right">
            <button
              className={`cop-detach-btn detached`}
              onClick={() => setCodeOutputDetached(false)}
              title="Reattach code output panel"
            >
              ↩
            </button>
          </div>
        </div>
        <div className="cop-detached-msg">
          <span>Code output running in separate window</span>
        </div>
      </div>
    );
  }

  return (
    <div className="code-output-panel" ref={panelRef}>
      {/* Header */}
      <div className="cop-header">
        <div className="cop-header-left">
          <span className="cop-title">📄 Generated Code</span>
          <span className="cop-badge">{entryCount}</span>
        </div>
        <div className="cop-header-right">
          <button
            className="cop-clear-btn"
            onClick={handleClear}
            title="Clear all code entries"
            disabled={entryCount === 0}
          >
            🗑
          </button>
          <button
            className="cop-detach-btn"
            onClick={() => setCodeOutputDetached(true)}
            title="Detach code output to separate window"
          >
            ↗
          </button>
        </div>
      </div>

      {/* Tool Manifest Banner */}
      {manifestReceived && (
        <div className={`cop-tools-banner ${showTools ? 'expanded' : ''}`}>
          <div
            className="cop-tools-header"
            onClick={() => setShowTools(prev => !prev)}
          >
            <span className="cop-tools-header-icon">🔧</span>
            <span className="cop-tools-header-label">Tools ({manifestCount})</span>
            <span className="cop-tools-header-toggle">{showTools ? '▾' : '▸'}</span>
          </div>
          {showTools && (
            <div className="cop-tools-body">
              {Object.entries(manifestGrouped).map(([category, tools]) => (
                <div key={category} className="cop-tools-category">
                  <div className="cop-tools-category-header">
                    {getCategoryIcon(category)} {getCategoryLabel(category)}
                    <span className="cop-tools-category-count">{tools.length}</span>
                  </div>
                  <div className="cop-tools-category-list">
                    {tools.map(tool => (
                      <div key={tool.name} className="cop-tools-item" title={tool.description}>
                        <span className="cop-tools-item-name">{tool.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filter & Toggles */}
      <div className="cop-toolbar">
        <div className="cop-filter-row">
          <input
            className="cop-filter-input"
            type="text"
            placeholder="Filter code..."
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
          />
        </div>
        <div className="cop-toggle-row">
          <label className={`cop-toggle ${showFiles ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={showFiles}
              onChange={e => setShowFiles(e.target.checked)}
            />
            <span>📁 Files ({fileCount})</span>
          </label>
          <label className={`cop-toggle ${showMessages ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={showMessages}
              onChange={e => setShowMessages(e.target.checked)}
            />
            <span>💬 Messages ({messageCount})</span>
          </label>
        </div>
      </div>

      {/* Empty state */}
      {filteredEntries.length === 0 && (
        <div className="cop-empty">
          {codeEntries.length === 0 ? (
            <>
              <div className="cop-empty-icon">📄</div>
              <div className="cop-empty-title">No Generated Code Yet</div>
              <div className="cop-empty-desc">
                Code blocks from LLM responses and node-generated code will appear here.
              </div>
            </>
          ) : (
            <>
              <div className="cop-empty-icon">🔍</div>
              <div className="cop-empty-title">No matches for "{filterText}"</div>
            </>
          )}
        </div>
      )}

      {/* Code List + Viewer */}
      {filteredEntries.length > 0 && (
        <div className="cop-content">
          {/* File list sidebar */}
          <div className="cop-file-list">
            {filteredEntries.map(entry => (
              <div
                key={entry.id}
                className={`cop-file-item ${selectedEntryId === entry.id ? 'selected' : ''}`}
                onClick={() => setSelectedEntryId(entry.id)}
              >
                <div className="cop-file-item-header">
                  <span className="cop-file-icon">
                    {getLanguageIcon(entry.language)}
                  </span>
                  <span className="cop-file-name">{entry.label}</span>
                  <span className="cop-file-source-badge">
                    {entry.source === 'node' ? '📁' : '💬'}
                  </span>
                </div>
                <div className="cop-file-meta">
                  <span className="cop-file-lang">{getLanguageLabel(entry.language)}</span>
                  <span className="cop-file-lines">{entry.code.split('\n').length} lines</span>
                </div>
              </div>
            ))}
          </div>

          {/* Code viewer */}
          <div className="cop-viewer">
            {selectedEntry ? (
              <>
                <div className="cop-viewer-header">
                  <div className="cop-viewer-info">
                    <span className="cop-viewer-icon">{getLanguageIcon(selectedEntry.language)}</span>
                    <span className="cop-viewer-label">{selectedEntry.label}</span>
                    <span className="cop-viewer-lang">{getLanguageLabel(selectedEntry.language)}</span>
                    <span className="cop-viewer-lines">{selectedEntry.code.split('\n').length} lines</span>
                  </div>
                  <button
                    className="cop-copy-btn"
                    onClick={handleCopyCode}
                    title="Copy code"
                  >
                    📋 Copy
                  </button>
                </div>
                <div className="cop-code-wrapper">
                  <pre className="cop-code-block">
                    <code>{selectedEntry.code}</code>
                  </pre>
                </div>
              </>
            ) : (
              <div className="cop-viewer-empty">
                Select a file to view its code
              </div>
            )}
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};

/**
 * Try to extract a meaningful label for a code block from surrounding context text.
 */
function extractLabelFromContext(fullText: string, code: string): string | null {
  // Look for patterns like "file: foo.ts" or "foo.ts:" or "create file" before the block
  const lines = fullText.split('\n');
  let codeIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(code.substring(0, Math.min(40, code.length)))) {
      codeIndex = i;
      break;
    }
  }
  if (codeIndex > 0) {
    // Check the line before the code block
    const prevLine = lines[codeIndex - 1]?.trim() || '';
    // Match filename patterns
    const fileMatch = prevLine.match(/[`]?([\w.\-/]+(?:\.[a-zA-Z]+))[`]?/);
    if (fileMatch) return fileMatch[1];
    // Match "file: name" or "filename:"
    const labelMatch = prevLine.match(/(?:file|File|filename|Filename)[:\s]+["`]?([\w.\-/]+)["`]?/);
    if (labelMatch) return labelMatch[1];
    // Just use a short prefix of the context line
    if (prevLine && prevLine.length < 80) return prevLine;
  }
  return null;
}

export default CodeOutputPanel;
