/**
 * ConnectNodesDialog — "Connect & Describe".
 *
 * Two modes, one mechanism:
 *   • `mode="merge"` (default) — after a structural merge dumps Project B
 *     beside Project A, source comes from B and target from A.
 *   • `mode="plan"` — Big Plan Mode's manual wiring link: ANY node can be the
 *     source or the target, because the user is describing their own
 *     architecture rather than plugging one app into another.
 *
 * Either way the user:
 *   1. PICKS a source node
 *   2. PICKS a target node
 *   3. DESCRIBES how they want it to connect in plain language
 *   4. Gets that description interpreted into a SEMANTIC edge
 *      (label / relation / codeHint) — POST /api/merge/connect
 *   5. Applies the edge to the canvas — it becomes a real dependency in codegen
 *      (edge source → target = target depends on source) AND the interpreted
 *      wiring is injected into the generation prompts of both files.
 */

import { useCallback, useMemo, useState } from 'react';
import { useProjectStore } from '../store/projectStore';
import { api } from '../api/client';
import './ConnectNodesDialog.css';

interface ConnectNodesDialogProps {
  onClose: () => void;
  /** Merged ids of the nodes that came from the dropped project B. */
  bNodeIds?: string[];
  /** `plan` un-restricts the pickers (Big Plan Mode manual wiring). */
  mode?: 'merge' | 'plan';
}

interface InterpretedEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  data: {
    label: string;
    relation: string;
    codeHint: string;
    sourceHint: string;
    targetHint: string;
    description: string;
    semantic: boolean;
  };
}

const EXAMPLES = [
  'Widget Loader feeds parsed widgets into Core Engine',
  'Session Auth validates the token before the API handler runs',
  'Data Store loads the saved profile that the Settings UI displays',
];

