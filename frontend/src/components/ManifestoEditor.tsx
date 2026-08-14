import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  parseManifesto,
  serializeManifesto,
  getSectionColor,
  getSectionTemplate,
  type ManifestoData,
  type ManifestoSection,
  type ManifestoCheckbox,
  type ManifestoTextField,
  type ManifestoListItem,
  type ManifestoVision,
  type ManifestoSubheading,
  type ManifestoStatement,
} from '../utils/manifestoParser';

interface ManifestoEditorProps {
  onClose: () => void;
}

// ─── Shallow clone (replaces structuredClone for compatibility) ────────────

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// ─── Debounced auto-save hook ──────────────────────────────────────────────

function useAutoSave(content: string, enabled: boolean) {
  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState<'success' | 'error' | ''>('');
  const [saving, setSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef('');

  const save = useCallback(async (text: string) => {
    // Cancel any pending clear timer
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    setSaving(true);
    setStatus('');
    setStatusType('');
    try {
      const res = await fetch('/api/manifesto', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus('✅ Preferences saved — AI will follow these settings.');
        setStatusType('success');
        lastSavedRef.current = text;
      } else {
        setStatus(data.error || 'Save failed');
        setStatusType('error');
      }
    } catch {
      setStatus('❌ Could not save — backend unavailable');
      setStatusType('error');
    }
    setSaving(false);

    // Auto-clear success after 3s
    clearTimerRef.current = setTimeout(() => {
      setStatus('');
      setStatusType('');
    }, 3000);
  }, []);

  // Force save immediately
  const forceSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (content && content !== lastSavedRef.current) {
      save(content);
    }
  }, [content, save]);

  useEffect(() => {
    if (!enabled || !content) return;
    if (content === lastSavedRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      save(content);
    }, 800);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [content, enabled, save]);

  useEffect(() => {
    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
  }, []);

  return { status, statusType, saving, forceSave };
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function ManifestoEditor({ onClose }: ManifestoEditorProps) {
  const [rawContent, setRawContent] = useState('');
  const [parsed, setParsed] = useState<ManifestoData>({ sections: [] });
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'interactive' | 'raw'>('interactive');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [showContext, setShowContext] = useState(false);
  const [contextStr, setContextStr] = useState('');
  const parseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { status, statusType, saving, forceSave } = useAutoSave(rawContent, !loading);

  // ── Load manifesto from backend ──
  const loadManifesto = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/manifesto');
      const data = await res.json();
      if (data.success) {
        const content = data.manifesto || '';
        setRawContent(content);
        setContextStr(data.context || '');
        const p = parseManifesto(content);
        setParsed(p);
        // Expand first section by default
        if (p.sections.length > 0) {
          setExpandedSections(new Set([p.sections[0].id]));
        }
      } else {
        setRawContent('# No manifesto found\n\nCreate your design manifesto here.');
        setParsed({ sections: [] });
      }
    } catch {
      setRawContent('# No manifesto found\n\nCreate your design manifesto here.');
      setParsed({ sections: [] });
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadManifesto(); }, [loadManifesto]);

  // ── Rebuild raw content from parsed data ──
  const rebuildContent = useCallback((data: ManifestoData) => {
    const text = serializeManifesto(data);
    setRawContent(text);
  }, []);

  // ── Toggle section expand ──
  const toggleSection = useCallback((id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Toggle checkbox item ──
  const toggleCheckbox = useCallback((sectionIdx: number, itemIdx: number) => {
    setParsed(prev => {
      const next = clone(prev);
      const item = next.sections[sectionIdx].items[itemIdx] as ManifestoCheckbox;
      item.checked = !item.checked;
      rebuildContent(next);
      return next;
    });
  }, [rebuildContent]);

  // ── Update text field ──
  const updateTextField = useCallback((sectionIdx: number, itemIdx: number, value: string) => {
    setParsed(prev => {
      const next = clone(prev);
      const item = next.sections[sectionIdx].items[itemIdx] as ManifestoTextField;
      item.content = value;
      rebuildContent(next);
      return next;
    });
  }, [rebuildContent]);

  // ── Update vision text ──
  const updateVision = useCallback((sectionIdx: number, itemIdx: number, value: string) => {
    setParsed(prev => {
      const next = clone(prev);
      const item = next.sections[sectionIdx].items[itemIdx] as ManifestoVision;
      item.content = value;
      rebuildContent(next);
      return next;
    });
  }, [rebuildContent]);

  // ── Update list item label ──
  const updateListItem = useCallback((sectionIdx: number, itemIdx: number, field: 'label' | 'description', value: string) => {
    setParsed(prev => {
      const next = clone(prev);
      const item = next.sections[sectionIdx].items[itemIdx] as ManifestoListItem;
      item[field] = value;
      item.text = `${item.number}. **${item.label}**${item.description ? ` — ${item.description}` : ''}`;
      rebuildContent(next);
      return next;
    });
  }, [rebuildContent]);

  // ── Reset to template ──
  const handleReset = useCallback(async () => {
    if (!confirm('Reset to the original template? Your custom content will be lost.')) return;
    try {
      const res = await fetch('/api/manifesto/reset', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await loadManifesto();
      }
    } catch {
      // ignore
    }
  }, [loadManifesto]);

  // ── Reload from server ──
  const handleReload = useCallback(async () => {
    await loadManifesto();
  }, [loadManifesto]);

  // ── Keyboard shortcut: Ctrl+S forces a save, Escape closes ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        forceSave();
      }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, forceSave]);

  // ── Word count ──
  const wordCount = useMemo(() => {
    return rawContent.split(/\s+/).filter(Boolean).length;
  }, [rawContent]);

  // ── Checkbox count ──
  const checkedCount = useMemo(() => {
    let total = 0;
    let checked = 0;
    for (const section of parsed.sections) {
      for (const item of section.items) {
        if (item.type === 'checkbox') {
          total++;
          if ((item as ManifestoCheckbox).checked) checked++;
        }
      }
    }
    return { checked, total };
  }, [parsed]);

  // ── Debounced re-parse when in raw mode ──
  const debouncedParse = useCallback((text: string) => {
    if (parseTimerRef.current) clearTimeout(parseTimerRef.current);
    parseTimerRef.current = setTimeout(() => {
      try { setParsed(parseManifesto(text)); } catch { /* ignore parse errors */ }
    }, 500);
  }, []);

  useEffect(() => {
    return () => {
      if (parseTimerRef.current) clearTimeout(parseTimerRef.current);
    };
  }, []);

  // ── Render an interactive section ──
  const renderSection = (section: ManifestoSection, sectionIdx: number) => {
    const isExpanded = expandedSections.has(section.id);
    const color = getSectionColor(section.id);
    const tmpl = getSectionTemplate(section.id);
    const checkboxItems = section.items.filter(i => i.type === 'checkbox');
    const checked = checkboxItems.filter(i => (i as ManifestoCheckbox).checked).length;

    return (
      <div
        key={section.id}
        className={`manifesto-interactive-section ${isExpanded ? 'expanded' : ''}`}
        style={{ borderLeftColor: color }}
      >
        {/* Section header — click to expand */}
        <button
          className="manifesto-section-header"
          onClick={() => toggleSection(section.id)}
          data-section={section.id}
        >
          <div className="manifesto-section-header-left">
            <span className="manifesto-section-emoji">{tmpl.emoji}</span>
            <div className="manifesto-section-header-text">
              <span className="manifesto-section-title">{tmpl.title}</span>
              {!isExpanded && (
                <span className="manifesto-section-subtitle">{tmpl.subtitle}</span>
              )}
            </div>
          </div>
          <div className="manifesto-section-header-right">
            {checkboxItems.length > 0 && (
              <span className="manifesto-section-check-count" style={{ color }}>
                {checked}/{checkboxItems.length}
              </span>
            )}
            <span className="manifesto-section-toggle">{isExpanded ? '−' : '+'}</span>
          </div>
        </button>

        {/* Section body — shown when expanded */}
        {isExpanded && (
          <div className="manifesto-section-body">
            {section.items.map((item, itemIdx) => {
              switch (item.type) {
                case 'checkbox':
                  return renderCheckbox(item, sectionIdx, itemIdx);
                case 'textfield':
                  return renderTextField(item, sectionIdx, itemIdx);
                case 'list-item':
                  return renderListItem(item, sectionIdx, itemIdx);
                case 'subheading':
                  return renderSubheading(item);
                case 'statement':
                  return renderStatement(item);
                case 'vision':
                  return renderVisionField(item, sectionIdx, itemIdx);
                default:
                  return null;
              }
            })}
          </div>
        )}
      </div>
    );
  };

  // ── Render checkbox toggle card ──
  const renderCheckbox = (item: ManifestoCheckbox, sectionIdx: number, itemIdx: number) => {
    const boldMatch = item.text.match(/^\*\*(.+?)\*\*(?:\s*[—–-]\s*(.*))?$/);
    const label = boldMatch ? boldMatch[1] : item.checkedText;
    const description = boldMatch && boldMatch[2] ? boldMatch[2].trim() : '';

    return (
      <button
        key={`cb-${itemIdx}`}
        className={`manifesto-checkbox-btn ${item.checked ? 'checked' : ''}`}
        onClick={() => toggleCheckbox(sectionIdx, itemIdx)}
        title={item.checked ? `Enabled: ${label} — click to disable` : `Disabled: ${label} — click to enable`}
        type="button"
      >
        <span className="manifesto-checkbox-indicator">
          {item.checked ? '✓' : '○'}
        </span>
        <div className="manifesto-checkbox-content">
          <span className="manifesto-checkbox-label">{label}</span>
          {description && (
            <span className="manifesto-checkbox-desc">{description}</span>
          )}
        </div>
        <span className={`manifesto-checkbox-status ${item.checked ? 'on' : 'off'}`}>
          {item.checked ? 'ON' : 'OFF'}
        </span>
      </button>
    );
  };

  // ── Render text field ──
  const renderTextField = (item: ManifestoTextField, sectionIdx: number, itemIdx: number) => {
    return (
      <div key={`tf-${itemIdx}`} className="manifesto-textfield">
        <label className="manifesto-textfield-label">{item.label}</label>
        <textarea
          className="manifesto-textfield-input"
          value={item.content}
          onChange={(e) => updateTextField(sectionIdx, itemIdx, e.target.value)}
          placeholder={item.placeholder}
          rows={Math.max(2, item.content.split('\n').length)}
          spellCheck={false}
        />
      </div>
    );
  };

  // ── Render list item (numbered) ──
  const renderListItem = (item: ManifestoListItem, sectionIdx: number, itemIdx: number) => {
    return (
      <div key={`li-${itemIdx}`} className="manifesto-list-item-row">
        <span className="manifesto-list-number">{item.number}.</span>
        <div className="manifesto-list-fields">
          <input
            className="manifesto-list-label-input"
            value={item.label}
            onChange={(e) => updateListItem(sectionIdx, itemIdx, 'label', e.target.value)}
            placeholder="Language name"
          />
          <input
            className="manifesto-list-desc-input"
            value={item.description}
            onChange={(e) => updateListItem(sectionIdx, itemIdx, 'description', e.target.value)}
            placeholder="Description / use case"
          />
        </div>
      </div>
    );
  };

  // ── Render subheading text ──
  const renderSubheading = (item: ManifestoSubheading) => {
    return (
      <div key={`sh-${item.text}`} className="manifesto-subheading">
        <span>{item.text}</span>
      </div>
    );
  };

  // ── Render statement text (read-only display) ──
  const renderStatement = (item: ManifestoStatement) => {
    if (!item.content || item.content.trim().length === 0) return null;
    return (
      <div key={`st-${item.content.substring(0, 20)}`} className="manifesto-statement">
        {item.content}
      </div>
    );
  };

  // ── Render vision field ──
  const renderVisionField = (item: ManifestoVision, sectionIdx: number, itemIdx: number) => {
    return (
      <div key={`vision-${itemIdx}`} className="manifesto-textfield manifesto-vision-field">
        <label className="manifesto-textfield-label">Your Vision Statement</label>
        <textarea
          className="manifesto-textfield-input manifesto-vision-input"
          value={item.content}
          onChange={(e) => updateVision(sectionIdx, itemIdx, e.target.value)}
          placeholder="In one or two sentences, what kind of software do you want to build, and how should the AI help you build it?"
          rows={3}
          spellCheck={false}
        />
      </div>
    );
  };

  return (
    <div className="settings-modal-overlay manifesto-overlay" onClick={onClose}>
      <div className="settings-modal manifesto-modal" onClick={(e) => e.stopPropagation()}>
        {/* ── Header ── */}
        <div className="settings-modal-header">
          <div className="manifesto-header-left">
            <span className="manifesto-header-icon">🎨</span>
            <span>Design Manifesto</span>
            {saving && <span className="manifesto-saving-indicator">⏳ Saving...</span>}
          </div>
          <div className="manifesto-header-right">
            <button
              className="manifesto-mode-toggle"
              onClick={() => setMode(mode === 'interactive' ? 'raw' : 'interactive')}
              title={mode === 'interactive' ? 'Switch to raw markdown editor' : 'Switch to interactive controls'}
              type="button"
            >
              {mode === 'interactive' ? '📝 Raw' : '🎛️ Interactive'}
            </button>
            <button className="settings-modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="settings-modal-body manifesto-body">
          {loading && (
            <div className="manifesto-loading">
              <div className="manifesto-spinner" />
              <span>Loading manifesto...</span>
            </div>
          )}

          {!loading && mode === 'interactive' && (
            <div className="manifesto-interactive-container">
              {/* Summary bar */}
              <div className="manifesto-summary-bar">
                <div className="manifesto-summary-item">
                  <span className="manifesto-summary-icon">📋</span>
                  <span>{parsed.sections.length} sections</span>
                </div>
                <div className="manifesto-summary-item">
                  <span className="manifesto-summary-icon">✅</span>
                  <span>{checkedCount.checked}/{checkedCount.total} preferences set</span>
                </div>
                <div className="manifesto-summary-item">
                  <span className="manifesto-summary-icon">📝</span>
                  <span>{wordCount} words</span>
                </div>
                <div className="manifesto-summary-fill">
                  <div className="manifesto-summary-bar-track">
                    <div
                      className="manifesto-summary-bar-fill"
                      style={{
                        width: `${checkedCount.total > 0 ? (checkedCount.checked / checkedCount.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Status */}
              {status && (
                <div className={`manifesto-status ${statusType}`}>
                  <span>{status}</span>
                  {statusType === 'success' && (
                    <button className="manifesto-status-dismiss" onClick={() => {}}>✕</button>
                  )}
                </div>
              )}

              {/* Sections */}
              <div className="manifesto-sections-list">
                {parsed.sections.map((section, idx) => renderSection(section, idx))}
              </div>

              {/* Context preview */}
              <details className="manifesto-context-details" open={showContext}>
                <summary onClick={(e) => { e.preventDefault(); setShowContext(!showContext); }}>
                  <span>{showContext ? '▼' : '▶'} Injected Context Preview ({contextStr.length} chars)</span>
                  {contextStr ? (
                    <span className="manifesto-context-badge" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>Active</span>
                  ) : (
                    <span className="manifesto-context-badge" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>Empty</span>
                  )}
                </summary>
                {showContext && (
                  <div className="manifesto-context-preview">
                    {contextStr ? (
                      <pre>{contextStr}</pre>
                    ) : (
                      <div className="manifesto-context-empty">
                        No context to inject yet. Toggle options above to teach the AI your preferences.
                      </div>
                    )}
                  </div>
                )}
              </details>
            </div>
          )}

          {!loading && mode === 'raw' && (
            <div className="manifesto-raw-container">
              <div className="manifesto-instructions">
                <strong>📝 Raw Markdown Editor</strong>
                <p>
                  Edit the Markdown document below directly. Every architecture plan, code generation,
                  and suggestion will follow these preferences.
                </p>
                <div className="manifesto-instructions-shortcuts">
                  <span><kbd>Ctrl+S</kbd> Save</span>
                  <span><kbd>Esc</kbd> Close</span>
                  <span><span className="manifesto-dot" style={{ background: '#10b981' }} /> Filled in</span>
                  <span><span className="manifesto-dot" style={{ background: '#f59e0b' }} /> Needs input</span>
                </div>
              </div>

              <textarea
                className="manifesto-textarea"
                value={rawContent}
                onChange={(e) => {
                  const val = e.target.value;
                  setRawContent(val);
                  debouncedParse(val);
                }}
                placeholder="Write your Design Manifesto here..."
                spellCheck={false}
              />

              {status && (
                <div className={`manifesto-status ${statusType}`}>
                  <span>{status}</span>
                  {statusType === 'success' && (
                    <button className="manifesto-status-dismiss" onClick={() => {}}>✕</button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="settings-modal-footer manifesto-footer">
          <div className="manifesto-footer-left">
            <button
              className="manifesto-btn manifesto-btn-danger"
              onClick={handleReset}
              disabled={saving}
              type="button"
            >
              ↺ Reset
            </button>
            <button
              className="manifesto-btn manifesto-btn-secondary"
              onClick={handleReload}
              disabled={saving}
              type="button"
            >
              ↻ Reload
            </button>
          </div>
          <div className="manifesto-footer-right">
            <span className="manifesto-word-count">{wordCount} words</span>
            <span className="manifesto-word-count" style={{ color: saving ? '#f59e0b' : '#10b981' }}>
              {saving ? '⏳ Saving...' : statusType === 'success' ? '✅ Auto-save on' : '💾 Auto-save'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
