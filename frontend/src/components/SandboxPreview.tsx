import { useState, useEffect, useCallback, useRef } from 'react';
import { useProjectStore } from '../store/projectStore';
import './SandboxPreview.css';

interface SandboxPreviewProps {
  onApprove: () => void;
  onReturn: () => void;
  onRegenerate?: () => void;
}

interface PreviewState {
  loading: boolean;
  previewId: string | null;
  previewUrl: string | null;
  error: string | null;
  nodeCount: number;
  totalChars: number;
  warnings: string[];
  testResults: SandboxTestResults;
}

interface SandboxTestResults {
  passed: number;
  failed: number;
  total: number;
  lastRun: string | null;
}

type DeployMode = 'single' | 'compose';

interface DockerServiceState {
  running: boolean;
  containerId: string | null;
  status: 'idle' | 'building' | 'starting' | 'running' | 'stopped' | 'error';
  url: string | null;
  language: string | null;
  logs: string[];
  error: string | null;
}

interface ComposeServiceInfo {
  name: string;
  type: string;
  url: string;
  language: string;
}

interface ComposeState {
  running: boolean;
  composeId: string | null;
  status: 'idle' | 'building' | 'running' | 'stopped' | 'error';
  services: ComposeServiceInfo[];
  urls: Record<string, string>;
  logs: string[];
  error: string | null;
}

