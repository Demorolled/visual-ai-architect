/**
 * ExportDialog — Finish and export the app build.
 *
 * Flow:
 * 1. Open dialog → checks if code/GUI is generated
 * 2. If not generated → auto-generate all files first (shows progress)
 * 3. User names the app and chooses a storage location
 * 4. Clicks "Build" → backend scaffolds the project at the chosen location
 * 5. Shows success with output path and open-location option
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useProjectStore } from '../store/projectStore';
import { api, ensureServerProject } from '../api/client';
import './ExportDialog.css';

const SOCKET_PATH = '/ws';

interface ExportDialogProps {
  /** Close the dialog without exporting */
  onClose: () => void;
  /** Called on successful export */
  onExported?: (outputPath: string) => void;
}

type ExportPhase =
  | 'ready'           // Initial state — waiting for user
  | 'generating'      // Auto-generating code (if missing)
  | 'scaffolding'     // Building the project files
  | 'done'            // Success
  | 'error';          // Something failed

export default function ExportDialog({ onClose, onExported }: ExportDialogProps) {
  const store = useProjectStore();
  const { nodes, projectName: storeProjectName, targetOS, edges } = store;

  const codeNodes = nodes.filter(n => n.type !== 'master');
  const hasGeneratedCode = codeNodes.some(n => n.data?.generatedCode);

  // Form state
  const [appName, setAppName] = useState(storeProjectName || 'MyApp');
  const [customPath, setCustomPath] = useState('');

  // Progress state
  const [phase, setPhase] = useState<ExportPhase>('ready');
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [outputPath, setOutputPath] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [fileList, setFileList] = useState<string[]>([]);

  // Live per-file generation progress (streamed via Socket.IO generation_progress)
  const [liveProgress, setLiveProgress] = useState<{
    percent: number;
    phase: string;
    generatingNodes: string[];
  } | null>(null);
  // Per-node build status chips (filled after generation completes)
  const [nodeStatuses, setNodeStatuses] = useState<Array<{ nodeId: string; label: string; validated: boolean }>>([]);
  // Custom output-path validation state (debounced check against the backend)
  const [pathCheck, setPathCheck] = useState<{ state: 'idle' | 'checking' | 'ok' | 'warn'; message?: string }>({ state: 'idle' });

  const socketRef = useRef<Socket | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  // Guards against concurrent runs of handleGenerate (React StrictMode
  // double-fires effects in dev), which would duplicate server projects and
  // produce doubled build logs.
  const generatingRef = useRef(false);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  const addLog = useCallback((msg: string) => {
    setLog(prev => [...prev, msg]);
  }, []);

  // ── Live per-file progress via Socket.IO ──
  // The backend's /files route streams `generation_progress` events through
  // socketManager while files are being generated. We subscribe for the
  // duration of the generating phase so the progress bar + node labels update
  // in real time instead of sitting at a static percentage.
  useEffect(() => {
    if (phase !== 'generating') return;
    const socketUrl = window.location.origin;
    const socket = io(socketUrl, {
      path: SOCKET_PATH,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;
    socket.on('generation_progress', (data: any) => {
      setLiveProgress({
        percent: typeof data?.percent === 'number' ? data.percent : 0,
        phase: data?.phase || 'generating',
        generatingNodes: Array.isArray(data?.generatingNodes) ? data.generatingNodes : [],
      });
    });
    socket.on('connect_error', () => { /* progress is best-effort — fall back to static bar */ });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [phase]);

  // ── Debounced custom-path validation ──
  // As the user types a custom output location, ask the backend whether that
  // path is writable. This surfaces the unwritable-path failure (e.g.
  // /home/desktop under a root-owned /home) BEFORE the build runs, instead of
  // after the fact.
  useEffect(() => {
    const trimmed = customPath.trim();
    if (!trimmed) {
      setPathCheck({ state: 'idle' });
      return;
    }
    setPathCheck({ state: 'checking' });
    const t = setTimeout(async () => {
      try {
        const res = await api.validateExportPath(trimmed);
        const data = res.data;
        if (data?.writable) {
          setPathCheck({ state: 'ok', message: `Writable — will build at ${data.resolvedPath || trimmed}` });
        } else {
          setPathCheck({ state: 'warn', message: data?.message || 'This path may not be writable — the build will fall back to the default exports/ folder.' });
        }
      } catch {
        setPathCheck({ state: 'idle' });
      }
    }, 450);
    return () => clearTimeout(t);
  }, [customPath]);

  // ── Step 1: Generate code if missing ──
  const handleGenerate = useCallback(async () => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    try {
    // Reset per-run UI state so a re-build (retry / second generate in the
    // same dialog session) doesn't show stale progress or node chips.
    setLiveProgress(null);
    setNodeStatuses([]);
    setPhase('generating');
    setProgress(5);
    setStatusMsg('Checking project state...');
    addLog('📋 Preparing to build app...');

    const projectId = localStorage.getItem('current-project-id');
    if (!projectId) {
      setPhase('error');
      setErrorMsg('No project found. Please save the project first.');
      addLog('❌ No project ID — save the project and try again.');
      return;
    }

    // Check if code needs generating
    if (!hasGeneratedCode) {
      setStatusMsg('Generating code for each node...');
      addLog(`⚡ Generating code for ${codeNodes.length} node(s)...`);
      setProgress(15);

      try {
        // Ensure the backend has a project registered for this graph. The backend
        // keeps projects in memory, so a server restart wipes them and the stored
        // project id goes stale — generation would otherwise 404.
        const freshId = await ensureServerProject({
          projectId,
          name: storeProjectName || 'MyApp',
          targetOS,
          nodes: codeNodes,
          edges,
          trees: store.trees,
        });
        // Use per-file generation (FileGenerator) which creates isolated node files
        const genRes = await api.generateFiles(freshId);
        const genData = genRes.data;

        if (genData.success && genData.files) {
          addLog(`✅ Generated ${genData.files.length} files (${(genData.totalChars || 0).toLocaleString()} chars)`);
          addLog(`   Validated: ${genData.validatedCount}/${genData.files.length}`);

          // Fill per-node status chips from the generation result
          setNodeStatuses(genData.files.map((f: any) => ({
            nodeId: f.nodeId,
            label: f.nodeLabel || f.nodeId,
            validated: !!f.validated,
          })));

          // Update each node with its generated code
          for (const file of genData.files) {
            const node = nodes.find(n => n.id === file.nodeId);
            if (node) {
              store.updateNodeStatus(node.id, file.validated ? 'valid' : 'error', file.errors.length > 0 ? file.errors.join('; ') : undefined, file.code);
            }
          }

          if (genData.failedCount > 0) {
            addLog(`⚠️ ${genData.failedCount} file(s) have validation errors`);
          }
        } else {
          addLog(`❌ Generation failed: ${genData.error || 'Unknown error'}`);
        }
      } catch (err: any) {
        addLog(`❌ Generation error: ${err.message}`);
        // Continue anyway — try to scaffold what we have
      }
    } else {
      addLog('✅ Code already generated — skipping generation.');
      // Seed per-node chips from nodes that already carry generated code so the
      // summary is consistent even when the generate step is skipped.
      setNodeStatuses(codeNodes
        .filter(n => n.data?.generatedCode)
        .map(n => ({
          nodeId: n.id,
          label: n.data?.label || n.id,
          // Code exists — only flag as ⚠️ when the node is explicitly in error
          // (stale 'pending' from an older session still counts as built).
          validated: n.data?.status !== 'error',
        })));
    }

    setProgress(50);
    setStatusMsg('Code ready — starting build...');
    setPhase('ready');
    } finally {
      generatingRef.current = false;
    }
  }, [hasGeneratedCode, codeNodes.length, nodes, store]);

  // ── Step 2: Scaffold/Build the app ──
  const handleBuild = useCallback(async () => {
    const projectId = localStorage.getItem('current-project-id');
    if (!projectId) {
      setPhase('error');
      setErrorMsg('No project found. Please save the project first.');
      return;
    }

    setPhase('scaffolding');
    setProgress(60);
    setStatusMsg('Building project files...');
    addLog(`🏗️ Building "${appName}" at ${customPath || 'default location'}...`);
    addLog(`   Target OS: ${targetOS}`);

    try {
      // Re-register the project with the backend in case its in-memory registry
      // was reset by a server restart (a stale id would make the scaffold 404).
      const freshId = await ensureServerProject({
        projectId,
        name: appName,
        targetOS,
        nodes: codeNodes,
        edges,
        trees: store.trees,
      });
      // Call the per-file scaffold endpoint with custom output path
      const scaffoldRes = await api.exportPerFileScaffold(freshId, {
        projectName: appName,
        targetOS,
        outputDir: customPath || undefined,
      });

      const data = scaffoldRes.data;

      setProgress(90);

      if (data.success) {
        const path = data.outputPath || '(unknown path)';
        setOutputPath(path);
        setFileList(data.files || []);
        addLog(`✅ Build complete!`);
        addLog(`📁 Output: ${path}`);
        addLog(`📄 Files created: ${(data.files || []).length}`);
        if (data.warning) {
          addLog(`⚠️ ${data.warning}`);
          setStatusMsg('Build succeeded — path changed');
        } else {
          setStatusMsg('Build successful!');
        }
        setPhase('done');
        onExported?.(path);
      } else {
        throw new Error(data.error || data.message || 'Build failed');
      }
    } catch (err: any) {
      setPhase('error');
      setErrorMsg(err.message);
      addLog(`❌ Build failed: ${err.message}`);
      setStatusMsg('Build failed');
    }

    setProgress(100);
  }, [appName, customPath, targetOS, onExported]);

  // Auto-generate on mount if no code
  useEffect(() => {
    if (!hasGeneratedCode && codeNodes.length > 0) {
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasGeneratedCode, codeNodes.length]);

  /** Open the built folder in the system file manager (backend xdg-open). */
  const handleOpenFolder = useCallback(async () => {
    if (!outputPath) return;
    try {
      const res = await api.openExportFolder(outputPath);
      if (res.data?.success) {
        addLog('📂 Opened folder in file manager');
      } else {
        addLog(`⚠️ Could not open folder: ${res.data?.error || 'unknown error'}`);
      }
    } catch (err: any) {
      addLog(`⚠️ Could not open folder: ${err.message}`);
    }
  }, [outputPath, addLog]);

  // Blend the Socket.IO live percent into the static step progress so the bar
  // keeps moving smoothly even before the response lands.
  const totalProgress = phase === 'generating' && liveProgress
    ? Math.max(progress, liveProgress.percent)
    : progress;

  // Don't close while busy
  const handleClose = useCallback(() => {
    if (phase === 'generating' || phase === 'scaffolding') return;
    onClose();
  }, [phase, onClose]);

  return (
    <div className="export-overlay" onClick={handleClose}>
      <div className="export-dialog" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="export-header">
          <div className="export-header-left">
            <span className="export-icon">📦</span>
            <h2 className="export-title">Export App</h2>
          </div>
          <button className="export-close-btn" onClick={handleClose} title="Close">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="export-body">
          {/* App Name */}
          <div className="export-field">
            <label className="export-label">App Name</label>
            <input
              className="export-input"
              type="text"
              value={appName}
              onChange={e => setAppName(e.target.value)}
              placeholder="MyApp"
              disabled={phase === 'generating' || phase === 'scaffolding'}
            />
          </div>

          {/* Output Location */}
          <div className="export-field">
            <label className="export-label">
              Output Location
              <span className="export-label-hint">(leave empty for auto-generated path)</span>
            </label>
            <input
              className="export-input export-path-input"
              type="text"
              value={customPath}
              onChange={e => setCustomPath(e.target.value)}
              placeholder="~/Desktop/myapp  (optional)"
              disabled={phase === 'generating' || phase === 'scaffolding'}
            />
            {/* Path writability hint — checked live against the backend */}
            {pathCheck.state !== 'idle' && (
              <div className={`export-path-check ${pathCheck.state}`}>
                {pathCheck.state === 'checking' && 'Checking path...'}
                {pathCheck.state === 'ok' && `✅ ${pathCheck.message}`}
                {pathCheck.state === 'warn' && `⚠️ ${pathCheck.message}`}
              </div>
            )}
          </div>

          {/* Project Summary */}
          <div className="export-summary">
            <div className="export-summary-item">
              <span className="export-summary-icon">📄</span>
              <span>{codeNodes.length} nodes</span>
            </div>
            <div className="export-summary-item">
              <span className="export-summary-icon">🔗</span>
              <span>{edges.length} connections</span>
            </div>
            <div className="export-summary-item">
              <span className="export-summary-icon">🎯</span>
              <span>{targetOS}</span>
            </div>
            <div className="export-summary-item">
              <span className={`export-summary-icon ${hasGeneratedCode ? 'green' : 'yellow'}`}>
                {hasGeneratedCode ? '✅' : '⏳'}
              </span>
              <span>{hasGeneratedCode ? 'Code generated' : 'Code needed'}</span>
            </div>
          </div>

          {/* Per-node build status chips */}
          {nodeStatuses.length > 0 && (
            <div className="export-node-chips">
              {nodeStatuses.map(ns => (
                <span key={ns.nodeId} className={`export-node-chip ${ns.validated ? 'ok' : 'err'}`} title={ns.label}>
                  {ns.validated ? '✅' : '⚠️'} {ns.label}
                </span>
              ))}
            </div>
          )}

          {/* Progress Bar */}
          {phase !== 'ready' && phase !== 'done' && phase !== 'error' && (
            <div className="export-progress">
              <div className="export-progress-bar">
                <div
                  className="export-progress-fill"
                  style={{ width: `${totalProgress}%` }}
                />
              </div>
              <span className="export-progress-text">{statusMsg}</span>
              {/* Live per-file status (streamed via Socket.IO) */}
              {phase === 'generating' && liveProgress && liveProgress.generatingNodes.length > 0 && (
                <div className="export-progress-live">
                  <span className="export-progress-live-label">🔄 Generating:</span>
                  {liveProgress.generatingNodes.map((n, i) => (
                    <span key={`${n}-${i}`} className="export-progress-live-node">{n}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Log */}
          {(log.length > 0 || phase === 'error') && (
            <div className="export-log" ref={logRef}>
              {log.map((line, i) => (
                <div
                  key={i}
                  className={`export-log-line ${
                    line.startsWith('✅') || line.startsWith('📁') ? 'log-success' :
                    line.startsWith('❌') ? 'log-error' :
                    line.startsWith('⚠️') ? 'log-warn' :
                    line.startsWith('⚡') || line.startsWith('🏗️') ? 'log-info' : ''
                  }`}
                >
                  {line}
                </div>
              ))}
              {phase === 'error' && (
                <div className="export-log-line log-error">
                  ❌ {errorMsg}
                </div>
              )}
            </div>
          )}

          {/* Done state */}
          {phase === 'done' && (
            <div className="export-done">
              <div className="export-done-icon">✅</div>
              <div className="export-done-title">App Built Successfully!</div>
              <div className="export-done-path">
                📁 {outputPath}
              </div>
              {fileList.length > 0 && (
                <div className="export-done-files">
                  <details>
                    <summary>📄 {fileList.length} files created</summary>
                    <div className="export-done-file-list">
                      {fileList.map((f, i) => (
                        <div key={i} className="export-done-file">{f}</div>
                      ))}
                    </div>
                  </details>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="export-footer">
          <button className="export-btn export-btn-secondary" onClick={handleClose}>
            {phase === 'done' ? 'Close' : 'Cancel'}
          </button>

          {phase === 'ready' && hasGeneratedCode && (
            <button
              className="export-btn export-btn-primary"
              onClick={handleBuild}
              disabled={!appName.trim()}
            >
              🏗️ Build App
            </button>
          )}

          {phase === 'ready' && !hasGeneratedCode && codeNodes.length > 0 && (
            <button
              className="export-btn export-btn-primary"
              onClick={handleGenerate}
            >
              ⚡ Generate Code First
            </button>
          )}

          {phase === 'error' && (
            <button
              className="export-btn export-btn-primary"
              onClick={() => {
                setPhase('ready');
                setErrorMsg('');
                handleGenerate();
              }}
            >
              🔄 Retry
            </button>
          )}

          {phase === 'done' && (
            <>
              <button
                className="export-btn export-btn-primary"
                onClick={handleOpenFolder}
              >
                📂 Open Folder
              </button>
              <button
                className="export-btn export-btn-primary"
                onClick={() => {
                  // Copy path to clipboard
                  navigator.clipboard.writeText(outputPath).catch(() => {});
                  addLog('📋 Path copied to clipboard!');
                }}
              >
                📋 Copy Path
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
