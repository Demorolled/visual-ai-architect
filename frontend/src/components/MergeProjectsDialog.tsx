/**
 * MergeProjectsDialog — merge two VACA projects into one.
 *
 * Project A = the current canvas. The user picks Project B from their saved
 * projects; the backend resolves id/label collisions, remaps edges, drops
 * dangling edges and B's master node, and returns a report. The merged graph
 * is then applied to the canvas (keeping the current master node).
 */

import { useCallback, useEffect, useState } from 'react';
import { useProjectStore, SavedProject } from '../store/projectStore';
import { api } from '../api/client';
import ConnectNodesDialog from './ConnectNodesDialog';
import './MergeProjectsDialog.css';

interface MergeProjectsDialogProps {
  onClose: () => void;
}

interface MergeReport {
  renamedNodes: Array<{ oldId: string; newId: string; label: string }>;
  labelRenames: Array<{ label: string; newLabel: string }>;
  droppedEdges: Array<{ id: string; source: string; target: string; reason: string }>;
  droppedMasters: string[];
  warnings: string[];
  aNodeCount: number;
  bNodeCount: number;
  totalNodes: number;
  totalEdges: number;
}

export default function MergeProjectsDialog({ onClose }: MergeProjectsDialogProps) {
  const { nodes, edges, projectName, targetOS, replaceNodes } = useProjectStore();
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [merging, setMerging] = useState(false);
  const [report, setReport] = useState<MergeReport | null>(null);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState(false);
  // ── Connect & Describe step ──
  const [connectOpen, setConnectOpen] = useState(false);
  /** Merged canvas ids of the nodes that came from project B (connect sources). */
  const [bMergedIds, setBMergedIds] = useState<string[]>([]);

  const codeNodes = nodes.filter(n => n.type !== 'master');
  const masterId = nodes.find(n => n.type === 'master')?.id;

  useEffect(() => {
    setProjects(useProjectStore.getState().loadProjects());
  }, []);

  const currentProjectId = useProjectStore(s => s.projectId);
  const available = projects.filter(p => p.id !== currentProjectId);

  const selected = available.find(p => p.id === selectedId) || null;

  const handleMerge = useCallback(async () => {
    if (!selected) return;
    setMerging(true);
    setError('');
    setReport(null);
    setApplied(false);
    try {
      const res = await api.mergeProjects({
        projectA: { name: projectName || 'Current Project', nodes, edges },
        projectB: { name: selected.name, nodes: selected.nodes, edges: selected.edges },
        offsetB: true,
      });
      const data = res.data;
      if (!data.success) throw new Error(data.error || 'Merge failed');
      setReport(data.summary);
      // Apply the merged graph to the canvas, keeping the current master node.
      replaceNodes(data.nodes, data.edges, targetOS, masterId);
      setApplied(true);
      // Track which merged node ids came from project B (via the rename map)
      // so the Connect & Describe step can offer them as connection sources.
      const renameMap = new Map<string, string>(
        ((data.summary?.renamedNodes || []) as Array<{ oldId: string; newId: string }>)
          .map(r => [r.oldId, r.newId] as [string, string])
      );
      const mergedBIds: string[] = (selected?.nodes || [])
        .filter(n => n.type !== 'master')
        .map(n => renameMap.get(n.id) ?? n.id);
      setBMergedIds(mergedBIds);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Merge failed');
    } finally {
      setMerging(false);
    }
  }, [selected, projectName, nodes, edges, targetOS, replaceNodes, masterId]);

  const handleClose = useCallback(() => {
    if (merging) return;
    onClose();
  }, [merging, onClose]);

  return (
    <div className="merge-overlay" onClick={handleClose}>
      <div className="merge-dialog" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="merge-header">
          <div className="merge-header-left">
            <span className="merge-mode-badge">🔀 MERGE</span>
            <h2 className="merge-title">Merge Two Apps</h2>
          </div>
          <button className="merge-close-btn" onClick={handleClose} title="Close">✕</button>
        </div>
        <div className="merge-subtitle">
          Merge a saved project into the current canvas. Collisions are resolved automatically and reported below.
        </div>

        {/* Body */}
        <div className="merge-body">
          {/* Project A (current) */}
          <div className="merge-pair">
            <div className="merge-side">
              <div className="merge-side-label">Project A — current canvas</div>
              <div className="merge-side-name">📁 {projectName || 'Untitled'}</div>
              <div className="merge-side-stats">
                {codeNodes.length} nodes · {edges.length} edges · {targetOS}
              </div>
            </div>
            <div className="merge-plus">＋</div>
            {/* Project B picker */}
            <div className="merge-side">
              <div className="merge-side-label">Project B — pick a saved project</div>
              <select
                className="merge-select"
                value={selectedId}
                onChange={e => { setSelectedId(e.target.value); setReport(null); setApplied(false); setConnectOpen(false); setBMergedIds([]); }}
              >
                <option value="">— choose a project —</option>
                {available.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.nodes.filter(n => n.type !== 'master').length} nodes)
                  </option>
                ))}
              </select>
              {selected && (
                <div className="merge-side-stats">
                  {selected.nodes.filter(n => n.type !== 'master').length} nodes · {selected.edges.length} edges · {selected.targetOS}
                </div>
              )}
            </div>
          </div>

          {available.length === 0 && (
            <div className="merge-empty">
              No other saved projects to merge with. Save another project first.
            </div>
          )}

          {/* Collision report */}
          {report && (
            <div className="merge-report">
              <div className="merge-report-title">🔀 Merge Complete</div>
              <div className="merge-report-summary">
                <span className="merge-stat">📦 {report.totalNodes} nodes</span>
                <span className="merge-stat">🔗 {report.totalEdges} edges</span>
                <span className="merge-stat">ℹ️ {report.aNodeCount} + {report.bNodeCount}</span>
              </div>

              {report.renamedNodes.length > 0 && (
                <div className="merge-report-section">
                  <div className="merge-report-heading">🆔 Node id collisions resolved ({report.renamedNodes.length})</div>
                  {report.renamedNodes.map(r => (
                    <div key={r.oldId} className="merge-report-row">
                      <code>{r.oldId}</code> → <code>{r.newId}</code> <span className="merge-dim">({r.label})</span>
                    </div>
                  ))}
                </div>
              )}

              {report.labelRenames.length > 0 && (
                <div className="merge-report-section">
                  <div className="merge-report-heading">🏷️ Label conflicts renamed ({report.labelRenames.length})</div>
                  {report.labelRenames.map(l => (
                    <div key={l.label} className="merge-report-row">
                      "{l.label}" → "{l.newLabel}"
                    </div>
                  ))}
                </div>
              )}

              {report.droppedEdges.length > 0 && (
                <div className="merge-report-section">
                  <div className="merge-report-heading merge-warn">⚠️ Dangling edges dropped ({report.droppedEdges.length})</div>
                  {report.droppedEdges.slice(0, 5).map(d => (
                    <div key={d.id} className="merge-report-row merge-warn">
                      <code>{d.source} → {d.target}</code> <span className="merge-dim">({d.reason})</span>
                    </div>
                  ))}
                  {report.droppedEdges.length > 5 && (
                    <div className="merge-dim">…and {report.droppedEdges.length - 5} more</div>
                  )}
                </div>
              )}

              {report.droppedMasters.length > 0 && (
                <div className="merge-report-section merge-warn">
                  <div className="merge-report-heading">🎯 {report.droppedMasters.length} master node(s) from Project B excluded</div>
                </div>
              )}

              {report.warnings.filter(w => !w.includes('edge(s)') && !w.includes('label conflict(s)') && !w.includes('master node')).length > 0 && (
                <div className="merge-report-section">
                  {report.warnings.map((w, i) => (
                    <div key={i} className="merge-report-row merge-warn">{w}</div>
                  ))}
                </div>
              )}

              {applied && (
                <>
                  <div className="merge-applied">
                    ✅ Merged graph applied to the canvas — the master node was kept. Click <strong>Save</strong> to keep it.
                  </div>
                  {bMergedIds.length > 0 && (
                    <div className="connect-cta-row">
                      <button
                        className="merge-btn merge-btn-primary"
                        onClick={() => setConnectOpen(true)}
                        title="Pick a node from the dropped app, point it into a node of this app, and describe how they should connect — the app turns that into real code wiring"
                      >
                        🔗 Connect &amp; Describe
                      </button>
                      <span className="merge-footer-hint">
                        Wire the dropped app into this one before generating code.
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {error && <div className="merge-error">❌ {error}</div>}
        </div>

        {/* Footer */}
        <div className="merge-footer">
          <span className="merge-footer-hint">
            Project A keeps its ids; Project B collisions get a deterministic prefix.
          </span>
          <div className="merge-footer-actions">
            <button className="merge-btn merge-btn-secondary" onClick={handleClose}>Close</button>
            <button
              className="merge-btn merge-btn-primary"
              onClick={handleMerge}
              disabled={!selected || merging || applied}
              title={applied ? 'Merged — pick a different project B to merge again' : 'Merge project B into the current canvas'}
            >
              {merging ? '⏳ Merging...' : applied ? '✅ Merged' : '🔀 Merge'}
            </button>
          </div>
        </div>
      </div>
      {connectOpen && (
        <ConnectNodesDialog onClose={() => setConnectOpen(false)} bNodeIds={bMergedIds} />
      )}
    </div>
  );
}