export default function ConnectNodesDialog({ onClose, bNodeIds = [], mode = 'merge' }: ConnectNodesDialogProps) {
  const { nodes, edges, projectName, targetOS, addEdge, removeEdge } = useProjectStore();
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [description, setDescription] = useState('');
  const [interpreting, setInterpreting] = useState(false);
  const [result, setResult] = useState<InterpretedEdge | null>(null);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState('');
  const [exampleIdx, setExampleIdx] = useState(0);

  const isPlan = mode === 'plan';
  // `master-node` is the app's own blueprint node (not part of the user's
  // design), but a plan's master node is a normal node with a real type, so in
  // plan mode it stays selectable like any other.
  const codeNodes = useMemo(() => nodes.filter(n => n.type !== 'master'), [nodes]);
  const sourceNodes = useMemo(
    () => (isPlan ? codeNodes : codeNodes.filter(n => bNodeIds.includes(n.id))),
    [codeNodes, bNodeIds, isPlan]
  );
  const targetNodes = useMemo(
    () => (isPlan ? codeNodes : codeNodes.filter(n => !bNodeIds.includes(n.id))),
    [codeNodes, bNodeIds, isPlan]
  );

  const nodeLabel = useCallback((id: string) => codeNodes.find(n => n.id === id)?.data?.label || id, [codeNodes]);

  const alreadyConnected = useMemo(
    () => edges.some(e => e.source === sourceId && e.target === targetId),
    [edges, sourceId, targetId]
  );

  const canInterpret = Boolean(
    sourceId && targetId && sourceId !== targetId && !alreadyConnected && description.trim().length > 0
  );

  const handleInterpret = useCallback(async () => {
    if (!canInterpret) return;
    setInterpreting(true);
    setError('');
    setResult(null);
    setApplied(false);
    try {
      const res = await api.connectNodes({
        nodes,
        edges,
        sourceNodeId: sourceId,
        targetNodeId: targetId,
        description: description.trim(),
        projectName,
        targetOS,
      });
      const data = res.data;
      if (!data.success) throw new Error(data.error || 'Interpretation failed');
      setResult(data.edge);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Could not interpret the connection');
    } finally {
      setInterpreting(false);
    }
  }, [canInterpret, nodes, sourceId, targetId, description, projectName, targetOS]);

  const handleApply = useCallback(() => {
    if (!result) return;
    // Dedupe (race-safe): if an edge between the same pair appeared since the
    // interpret step (e.g. a second dialog), replace it instead of stacking a
    // duplicate — a duplicate would double the import in codegen.
    const existing = useProjectStore.getState().edges.find(
      e => e.source === result.source && e.target === result.target
    );
    if (existing) removeEdge(existing.id);
    addEdge(result);
    setApplied(true);
  }, [result, addEdge, removeEdge]);

  const reset = useCallback(() => {
    setSourceId('');
    setTargetId('');
    setDescription('');
    setResult(null);
    setApplied(false);
    setError('');
  }, []);

  const handleClose = useCallback(() => {
    if (interpreting) return;
    onClose();
  }, [interpreting, onClose]);

  const source = result ? nodeLabel(result.source) : '';
  const target = result ? nodeLabel(result.target) : '';

  return (
    <div className="merge-overlay" onClick={handleClose}>
      <div className="merge-dialog connect-dialog" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="merge-header">
          <div className="merge-header-left">
            <span className="merge-mode-badge connect-badge">🔗 CONNECT</span>
            <h2 className="merge-title">Connect &amp; Describe</h2>
          </div>
          <button className="merge-close-btn" onClick={handleClose} title="Close">✕</button>
        </div>
        <div className="merge-subtitle">
          {isPlan
            ? 'Wire two nodes in your plan: pick what runs first, pick what depends on it, then describe the relationship in your own words. Nothing is built — this records the wiring in the plan.'
            : 'Wire the dropped app into the existing one: pick where to plug in, then describe how the two should connect. The app interprets it into a real code-level wiring.'}
        </div>

        {/* Body */}
        <div className="merge-body">
          {/* Source → Target pickers */}
          <div className="connect-pair">
            <div className="connect-side">
              <div className="connect-side-label">{isPlan ? '⬅ From (runs first)' : '⬅ From (dropped app B)'}</div>
              <select
                className="merge-select"
                value={sourceId}
                onChange={e => { setSourceId(e.target.value); setResult(null); setApplied(false); }}
              >
                <option value="">— pick a node —</option>
                {sourceNodes.map(n => (
                  <option key={n.id} value={n.id}>
                    {n.data?.label || n.id} ({n.type})
                  </option>
                ))}
              </select>
            </div>
            <div className="connect-arrow">➜</div>
            <div className="connect-side">
              <div className="connect-side-label">{isPlan ? '➡ Into (depends on it)' : '➡ Into (existing app A)'}</div>
              <select
                className="merge-select"
                value={targetId}
                onChange={e => { setTargetId(e.target.value); setResult(null); setApplied(false); }}
              >
                <option value="">— pick a node —</option>
                {targetNodes.map(n => (
                  <option key={n.id} value={n.id}>
                    {n.data?.label || n.id} ({n.type})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div className="connect-desc">
            <div className="connect-side-label">💬 Describe how you want it to connect</div>
            <textarea
              className="connect-textarea"
              value={description}
              onChange={e => { setDescription(e.target.value); setResult(null); setApplied(false); }}
              placeholder='e.g. "Widget Loader feeds parsed widgets into Core Engine"'
              rows={3}
              maxLength={400}
            />
            <div className="connect-examples">
              <span className="connect-side-label">Try:</span>
              <button
                className="connect-example-chip"
                onClick={() => { setDescription(EXAMPLES[exampleIdx]); setExampleIdx((exampleIdx + 1) % EXAMPLES.length); setResult(null); setApplied(false); }}
                title="Click to load an example description"
              >
                💡 {EXAMPLES[exampleIdx]}
              </button>
            </div>
          </div>

          {sourceId === targetId && sourceId && (
            <div className="merge-empty">Source and target must be different nodes.</div>
          )}
          {alreadyConnected && (
            <div className="merge-empty">These two nodes are already connected — pick a different pair or remove the existing edge first.</div>
          )}

          {/* Interpreted result */}
          {result && !applied && (
            <div className="connect-result">
              <div className="connect-result-title">🧠 Interpreted connection</div>
              <div className="connect-result-wire">
                <code>{source}</code>
                <span className="connect-wire-arrow">──▶</span>
                <code>{target}</code>
              </div>
              <div className="connect-result-chip">{result.label}</div>
              {result.data.relation && (
                <div className="connect-result-row">
                  <span className="connect-row-key">relation</span>
                  <span className="connect-row-val">{result.data.relation}</span>
                </div>
              )}
              {result.data.sourceHint && (
                <div className="connect-result-row">
                  <span className="connect-row-key">export</span>
                  <span className="connect-row-val"><strong>{source}</strong>: {result.data.sourceHint}</span>
                </div>
              )}
              {result.data.targetHint && (
                <div className="connect-result-row">
                  <span className="connect-row-key">consume</span>
                  <span className="connect-row-val"><strong>{target}</strong>: {result.data.targetHint}</span>
                </div>
              )}
              <div className="connect-result-note">
                Applying this adds a real edge — <em>{target}</em> depends on <em>{source}</em> — and saves that wiring into your plan.{!isPlan && ' It also feeds the wiring into code generation for both files.'}
              </div>
            </div>
          )}

          {applied && (
            <div className="merge-applied">
              {isPlan ? (
                <>✅ Wiring recorded — <strong>{source} → {target}</strong> ("{result?.label}"). Your plan is autosaved every 5 minutes; nothing is generated while you plan.</>
              ) : (
                <>✅ Semantic connection applied to the canvas — <strong>{source} → {target}</strong> ("{result?.label}"). Click <strong>Save</strong> to keep it, then <strong>Generate</strong> to build the merged app.</>
              )}
            </div>
          )}

          {error && <div className="merge-error">❌ {error}</div>}
        </div>

        {/* Footer */}
        <div className="merge-footer">
          <span className="merge-footer-hint">
            {isPlan
              ? <>Edge direction: <em>target depends on source</em> — {codeNodes.length} node{codeNodes.length === 1 ? '' : 's'} in this plan.</>
              : <>Edge direction: <em>target depends on source</em> — {sourceNodes.length} nodes from B, {targetNodes.length} from A.</>}
          </span>
          <div className="merge-footer-actions">
            {applied ? (
              <>
                <button className="merge-btn merge-btn-secondary" onClick={reset}>＋ Connect another</button>
                <button className="merge-btn merge-btn-primary" onClick={handleClose}>Done</button>
              </>
            ) : result ? (
              <>
                <button className="merge-btn merge-btn-secondary" onClick={reset}>↩ Start over</button>
                <button className="merge-btn merge-btn-primary" onClick={handleApply}>🔗 Apply connection</button>
              </>
            ) : (
              <>
                <button className="merge-btn merge-btn-secondary" onClick={handleClose}>Close</button>
                <button
                  className="merge-btn merge-btn-primary"
                  onClick={handleInterpret}
                  disabled={!canInterpret || interpreting}
                  title={description.trim() ? 'Interpret this description into a connection' : 'Describe the connection first'}
                >
                  {interpreting ? '⏳ Interpreting...' : '✨ Interpret connection'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