export default function SandboxPreview({ onApprove, onReturn, onRegenerate }: SandboxPreviewProps) {
  const { projectId, projectName, targetOS, nodes, saveProject } = useProjectStore();

  // ── Docker / System Health Check ──
  const [dockerStatus, setDockerStatus] = useState<{
    available: boolean;
    daemonAccessible: boolean;
    inDockerGroup: boolean;
    cliInstalled: boolean;
    version: string | null;
    hint?: string;
  } | null>(null);
  const [dockerStatusLoading, setDockerStatusLoading] = useState(true);

  const fetchDockerStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/sandbox/status');
      const data = await res.json();
      if (data.success) {
        setDockerStatus(data.docker);
      }
    } catch {
      setDockerStatus(null);
    } finally {
      setDockerStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDockerStatus();
  }, [fetchDockerStatus]);

  // Single container state
  const [dockerService, setDockerService] = useState<DockerServiceState>({
    running: false,
    containerId: null,
    status: 'idle',
    url: null,
    language: null,
    logs: [],
    error: null,
  });
  const dockerPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Compose state
  const [composeState, setComposeState] = useState<ComposeState>({
    running: false,
    composeId: null,
    status: 'idle',
    services: [],
    urls: {},
    logs: [],
    error: null,
  });
  const composePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mode toggle
  const [deployMode, setDeployMode] = useState<DeployMode>('single');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({
    loading: false,
    previewId: null,
    previewUrl: null,
    error: null,
    nodeCount: 0,
    totalChars: 0,
    warnings: [],
    testResults: { passed: 0, failed: 0, total: 0, lastRun: null },
  });

  const codeNodes = nodes.filter(n => n.type !== 'master' && n.data?.generatedCode);

  // Generate the sandbox preview
  const handleGeneratePreview = useCallback(async () => {
    setPreview(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Save project first to ensure it's persisted locally
      saveProject();

      // Collect code nodes directly to send with the preview request
      const codeNodes = nodes
        .filter(n => n.type !== 'master' && n.data?.generatedCode)
        .map(n => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: {
            label: n.data?.label || n.id,
            description: n.data?.description || '',
            type: n.type,
            status: n.data?.status,
            language: n.data?.language,
            generatedCode: n.data?.generatedCode,
          },
        }));

      // Call the backend sandbox preview endpoint, sending nodes directly
      // (backend falls back to inline nodes when projectId is not found)
      const res = await fetch('/api/sandbox/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          nodes: codeNodes,         // sent as fallback if backend can't find project by ID
          projectName: projectName || 'Untitled',
        }),
      });

      const data = await res.json();

      if (data.success) {
        setPreview({
          loading: false,
          previewId: data.previewId,
          previewUrl: data.previewUrl,
          error: null,
          nodeCount: data.nodeCount,
          totalChars: data.totalCodeChars,
          warnings: data.warnings || [],
          testResults: { passed: 0, failed: 0, total: 0, lastRun: null },
        });
      } else {
        setPreview(prev => ({
          ...prev,
          loading: false,
          error: data.error || 'Preview generation failed',
        }));
      }
    } catch (err: any) {
      setPreview(prev => ({
        ...prev,
        loading: false,
        error: err?.message || 'Failed to connect to backend',
      }));
    }
  }, [projectId, projectName, nodes, saveProject]);

  // Auto-generate preview when component mounts
  useEffect(() => {
    handleGeneratePreview();
  }, []);

  // Listen for test results from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'sandbox-test-results') {
        setPreview(prev => ({
          ...prev,
          testResults: {
            passed: event.data.passed || 0,
            failed: event.data.failed || 0,
            total: event.data.total || 0,
            lastRun: new Date().toLocaleTimeString(),
          },
        }));
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Run tests inside the iframe
  const handleRunTests = useCallback(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'run-sandbox-tests' }, '*');
      setPreview(prev => ({
        ...prev,
        testResults: { ...prev.testResults, lastRun: new Date().toLocaleTimeString() },
      }));
    }
  }, []);

  // ── Docker Service Handlers ────────────────────────────────────────

  const handleStartDockerService = useCallback(async () => {
    if (!projectId) return;

    setDockerService({
      running: false,
      containerId: null,
      status: 'building',
      url: null,
      language: null,
      logs: ['[docker] Starting Docker build...'],
      error: null,
    });

    // Save project first
    saveProject();

    try {
      // Collect code nodes to send as inline fallback (in case backend doesn't have the project)
      const codeNodes = nodes
        .filter(n => n.type !== 'master' && n.data?.generatedCode)
        .map(n => ({
          id: n.id,
          type: n.type,
          data: {
            label: n.data?.label || n.id,
            type: n.type,
            language: n.data?.language,
            generatedCode: n.data?.generatedCode,
          },
        }));

      const res = await fetch('/api/sandbox/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          nodes: codeNodes,
          projectName: projectName || 'Untitled',
        }),
      });
      const data = await res.json();

      if (data.success) {
        setDockerService(prev => ({
          ...prev,
          containerId: data.containerId,
          status: data.status, // 'starting' or 'building'
          url: data.url,
          language: data.language,
          logs: [...prev.logs, `[docker] ✅ Container building: ${data.containerId}`],
        }));

        // Start polling for status updates
        startDockerPolling(data.containerId);
      } else {
        setDockerService(prev => ({
          ...prev,
          status: 'error',
          error: data.error || 'Failed to start Docker service',
          logs: [...prev.logs, `[docker] ❌ Error: ${data.error || 'Unknown error'}`],
        }));
      }
    } catch (err: any) {
      setDockerService(prev => ({
        ...prev,
        status: 'error',
        error: err?.message || 'Failed to connect to backend',
        logs: [...prev.logs, `[docker] ❌ Connection error: ${err?.message || 'Unknown'}`],
      }));
    }
  }, [projectId, nodes, projectName, saveProject]);

  const startDockerPolling = useCallback((containerId: string) => {
    // Clear any existing poll
    if (dockerPollRef.current) {
      clearInterval(dockerPollRef.current);
    }

    // Poll every 3 seconds until container is running or errored
    dockerPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/sandbox/run/${containerId}`);
        const data = await res.json();

        if (data.success && data.container) {
          const c = data.container;
          const isTerminal = c.status === 'running' || c.status === 'stopped' || c.status === 'error';

          setDockerService(prev => ({
            ...prev,
            status: c.status,
            url: c.url,
            running: c.status === 'running',
            error: c.error || null,
          }));

          // Fetch logs too
          try {
            const logRes = await fetch(`/api/sandbox/run/${containerId}/logs`);
            const logData = await logRes.json();
            if (logData.success && logData.logs) {
              setDockerService(prev => ({
                ...prev,
                logs: logData.logs.slice(-100), // Keep last 100 lines
              }));
            }
          } catch {}

          // Stop polling if terminal state
          if (isTerminal && dockerPollRef.current) {
            clearInterval(dockerPollRef.current);
            dockerPollRef.current = null;
          }
        }
      } catch {
        // Poll failed, keep trying
      }
    }, 3000);
  }, []);

  const handleStopDockerService = useCallback(async () => {
    if (!dockerService.containerId) return;

    try {
      setDockerService(prev => ({ ...prev, logs: [...prev.logs, '[docker] Stopping container...'] }));
      await fetch(`/api/sandbox/run/${dockerService.containerId}/stop`, { method: 'POST' });
      setDockerService(prev => ({
        ...prev,
        status: 'stopped',
        running: false,
        logs: [...prev.logs, '[docker] ✅ Container stopped'],
      }));
    } catch (err: any) {
      setDockerService(prev => ({
        ...prev,
        logs: [...prev.logs, `[docker] ⚠️ Stop error: ${err?.message || 'Unknown'}`],
      }));
    }

    // Clear polling
    if (dockerPollRef.current) {
      clearInterval(dockerPollRef.current);
      dockerPollRef.current = null;
    }
  }, [dockerService.containerId]);

  // ── Compose Handlers ────────────────────────────────────────────

  const handleStartCompose = useCallback(async () => {
    if (!projectId) return;

    setComposeState({
      running: false, composeId: null, status: 'building',
      services: [], urls: {}, logs: ['[compose] Starting multi-service stack...'], error: null,
    });

    saveProject();

    try {
      const res = await fetch('/api/sandbox/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();

      if (data.success) {
        setComposeState(prev => ({
          ...prev,
          composeId: data.composeId,
          status: data.status,
          services: data.services || [],
          urls: data.urls || {},
          logs: [...prev.logs, `[compose] ✅ Stack building: ${data.composeId}`],
        }));
        startComposePolling(data.composeId);
      } else {
        setComposeState(prev => ({
          ...prev, status: 'error',
          error: data.error || 'Failed to start compose stack',
          logs: [...prev.logs, `[compose] ❌ ${data.error || 'Unknown error'}`],
        }));
      }
    } catch (err: any) {
      setComposeState(prev => ({
        ...prev, status: 'error',
        error: err?.message || 'Connection failed',
        logs: [...prev.logs, `[compose] ❌ ${err?.message || 'Connection failed'}`],
      }));
    }
  }, [projectId, saveProject]);

  const startComposePolling = useCallback((composeId: string) => {
    if (composePollRef.current) clearInterval(composePollRef.current);

    composePollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/sandbox/compose/${composeId}`);
        const data = await res.json();

        if (data.success && data.compose) {
          const c = data.compose;
          const isTerminal = c.status === 'running' || c.status === 'stopped' || c.status === 'error';

          setComposeState(prev => ({
            ...prev,
            status: c.status,
            urls: c.urls || {},
            services: c.services?.map((s: any) => ({
              name: s.name,
              type: s.type,
              url: `http://localhost:${s.port}`,
              language: s.language,
            })) || [],
            running: c.status === 'running',
            error: c.error || null,
          }));

          // Fetch logs
          try {
            const logRes = await fetch(`/api/sandbox/compose/${composeId}/logs`);
            const logData = await logRes.json();
            if (logData.success && logData.logs) {
              setComposeState(prev => ({ ...prev, logs: logData.logs.slice(-100) }));
            }
          } catch {}

          if (isTerminal && composePollRef.current) {
            clearInterval(composePollRef.current);
            composePollRef.current = null;
          }
        }
      } catch {}
    }, 3000);
  }, []);

  const handleStopCompose = useCallback(async () => {
    if (!composeState.composeId) return;
    try {
      setComposeState(prev => ({ ...prev, logs: [...prev.logs, '[compose] Stopping all services...'] }));
      await fetch(`/api/sandbox/compose/${composeState.composeId}/stop`, { method: 'POST' });
      setComposeState(prev => ({ ...prev, status: 'stopped', running: false, logs: [...prev.logs, '[compose] ✅ All services stopped'] }));
    } catch (err: any) {
      setComposeState(prev => ({ ...prev, logs: [...prev.logs, `[compose] ⚠️ Stop error: ${err?.message || 'Unknown'}`] }));
    }
    if (composePollRef.current) { clearInterval(composePollRef.current); composePollRef.current = null; }
  }, [composeState.composeId]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (dockerPollRef.current) clearInterval(dockerPollRef.current);
      if (composePollRef.current) clearInterval(composePollRef.current);
    };
  }, []);

  // Refresh the preview
  const handleRefresh = useCallback(() => {
    handleGeneratePreview();
  }, [handleGeneratePreview]);

  const handleApprove = async () => {
    setSaving(true);
    await onApprove();
    setSaving(false);
  };

  const allTestsPassed = preview.testResults.total > 0 && preview.testResults.failed === 0;
  const hasTestsRun = preview.testResults.total > 0;
  const hasCode = codeNodes.length > 0;

  return (
    <div className="sandbox-preview">
      {/* Header */}
      <div className="sp-header">
        <div className="sp-header-left">
          <h2>🧪 Sandbox Tester</h2>
          <span className="sp-subtitle">
            {projectName} · {targetOS} · {codeNodes.length} nodes
          </span>
        </div>
        <div className="sp-header-right">
          <button
            className="sp-btn sp-btn-secondary"
            onClick={handleRefresh}
            disabled={preview.loading}
            title="Regenerate preview"
          >
            🔄 Refresh
          </button>
          <button
            className="sp-btn sp-btn-test"
            onClick={handleRunTests}
            disabled={!preview.previewUrl || preview.loading}
            title="Run interaction tests"
          >
            🧪 Run Tests
          </button>
        </div>
      </div>

      {/* Status Bar */}
      <div className="sp-status-bar">
        {preview.loading ? (
          <span className="sp-status-loading">
            <span className="sp-spinner" /> Generating sandbox preview...
          </span>
        ) : preview.error ? (
          <span className="sp-status-error">❌ {preview.error}</span>
        ) : preview.previewUrl ? (
          <>
            <span className="sp-status-ok">✅ Preview ready</span>
            <span className="sp-status-item">📄 {preview.totalChars.toLocaleString()} chars</span>
            <span className="sp-status-item">
              🧪 {hasTestsRun
                ? `${preview.testResults.passed}/${preview.testResults.total} passed${preview.testResults.failed > 0 ? ` (${preview.testResults.failed} failed)` : ' ✅'}`
                : 'Tests not run'}
            </span>
            {preview.warnings.length > 0 && (
              <span className="sp-status-warn">⚠️ {preview.warnings.length} warnings</span>
            )}
            {hasTestsRun && (
              <span className="sp-status-item" style={{ marginLeft: 'auto', color: '#64748b', fontSize: 10 }}>
                Last run: {preview.testResults.lastRun}
              </span>
            )}
          </>
        ) : (
          <span className="sp-status-idle">⏳ No preview generated yet</span>
        )}
      </div>

      {/* Warnings */}
      {preview.warnings.length > 0 && (
        <div className="sp-warnings">
          <strong>⚠️ Warnings:</strong>
          <ul>
            {preview.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Iframe Preview */}
      <div className="sp-iframe-container">
        {preview.loading ? (
          <div className="sp-loading">
            <div className="sp-loading-spinner" />
            <p>Building sandbox preview...</p>
          </div>
        ) : preview.error ? (
          <div className="sp-error">
            <h3>❌ Preview Unavailable</h3>
            <p>{preview.error}</p>
            {!hasCode && <p className="sp-error-hint">💡 Generate code for your nodes first, then try again.</p>}
            <button className="sp-btn sp-btn-secondary" onClick={handleRefresh}>
              🔄 Retry
            </button>
          </div>
        ) : preview.previewUrl ? (
          <iframe
            ref={iframeRef}
            className="sp-iframe"
            src={preview.previewUrl}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            title="App Sandbox Preview"
            onLoad={() => {
              // Auto-run tests when iframe loads
              setTimeout(() => handleRunTests(), 1000);
            }}
          />
        ) : (
          <div className="sp-error">
            <h3>⏳ No Preview</h3>
            <p>Click "Refresh" to generate the preview.</p>
          </div>
        )}
      </div>

      {/* Test Results Panel */}
      {hasTestsRun && (
        <div className={`sp-test-results ${allTestsPassed ? 'passed' : 'failed'}`}>
          <div className="sp-test-header">
            <span>🧪 Test Results</span>
            <span className="sp-test-summary">
              {preview.testResults.passed}/{preview.testResults.total} passed
              {preview.testResults.failed > 0 && (
                <span style={{ color: '#ef4444', marginLeft: 8 }}>
                  · {preview.testResults.failed} failed
                </span>
              )}
            </span>
          </div>
          <div className="sp-test-bar">
            <div
              className={`sp-test-bar-fill ${allTestsPassed ? 'passed' : 'partial'}`}
              style={{ width: `${(preview.testResults.passed / Math.max(preview.testResults.total, 1)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* ── System Health Check Bar ── */}
      <div className={`sp-health-bar ${!dockerStatus ? 'offline' : dockerStatus.daemonAccessible ? 'healthy' : dockerStatus.inDockerGroup ? 'warn-daemon' : 'warn-group'}`}>
        <div className="sp-health-icon">
          {dockerStatusLoading ? (
            <span className="sp-health-spinner" />
          ) : !dockerStatus ? (
            <span className="sp-health-dot offline" />
          ) : dockerStatus.daemonAccessible ? (
            <span className="sp-health-dot healthy" />
          ) : (
            <span className="sp-health-dot warning" />
          )}
        </div>
        <div className="sp-health-info">
          <span className="sp-health-title">
            🐳 Docker{' '}
            {dockerStatusLoading ? (
              'Checking...'
            ) : !dockerStatus ? (
              <span className="sp-health-status offline">⨯ Backend offline</span>
            ) : dockerStatus.daemonAccessible ? (
              <span className="sp-health-status healthy">
                ✅ Connected
                {dockerStatus.version && (
                  <span className="sp-health-version">{dockerStatus.version.replace('Docker version ', 'v')}</span>
                )}
              </span>
            ) : dockerStatus.inDockerGroup ? (
              <span className="sp-health-status warn-daemon">⚠️ Daemon not running</span>
            ) : (
              <span className="sp-health-status warn-group">⚠️ Not in docker group</span>
            )}
          </span>
          {!dockerStatusLoading && dockerStatus?.hint && (
            <span className="sp-health-hint">{dockerStatus.hint}</span>
          )}
        </div>
        <button
          className="sp-health-refresh"
          onClick={() => { setDockerStatusLoading(true); fetchDockerStatus(); }}
          title="Refresh health status"
        >
          🔄
        </button>
      </div>

      {/* ── Docker / Compose Mode Toggle ── */}
      <div className="sp-mode-toggle">
        <button
          className={`sp-mode-btn ${deployMode === 'single' ? 'active' : ''}`}
          onClick={() => setDeployMode('single')}
        >
          🐳 Single Container
        </button>
        <button
          className={`sp-mode-btn ${deployMode === 'compose' ? 'active' : ''}`}
          onClick={() => setDeployMode('compose')}
        >
          🏗️ Multi-Service (Compose)
        </button>
      </div>

      {/* ── Single Container Panel ── */}
      {deployMode === 'single' && (
        <div className="sp-docker-section">
          <div className="sp-docker-header">
            <span className="sp-docker-title">🐳 Single Container</span>
            <span className="sp-docker-status-badge" data-status={dockerService.status}>
              {dockerService.status === 'idle' && '⏹ Idle'}
              {dockerService.status === 'building' && '🔨 Building...'}
              {dockerService.status === 'starting' && '⏳ Starting...'}
              {dockerService.status === 'running' && '✅ Running'}
              {dockerService.status === 'stopped' && '⏹ Stopped'}
              {dockerService.status === 'error' && '❌ Error'}
            </span>
          </div>
          <div className="sp-docker-body">
            {dockerService.status === 'idle' && (
              <div className="sp-docker-idle">
                <p>Run your generated app as a single Docker container.</p>
                {hasCode ? (
                  <button className="sp-btn sp-btn-docker" onClick={handleStartDockerService}>🐳 Start Container</button>
                ) : (
                  <p className="sp-error-hint">💡 Generate code for your nodes first.</p>
                )}
              </div>
            )}
            {(dockerService.status === 'building' || dockerService.status === 'starting') && (
              <div className="sp-docker-loading">
                <div className="sp-docker-spinner" />
                <span>{dockerService.status === 'building' ? 'Building image...' : 'Starting container...'}</span>
              </div>
            )}
            {dockerService.status === 'running' && dockerService.url && (
              <div className="sp-docker-running">
                <div className="sp-docker-url-row">
                  <span className="sp-docker-url-label">URL:</span>
                  <a href={dockerService.url} target="_blank" rel="noopener noreferrer" className="sp-docker-url">🔗 {dockerService.url}</a>
                  <button className="sp-btn sp-btn-docker-stop" onClick={handleStopDockerService}>⏹ Stop</button>
                </div>
                <div className="sp-docker-info">
                  <span>Language: {dockerService.language || 'auto'}</span>
                  <span>ID: {dockerService.containerId}</span>
                </div>
                <div className="sp-docker-open-btn-row">
                  <button className="sp-btn sp-btn-open" onClick={() => dockerService.url && window.open(dockerService.url, '_blank')}>🌐 Open in New Tab</button>
                </div>
              </div>
            )}
            {dockerService.status === 'stopped' && (
              <div className="sp-docker-stopped">
                <p>Container stopped.</p>
                <button className="sp-btn sp-btn-docker" onClick={handleStartDockerService}>🔄 Restart</button>
              </div>
            )}
            {dockerService.status === 'error' && (
              <div className="sp-docker-error">
                <p>❌ {dockerService.error || 'Failed'}</p>
                <button className="sp-btn sp-btn-docker" onClick={handleStartDockerService}>🔄 Retry</button>
              </div>
            )}
            {dockerService.logs.length > 0 && (
              <div className="sp-docker-logs">
                <div className="sp-docker-logs-header">📋 Logs ({dockerService.logs.length} lines)</div>
                <div className="sp-docker-logs-content">
                  <pre>{dockerService.logs.map((l, i) => (
                    <code key={i} className={l.includes('❌') ? 'sp-log-error' : l.includes('✅') ? 'sp-log-ok' : ''}>{l}{'\n'}</code>
                  ))}</pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Multi-Service (Compose) Panel ── */}
      {deployMode === 'compose' && (
        <div className="sp-docker-section sp-compose-section">
          <div className="sp-docker-header">
            <span className="sp-docker-title">🏗️ Multi-Service Stack</span>
            <span className="sp-docker-status-badge" data-status={composeState.status}>
              {composeState.status === 'idle' && '⏹ Idle'}
              {composeState.status === 'building' && '🔨 Building...'}
              {composeState.status === 'running' && '✅ Running'}
              {composeState.status === 'stopped' && '⏹ Stopped'}
              {composeState.status === 'error' && '❌ Error'}
            </span>
          </div>
          <div className="sp-docker-body">
            {composeState.status === 'idle' && (
              <div className="sp-docker-idle">
                <p>Run frontend + backend + database as a docker-compose stack.</p>
                {hasCode ? (
                  <button className="sp-btn sp-btn-compose" onClick={handleStartCompose}>🏗️ Start All Services</button>
                ) : (
                  <p className="sp-error-hint">💡 Generate code for your nodes first.</p>
                )}
              </div>
            )}
            {composeState.status === 'building' && (
              <div className="sp-docker-loading">
                <div className="sp-docker-spinner" />
                <span>Building and starting multi-service stack... This may take a few minutes.</span>
              </div>
            )}
            {composeState.status === 'running' && (
              <div className="sp-compose-running">
                <div className="sp-compose-service-list">
                  {composeState.services.map(svc => (
                    <div key={svc.name} className="sp-compose-service-item">
                      <div className="sp-compose-service-header">
                        <span className={`sp-compose-service-type type-${svc.type}`}>{svc.type === 'frontend' ? '🖥' : svc.type === 'backend' ? '⚙️' : '🗄️'} {svc.name}</span>
                        <span className="sp-compose-service-lang">{svc.language}</span>
                      </div>
                      <a href={svc.url} target="_blank" rel="noopener noreferrer" className="sp-compose-service-url">🔗 {svc.url}</a>
                    </div>
                  ))}
                </div>
                <div className="sp-docker-open-btn-row">
                  {Object.entries(composeState.urls).map(([name, url]) => (
                    <button key={name} className="sp-btn sp-btn-open" onClick={() => window.open(url, '_blank')}>
                      🌐 Open {name}
                    </button>
                  ))}
                  <button className="sp-btn sp-btn-docker-stop" onClick={handleStopCompose}>⏹ Stop All</button>
                </div>
              </div>
            )}
            {composeState.status === 'stopped' && (
              <div className="sp-docker-stopped">
                <p>All services stopped and cleaned up.</p>
                <button className="sp-btn sp-btn-compose" onClick={handleStartCompose}>🔄 Restart Stack</button>
              </div>
            )}
            {composeState.status === 'error' && (
              <div className="sp-docker-error">
                <p>❌ {composeState.error || 'Failed to start stack'}</p>
                <button className="sp-btn sp-btn-compose" onClick={handleStartCompose}>🔄 Retry</button>
              </div>
            )}
            {composeState.logs.length > 0 && (
              <div className="sp-docker-logs">
                <div className="sp-docker-logs-header">📋 Stack Logs ({composeState.logs.length} lines)</div>
                <div className="sp-docker-logs-content">
                  <pre>{composeState.logs.map((l, i) => (
                    <code key={i} className={l.includes('❌') ? 'sp-log-error' : l.includes('✅') ? 'sp-log-ok' : ''}>{l}{'\n'}</code>
                  ))}</pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="sp-actions">
        <button className="sp-btn sp-btn-return" onClick={onReturn}>
          🔄 Return to Modify
        </button>
        {onRegenerate && (
          <button className="sp-btn sp-btn-regenerate" onClick={onRegenerate}>
            ⚡ Regenerate Code
          </button>
        )}
        <button
          className="sp-btn sp-btn-approve"
          onClick={handleApprove}
          disabled={saving || preview.loading}
        >
          {saving ? '⏳ Saving...' : '✅ Approve & Save'}
        </button>
      </div>
    </div>
  );
}
