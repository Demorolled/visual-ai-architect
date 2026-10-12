/**
 * PlanLibraryDialog — reopen a saved Big Plan Mode design.
 *
 * Plans live on disk as data/plans/<name>/ (graph.json + plan.md) and are
 * written by the 5-minute autosave. Without this dialog that folder was
 * write-only in practice: the design was safe but there was no way back to it,
 * so closing the tab meant losing the canvas even though the files were there.
 *
 * Opening a plan loads graph.json back onto the canvas and re-enters Big Plan
 * Mode so the user can keep designing. Nothing is rebuilt or generated.
 */

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useProjectStore } from '../store/projectStore';
import './PlanLibraryDialog.css';

interface PlanGraphListing {
  projectName: string;
  dirName: string;
  goal: string;
  nodeCount: number;
  edgeCount: number;
  updatedAt: string;
}

interface PlanLibraryDialogProps {
  onClose: () => void;
}

function when(iso: string): string {
  if (!iso) return 'unknown time';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown time';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function PlanLibraryDialog({ onClose }: PlanLibraryDialogProps) {
  const loadPlanDesign = useProjectStore((s) => s.loadPlanDesign);
  const currentName = useProjectStore((s) => s.projectName);

  const [plans, setPlans] = useState<PlanGraphListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.listPlanGraphs();
      setPlans(res.data?.graphs || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Could not read saved plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleOpen = useCallback(
    async (plan: PlanGraphListing) => {
      setBusy(plan.dirName);
      setError('');
      try {
        const res = await api.getPlanGraph(plan.dirName);
        const data = res.data;
        if (!data?.success || !Array.isArray(data.nodes)) {
          throw new Error('That plan folder has no readable graph.json');
        }
        if (data.nodes.length === 0) {
          throw new Error('That plan has no nodes saved yet');
        }
        loadPlanDesign({
          projectName: data.projectName || plan.projectName,
          goal: data.goal || plan.goal || '',
          nodes: data.nodes,
          edges: Array.isArray(data.edges) ? data.edges : [],
        });
        onClose();
      } catch (err: any) {
        setError(err?.response?.data?.error || err?.message || 'Could not open that plan');
      } finally {
        setBusy('');
      }
    },
    [loadPlanDesign, onClose],
  );

  return (
    <div className="merge-overlay" onClick={onClose}>
      <div className="merge-dialog plan-library-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="merge-header">
          <div className="merge-header-left">
            <span className="merge-mode-badge connect-badge">📂 PLANS</span>
            <h2 className="merge-title">Open a saved plan</h2>
          </div>
          <button className="merge-close-btn" onClick={onClose} title="Close">✕</button>
        </div>
        <div className="merge-subtitle">
          Big Plan Mode designs autosaved to <code>data/plans/</code>. Opening one puts the nodes and
          wiring back on the canvas so you can keep designing — nothing is rebuilt.
        </div>

        <div className="merge-body">
          {loading && <div className="merge-empty">Reading data/plans…</div>}

          {!loading && plans.length === 0 && !error && (
            <div className="merge-empty">
              No saved designs yet. Big Plan Mode writes one the moment you place the master node —
              then every 5 minutes after that.
            </div>
          )}

          {!loading && plans.length > 0 && (
            <div className="plan-library-list">
              {plans.map((p) => {
                const isCurrent = p.projectName === currentName;
                return (
                  <div key={p.dirName} className={`plan-library-item${isCurrent ? ' current' : ''}`}>
                    <div className="plan-library-main">
                      <div className="plan-library-name">
                        {p.projectName}
                        {isCurrent && <span className="plan-library-flag">on canvas</span>}
                      </div>
                      <div className="plan-library-goal">{p.goal || '(no statement of intent yet)'}</div>
                      <div className="plan-library-meta">
                        {p.nodeCount} node{p.nodeCount === 1 ? '' : 's'} · {p.edgeCount} edge
                        {p.edgeCount === 1 ? '' : 's'} · {when(p.updatedAt)} · <code>data/plans/{p.dirName}/</code>
                      </div>
                    </div>
                    <button
                      className="merge-btn merge-btn-primary plan-library-open"
                      onClick={() => handleOpen(p)}
                      disabled={Boolean(busy)}
                      title="Load this design back onto the canvas"
                    >
                      {busy === p.dirName ? 'Opening…' : 'Open'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {error && <div className="merge-error">❌ {error}</div>}
        </div>

        <div className="merge-footer">
          <span className="merge-footer-hint">
            Loading a plan replaces the current design on the canvas (undo still works).
          </span>
          <div className="merge-footer-actions">
            <button className="merge-btn merge-btn-secondary" onClick={refresh} disabled={loading}>
              ↻ Refresh
            </button>
            <button className="merge-btn merge-btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
