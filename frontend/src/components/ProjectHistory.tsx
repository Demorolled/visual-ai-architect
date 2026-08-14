import { useState, useEffect, useCallback } from 'react';
import './ProjectHistory.css';

interface NodeBuildStatus {
  nodeId: string;
  label: string;
  type: string;
  status: 'pending' | 'generating' | 'valid' | 'error';
  description: string;
  pendingFiles: string[];
  completedFiles: string[];
}

interface BuildRecord {
  projectName: string;
  targetOS: string;
  nodeCount: number;
  edgeCount: number;
  filesCreated: string[];
  exportPath: string | null;
  nodeStatuses: NodeBuildStatus[];
  completedNodeCount: number;
  totalNodeCount: number;
  progress: number;
  pendingFiles: string[];
  completedFiles: string[];
  timestamp: string;
}

interface BuildsResponse {
  success: boolean;
  lastBuild: BuildRecord | null;
  buildHistory: BuildRecord[];
  totalBuilds: number;
}

const TYPE_COLORS: Record<string, string> = {
  input: '#10b981',
  output: '#ef4444',
  logic: '#3b82f6',
  api: '#7c3aed',
  database: '#f59e0b',
  ui: '#db2777',
  master: '#64748b',
  'ui-functions': '#0284c7',
};

