/**
 * TodoPanel — the deep-scan todo list (TODO fixes.txt) inside the floating
 * preview window. Shown when the user asks to open the todo list (auto-detected
 * in the chat, or via the 📋 button on AI messages).
 *
 * Summary chips up top (open / done / P0), then the scan's meta block, then
 * the 8 sections as checkbox lists — done items struck through, priorities
 * badged, all filterable by search.
 */

import { useCallback, useEffect, useState } from 'react';
import './TodoPanel.css';

interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}

interface TodoSection {
  number: number;
  title: string;
  priority: string | null;
  items: TodoItem[];
}

interface TodoSummary {
  total: number;
  open: number;
  done: number;
  byPriority: Record<string, { open: number; total: number }>;
}

interface TodoResponse {
  success: boolean;
  sections: TodoSection[];
  summary: TodoSummary;
  meta: string[];
  lastUpdated: string | null;
}

export default function TodoPanel() {
  const [data, setData] = useState<TodoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [showMeta, setShowMeta] = useState(false);

  const fetchTodo = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/todo', { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed: TodoResponse = await res.json();
      if (!parsed.success || !Array.isArray(parsed.sections)) throw new Error('Bad todo payload');
      setData(parsed);
    } catch (err: any) {
      setError(err?.message || 'Failed to load the todo list');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTodo();
  }, [fetchTodo]);

  const q = query.trim().toLowerCase();
  const sections = data?.sections || [];
  const filtered = q
    ? sections
        .map((s) => ({
          ...s,
          items: s.items.filter(
            (it) =>
              it.text.toLowerCase().includes(q) ||
              it.id.toLowerCase().includes(q) ||
              s.title.toLowerCase().includes(q)
          ),
        }))
        .filter((s) => s.items.length > 0)
    : sections;

  const summary = data?.summary;
  const openP0 = summary?.byPriority.P0?.open ?? 0;
  const openP01 = summary?.byPriority['P0/P1']?.open ?? 0;
  const p0Total = (summary?.byPriority.P0?.total ?? 0) + (summary?.byPriority['P0/P1']?.total ?? 0);
  const p0Open = openP0 + openP01;

  return (
    <div className="td-wrap">
      <div className="td-head">
        <div className="td-title">
          📋 VACA Todo List <span className="td-count">{summary ? `${summary.open} open / ${summary.total}` : ''}</span>
        </div>
        <button className="td-refresh" onClick={fetchTodo} disabled={loading} title="Refresh the todo list">🔄</button>
      </div>

      {loading && (
        <div className="td-state">
          <div className="td-spinner" />
          <div>Reading TODO fixes.txt…</div>
        </div>
      )}

      {!loading && error && (
        <div className="td-state">
          <div className="td-error-title">❌ Could not load the todo list</div>
          <div className="td-error-detail">{error}</div>
          <button className="td-retry" onClick={fetchTodo}>Retry</button>
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div className="td-chips">
            <div className="td-chip td-chip-open">
              <span className="td-chip-num">{summary?.open ?? 0}</span> open
            </div>
            <div className="td-chip td-chip-done">
              <span className="td-chip-num">{summary?.done ?? 0}</span> done
            </div>
            <div className="td-chip td-chip-p0" title={`${p0Total} P0 items total`}>
              <span className="td-chip-num">{p0Open}</span> P0 open
            </div>
          </div>

          {Array.isArray(data.meta) && data.meta.length > 0 && (
            <button className="td-meta-toggle" onClick={() => setShowMeta((v) => !v)}>
              {showMeta ? '▾' : '▸'} scan summary
            </button>
          )}
          {showMeta && Array.isArray(data.meta) && (
            <pre className="td-meta">{data.meta.join('\n')}</pre>
          )}

          <div className="td-search">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="🔍 Search items…"
              className="td-search-input"
            />
          </div>

          <div className="td-body">
            {filtered.length === 0 ? (
              <div className="td-empty">No items match “{query}”.</div>
            ) : (
              filtered.map((s) => (
                <div key={s.number} className="td-section">
                  <div className="td-section-head">
                    <span className="td-section-num">{s.number}</span>
                    <span className="td-section-title">{s.title}</span>
                    {s.priority && <span className={`td-prio td-prio-${s.priority.replace('/', '')}`}>{s.priority}</span>}
                    <span className="td-section-count">
                      {s.items.filter((i) => !i.done).length}/{s.items.length}
                    </span>
                  </div>
                  <div className="td-items">
                    {s.items.map((it) => (
                      <div key={it.id} className={`td-item ${it.done ? 'done' : ''}`}>
                        <span className={`td-item-box ${it.done ? 'checked' : ''}`}>
                          {it.done ? '☑' : '☐'}
                        </span>
                        <span className="td-item-id">{it.id}</span>
                        <span className="td-item-text">{it.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
