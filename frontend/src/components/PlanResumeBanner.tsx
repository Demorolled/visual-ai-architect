/**
 * PlanResumeBanner — "you already started this" for an empty canvas.
 *
 * Big Plan Mode autosaves every 5 minutes, so after a refresh, a crash, or just
 * closing the tab, the design is still on disk in data/plans/ — but the canvas
 * comes back blank, which reads as "it's gone". The picker (📂 Open plan)
 * covers reopening deliberately; this covers the case where the user forgot
 * they had a design at all, by offering the most recent one unprompted.
 *
 * Deliberately narrow: only on an empty canvas, only once per session (Dismiss
 * is remembered), and only the single most recent plan. Anything more would be
 * a nag.
 */

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useProjectStore } from '../store/projectStore';
import './PlanResumeBanner.css';

interface PlanGraphListing {
  projectName: string;
  dirName: string;
  goal: string;
  nodeCount: number;
  edgeCount: number;
  updatedAt: string;
}

function when(iso: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `on ${new Date(iso).toLocaleDateString()}`;
}

export default function PlanResumeBanner() {
  const designNodeCount = useProjectStore(
    (s) => s.nodes.filter((n) => n.type !== 'master').length,
  );
  const loadPlanDesign = useProjectStore((s) => s.loadPlanDesign);

  const [latest, setLatest] = useState<PlanGraphListing | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Fetch once on mount: the offer is about what was saved BEFORE this session,
  // so re-querying as the user works would be pointless work.
  useEffect(() => {
    let cancelled = false;
    api
      .listPlanGraphs()
      .then((res) => {
        if (cancelled) return;
        const graphs: PlanGraphListing[] = res.data?.graphs || [];
        // Newest first from the API; require an actual design to resume.
        const candidate = graphs.find((g) => g.nodeCount > 0) || null;
        setLatest(candidate);
      })
      .catch(() => {
        // Nothing to offer is not an error worth showing.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const reopen = useCallback(async () => {
    if (!latest) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.getPlanGraph(latest.dirName);
      const data = res.data;
      if (!data?.success || !Array.isArray(data.nodes) || data.nodes.length === 0) {
        throw new Error('That plan has no nodes saved');
      }
      loadPlanDesign({
        projectName: data.projectName || latest.projectName,
        goal: data.goal || latest.goal || '',
        nodes: data.nodes,
        edges: Array.isArray(data.edges) ? data.edges : [],
      });
      // Loading fills the canvas, so the banner's own condition hides it.
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Could not reopen that plan');
    } finally {
      setBusy(false);
    }
  }, [latest, loadPlanDesign]);

  if (!latest || dismissed || designNodeCount > 0) return null;

  return (
    <div className="plan-resume">
      <span className="plan-resume-icon">📂</span>
      <div className="plan-resume-body">
        <div className="plan-resume-title">
          You have a saved plan: <strong>{latest.projectName}</strong>
        </div>
        <div className="plan-resume-meta">
          {latest.nodeCount} node{latest.nodeCount === 1 ? '' : 's'} · {latest.edgeCount} edge
          {latest.edgeCount === 1 ? '' : 's'}
          {when(latest.updatedAt) ? ` · saved ${when(latest.updatedAt)}` : ''}
        </div>
        {error && <div className="plan-resume-error">{error}</div>}
      </div>
      <button className="plan-resume-btn" onClick={reopen} disabled={busy}>
        {busy ? 'Reopening…' : 'Reopen'}
      </button>
      <button
        className="plan-resume-dismiss"
        onClick={() => setDismissed(true)}
        title="Start from an empty canvas instead"
      >
        ✕
      </button>
    </div>
  );
}