function formatDate(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

function timeAgo(ts: string): string {
  try {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return '';
  }
}

const OS_ICONS: Record<string, string> = {
  linux: '🐧',
  windows: '🪟',
  mac: '🍎',
  ios: '📱',
  android: '🤖',
};

export default function ProjectHistory() {
  const [builds, setBuilds] = useState<BuildsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);

  const fetchBuilds = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/session/builds', { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: BuildsResponse = await res.json();
      setBuilds(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load build history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBuilds();
  }, [fetchBuilds]);

  const handleClear = useCallback(async () => {
    if (!confirm('Clear all build history? This cannot be undone.')) return;
    setClearing(true);
    try {
      await fetch('/api/session/builds', { method: 'DELETE' });
      setBuilds(null);
    } catch {
      // ignore
    }
    setClearing(false);
  }, []);

  const toggleExpand = useCallback((idx: number) => {
    setExpandedIndex(prev => prev === idx ? null : idx);
  }, []);

  const handleOpenExportPath = useCallback((path: string) => {
    // Try to open the directory — for now, show it in a message
    // In a desktop app, this could use the system file manager
    const msg = `Project files located at:\n${path}`;
    alert(msg);
  }, []);

  const history = builds?.buildHistory || [];

  return (
    <div className="project-history">
      <div className="ph-header">
        <div className="ph-header-left">
          <span className="ph-title">📋 Build History</span>
          {builds && (
            <span className="ph-count">{builds.totalBuilds} build{builds.totalBuilds !== 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="ph-header-right">
          <button className="ph-refresh-btn" onClick={fetchBuilds} disabled={loading} title="Refresh">
            🔄
          </button>
          {history.length > 0 && (
            <button className="ph-clear-btn" onClick={handleClear} disabled={clearing} title="Clear history">
              🗑️
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="ph-loading">
          <div className="ph-spinner" />
          <span>Loading build history...</span>
        </div>
      )}

      {error && (
        <div className="ph-error">
          <span>⚠️ {error}</span>
          <button className="ph-retry-btn" onClick={fetchBuilds}>Retry</button>
        </div>
      )}

      {!loading && !error && history.length === 0 && (
        <div className="ph-empty">
          <span className="ph-empty-icon">📭</span>
          <span>No builds yet. Generate an app and it will appear here.</span>
        </div>
      )}

      {!loading && !error && history.length > 0 && (
        <div className="ph-list">
          {history.map((build, idx) => (
            <div
              key={build.timestamp + idx}
              className={`ph-build-card ${expandedIndex === idx ? 'expanded' : ''}`}
            >
              <div className="ph-build-header" onClick={() => toggleExpand(idx)}>
                <div className="ph-build-info">
                  <span className="ph-build-name">
                    {OS_ICONS[build.targetOS] || '📦'} {build.projectName}
                  </span>
                  <span className="ph-build-date">{timeAgo(build.timestamp)}</span>
                </div>
                <div className="ph-build-meta">
                  <span className="ph-build-nodes">{build.totalNodeCount} nodes</span>
                  <div className="ph-progress-bar">
                    <div
                      className="ph-progress-fill"
                      style={{ width: `${build.progress}%` }}
                    />
                  </div>
                  <span className={`ph-progress-text ${build.progress >= 100 ? 'done' : ''}`}>
                    {build.progress}%
                  </span>
                </div>
                <span className="ph-expand-icon">{expandedIndex === idx ? '▼' : '▶'}</span>
              </div>

              {expandedIndex === idx && (
                <div className="ph-build-detail">
                  {/* Location Section */}
                  <div className="ph-detail-section">
                    <span className="ph-detail-label">📍 Location</span>
                    {build.exportPath ? (
                      <div className="ph-location-row">
                        <code className="ph-location-path">{build.exportPath}</code>
                        <button
                          className="ph-open-btn"
                          onClick={() => handleOpenExportPath(build.exportPath!)}
                          title="Show path"
                        >
                          📂
                        </button>
                      </div>
                    ) : (
                      <span className="ph-missing">Not exported to disk</span>
                    )}
                  </div>

                  {/* Progress Section */}
                  <div className="ph-detail-section">
                    <span className="ph-detail-label">📊 Progress</span>
                    <div className="ph-progress-detail">
                      <div className="ph-progress-row">
                        <span>Generated code</span>
                        <span className="ph-progress-value">
                          {build.completedNodeCount}/{build.totalNodeCount} nodes
                        </span>
                      </div>
                      <div className="ph-progress-row">
                        <span>Completion</span>
                        <span className={`ph-progress-value ${build.progress >= 100 ? 'done' : ''}`}>
                          {build.progress}%
                        </span>
                      </div>
                      <div className="ph-progress-row">
                        <span>Files created</span>
                        <span className="ph-progress-value">{build.filesCreated.length}</span>
                      </div>
                    </div>

                    {/* Large progress bar */}
                    <div className="ph-progress-bar-large">
                      <div
                        className="ph-progress-fill-large"
                        style={{ width: `${build.progress}%` }}
                      />
                      <span className="ph-progress-overlay">{build.progress}%</span>
                    </div>
                  </div>

                  {/* Per-Node Status Section */}
                  <div className="ph-detail-section">
                    <span className="ph-detail-label">
                      🧩 Nodes ({build.nodeStatuses?.length || 0})
                    </span>
                    <div className="ph-nodes-list">
                      {(build.nodeStatuses || []).map((ns) => (
                        <div key={ns.nodeId} className={`ph-node-row status-${ns.status}`}>
                          <span
                            className="ph-node-type-dot"
                            style={{ background: TYPE_COLORS[ns.type] || '#64748b' }}
                          />
                          <span className="ph-node-label">{ns.label}</span>
                          <span className="ph-node-type-tag">{ns.type}</span>
                          <span className={`ph-node-status-badge ${ns.status}`}>
                            {ns.status === 'valid' ? '✅' : ns.status === 'error' ? '❌' : ns.status === 'generating' ? '⏳' : '⬜'}
                            {ns.status === 'valid' ? ' Done' : ns.status === 'error' ? ' Error' : ns.status === 'generating' ? ' Busy' : ' Pending'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Pending Files Section */}
                  {build.pendingFiles.length > 0 && (
                    <div className="ph-detail-section">
                      <span className="ph-detail-label">
                        📝 Pending Files ({build.pendingFiles.length})
                      </span>
                      <div className="ph-files-list">
                        {build.pendingFiles.slice(0, 10).map((f, fi) => (
                          <div key={fi} className="ph-file-row pending">
                            <span>⏳</span>
                            <code>{f}</code>
                          </div>
                        ))}
                        {build.pendingFiles.length > 10 && (
                          <span className="ph-more-files">
                            ...and {build.pendingFiles.length - 10} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Completed Files Section */}
                  {build.completedFiles.length > 0 && (
                    <div className="ph-detail-section">
                      <span className="ph-detail-label">
                        ✅ Completed Files ({build.completedFiles.length})
                      </span>
                      <div className="ph-files-list">
                        {build.completedFiles.slice(0, 8).map((f, fi) => (
                          <div key={fi} className="ph-file-row done">
                            <span>✅</span>
                            <code>{f}</code>
                          </div>
                        ))}
                        {build.completedFiles.length > 8 && (
                          <span className="ph-more-files">
                            ...and {build.completedFiles.length - 8} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* All Created Files */}
                  {build.filesCreated.length > 0 && (
                    <div className="ph-detail-section">
                      <span className="ph-detail-label">
                        📄 Created Files ({build.filesCreated.length})
                      </span>
                      <div className="ph-files-list">
                        {build.filesCreated.slice(0, 6).map((f, fi) => (
                          <div key={fi} className="ph-file-row neutral">
                            <span>📄</span>
                            <code>{f}</code>
                          </div>
                        ))}
                        {build.filesCreated.length > 6 && (
                          <span className="ph-more-files">
                            ...and {build.filesCreated.length - 6} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Build Metadata */}
                  <div className="ph-detail-section ph-metadata">
                    <span className="ph-detail-label">📋 Details</span>
                    <div className="ph-meta-grid">
                      <div className="ph-meta-item">
                        <span className="ph-meta-key">Target OS</span>
                        <span className="ph-meta-value">{build.targetOS}</span>
                      </div>
                      <div className="ph-meta-item">
                        <span className="ph-meta-key">Nodes</span>
                        <span className="ph-meta-value">{build.nodeCount}</span>
                      </div>
                      <div className="ph-meta-item">
                        <span className="ph-meta-key">Edges</span>
                        <span className="ph-meta-value">{build.edgeCount}</span>
                      </div>
                      <div className="ph-meta-item">
                        <span className="ph-meta-key">Built</span>
                        <span className="ph-meta-value">{formatDate(build.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
