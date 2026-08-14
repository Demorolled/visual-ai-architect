/**
 * WikiPanel — the VACA wiki (modelVeronice.txt) inside the floating preview
 * window. Shown when the user asks to see the wiki (auto-detected in the chat,
 * or via the 📗 button on AI messages).
 *
 * Left: searchable, numbered section list. Right: the selected section body
 * rendered as preformatted text (the wiki is plain text with ===== headers).
 */

import { useCallback, useEffect, useState } from 'react';
import './WikiPanel.css';

interface WikiSection {
  number: number;
  title: string;
  body: string;
}

interface WikiResponse {
  success: boolean;
  sections: WikiSection[];
  totalSections: number;
  lastUpdated: string | null;
}

export default function WikiPanel() {
  const [sections, setSections] = useState<WikiSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<number | null>(null);

  const fetchWiki = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/wiki', { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: WikiResponse = await res.json();
      if (!data.success || !Array.isArray(data.sections)) throw new Error('Bad wiki payload');
      setSections(data.sections);
      // Default to the newest (highest-numbered) section.
      const max = data.sections.reduce((m, s) => Math.max(m, s.number), 0);
      setSelected((prev) => (prev !== null && data.sections.some((s) => s.number === prev) ? prev : max || null));
    } catch (err: any) {
      setError(err?.message || 'Failed to load the wiki');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWiki();
  }, [fetchWiki]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? sections.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.body.toLowerCase().includes(q)
      )
    : sections;

  const current = selected !== null ? sections.find((s) => s.number === selected) : null;

  return (
    <div className="wk-wrap">
      <div className="wk-head">
        <div className="wk-title">
          📗 VACA Wiki <span className="wk-count">{sections.length} sections</span>
        </div>
        <button className="wk-refresh" onClick={fetchWiki} disabled={loading} title="Refresh the wiki">🔄</button>
      </div>

      {loading && (
        <div className="wk-state">
          <div className="wk-spinner" />
          <div>Reading modelVeronice.txt…</div>
        </div>
      )}

      {!loading && error && (
        <div className="wk-state">
          <div className="wk-error-title">❌ Could not load the wiki</div>
          <div className="wk-error-detail">{error}</div>
          <button className="wk-retry" onClick={fetchWiki}>Retry</button>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="wk-search">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="🔍 Search sections…"
              className="wk-search-input"
            />
          </div>
          <div className="wk-body">
            <div className="wk-list">
              {filtered.length === 0 ? (
                <div className="wk-empty-list">No sections match “{query}”.</div>
              ) : (
                filtered.map((s) => (
                  <button
                    key={s.number}
                    className={`wk-item ${selected === s.number ? 'active' : ''}`}
                    onClick={() => setSelected(s.number)}
                    title={s.title}
                  >
                    <span className="wk-item-num">{s.number}</span>
                    <span className="wk-item-title">{s.title}</span>
                  </button>
                ))
              )}
            </div>
            <div className="wk-content">
              {current ? (
                <>
                  <div className="wk-content-head">
                    <span className="wk-content-num">{current.number}</span>
                    <span className="wk-content-title">{current.title}</span>
                  </div>
                  <pre className="wk-pre">{current.body}</pre>
                </>
              ) : (
                <div className="wk-empty">Select a section to read it.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
