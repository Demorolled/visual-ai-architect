/**
 * BlueprintBuildDialog — "Build from description".
 *
 * Flow:
 * 1. User describes the app they want (goal) + optional OS/language/fast mode
 * 2. POST /api/blueprint/build → matches the 1200+ blueprint bible, builds the
 *    project graph, and generates all files with the live LLM
 * 3. On success: fetch the full project (GET /api/projects/:id), convert it to
 *    a local SavedProject, import it into the canvas store (persists + loads),
 *    and attach each generated file's code to its node
 * 4. Shows a summary: matched blueprint, generated files, verified-capture stats
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useProjectStore, type BlueprintExportRequest } from '../store/projectStore';
import { api } from '../api/client';
import { LANGUAGE_OPTIONS, OSType } from '../types';
import { broadcastMessage } from '../utils/terminalSync';
import { exportBuild, openExportedFolder } from '../utils/exportBuild';
import './BlueprintBuildDialog.css';

const SOCKET_PATH = '/ws';

interface BlueprintBuildDialogProps {
  onClose: () => void;
  /** Pre-fill the goal field (e.g. from a mockup's "Build This Now"). */
  initialGoal?: string;
  /** Start the build immediately on mount (used with initialGoal). */
  autoStart?: boolean;
}

type BuildPhase = 'form' | 'previewing' | 'preview' | 'building' | 'loading' | 'done' | 'error';

interface MockupResult {
  appType: string;
  description: string;
  modules: string[];
  matchScore: number;
  imageBase64?: string;
  html: string;
}

interface BuildResult {
  appType: string;
  score: number;
  files: number;
  captured: number;
  skipped: number;
  totalChars: number;
  projectName: string;
}

interface DriftReport {
  expected: string[];
  generated: string[];
  matched: string[];
  missing: string[];
  unexpected: string[];
  clean: boolean;
}

/** Behavioral smoke verdicts from the canvas path (load-and-click gate). */
interface SmokeVerdictLite {
  status: string;
  detail?: string;
  errors?: string[];
}
interface SmokeReport {
  render: SmokeVerdictLite | null;
  cli: SmokeVerdictLite | null;
  anyFailed: boolean;
}

export default function BlueprintBuildDialog({ onClose, initialGoal, autoStart }: BlueprintBuildDialogProps) {
  const store = useProjectStore();
  const { importProject, updateNodeStatus, setGenerating, setProgress, targetOS } = store;

  // A pending blueprint request (from the mockup's "⚡ Build This Now") may
  // carry the goal — pre-fill from it, then consume the request so a normal
  // dialog open is never auto-started or pre-filled by a stale request.
  const [goal, setGoal] = useState(() =>
    initialGoal || useProjectStore.getState().blueprintRequestGoal || ''
  );
  const [autoRun] = useState(() =>
    autoStart === true || !!useProjectStore.getState().blueprintRequestGoal
  );
  const [appType, setAppType] = useState('');
  const [os, setOs] = useState<OSType>(targetOS || 'linux');
  const [language, setLanguage] = useState('typescript');
  const [fastMode, setFastMode] = useState(false);
  const [mockupTheme, setMockupTheme] = useState('ocean');
  const [mockupLayout, setMockupLayout] = useState('sidebar');

  const MOCKUP_THEME_OPTIONS = [
    { id: 'ocean', label: '🌊 Ocean' },
    { id: 'violet', label: '🔮 Violet' },
    { id: 'emerald', label: '🌿 Emerald' },
    { id: 'rose', label: '🌸 Rose' },
    { id: 'amber', label: '🌞 Amber' },
    { id: 'slate', label: '🪨 Slate' },
    { id: 'cyan', label: '💠 Cyan' },
  ];

  const MOCKUP_LAYOUT_OPTIONS = [
    { id: 'sidebar', label: '🖥 Sidebar' },
    { id: 'dashboard', label: '📊 Dashboard' },
    { id: 'topnav', label: '🧭 Top Nav' },
  ];

  const [phase, setPhase] = useState<BuildPhase>('form');
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [progress, setLocalProgress] = useState(0);
  const [liveNodes, setLiveNodes] = useState<string[]>([]);
  const [result, setResult] = useState<BuildResult | null>(null);
  const [mockup, setMockup] = useState<MockupResult | null>(null);
  const [mockupError, setMockupError] = useState('');
  const [drift, setDrift] = useState<DriftReport | null>(null);
  const [smoke, setSmoke] = useState<SmokeReport | null>(null);
  // Project + node-id mapping for the drift-repair action (module → node).
  const [builtProjectId, setBuiltProjectId] = useState<string | null>(null);
  const [builtNodes, setBuiltNodes] = useState<Array<{ id: string; label: string }>>([]);
  const [regenerating, setRegenerating] = useState(false);

  // ── Export request handed in by the chat ──
  // Read in a state INITIALIZER, not an effect: the mount effect below calls
  // clearBlueprintRequest(), which would wipe it before an effect could read
  // it. When present, a successful build exports itself with no button clicks.
  const [exportRequest] = useState<BlueprintExportRequest | null>(
    () => useProjectStore.getState().blueprintRequestExport
  );
  const [exportStatus, setExportStatus] = useState('');
  const [exportPath, setExportPath] = useState('');
  const [regenerateResults, setRegenerateResults] = useState<Array<{
    module: string;
    success: boolean;
    detail: string;
  }>>([]);

  const socketRef = useRef<Socket | null>(null);
  const goalRef = useRef(goal);
  goalRef.current = goal;

  // ── Consume any pending blueprint request (mockup "Build This Now") ──
  useEffect(() => {
    useProjectStore.getState().clearBlueprintRequest();
  }, []);

  // ── Auto-start the build (mockup "Build This Now" path) ──
  // NOTE: the ref guard lives INSIDE the timeout callback, not before the
  // setTimeout — React StrictMode double-mounts in dev (mount → cleanup →
  // mount), and a pre-set guard + cleanup would cancel the timer and then
  // skip rescheduling, so the build would never start.
  const autoStartRef = useRef(false);
  useEffect(() => {
    if (!autoRun || !goalRef.current.trim()) return;
    const t = setTimeout(() => {
      if (autoStartRef.current) return; // already started (double-mount safety)
      autoStartRef.current = true;
      handleBuild();
    }, 250); // let the form render first
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Live generation progress via Socket.IO ──
  useEffect(() => {
    if (phase !== 'building' && phase !== 'loading') return;
    const socket = io(window.location.origin, {
      path: SOCKET_PATH,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 3,
    });
    socketRef.current = socket;

    socket.on('generation_progress', (data: {
      batch: number;
      totalBatches: number;
      generatingNodes: string[];
      percent: number;
      phase: string;
    }) => {
      setLocalProgress(data.percent);
      setLiveNodes(data.generatingNodes || []);
      setStatusMsg(
        data.phase === 'done'
          ? '✅ Generation complete — loading into canvas...'
          : `📦 Batch ${data.batch + 1}/${data.totalBatches}${data.generatingNodes.length ? `: ${data.generatingNodes.join(', ')}` : ''}`
      );
    });

    socket.on('generation_error', (data: { message?: string }) => {
      setStatusMsg(`⚠️ ${data?.message || 'Generation error'}`);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [phase]);

  const handleBuild = useCallback(async () => {
    const trimmed = goalRef.current.trim();
    if (!trimmed) {
      setErrorMsg('Please describe the app you want to build.');
      return;
    }

    setPhase('building');
    setErrorMsg('');
    setStatusMsg('🔍 Matching your description against the blueprint bible...');
    setLocalProgress(5);
    setGenerating(true);

    try {
      const res = await api.buildFromBlueprint({
        goal: trimmed,
        targetOS: os,
        language,
        skipValidation: fastMode,
        ...(appType.trim() ? { appType: appType.trim() } : {}),
      });

      setPhase('loading');
      setStatusMsg('✅ Build complete — loading project into canvas...');
      setLocalProgress(92);

      const data = res.data;
      const projectId: string | undefined = data?.projectId;
      if (!projectId) throw new Error('Build response missing projectId');
      setBuiltProjectId(projectId);
      setRegenerateResults([]);

      // The build response only carries {id,type,label} per node — fetch the
      // full project (positions + node data) to hydrate the canvas.
      const fullRes = await api.getProject(projectId);
      const full = fullRes.data;
      if (!full || !Array.isArray(full.nodes)) throw new Error('Full project fetch failed');

      // Convert backend nodes (DbNode) → ReactFlow nodes. The backend node
      // shape { id, type, position, data } maps 1:1 onto ReactFlow nodes.
      const nodes = (full.nodes || []).map((n: any) => ({
        id: n.id,
        type: n.type,
        position: n.position || { x: 60 + Math.random() * 200, y: 120 + Math.random() * 150 },
        data: {
          ...(n.data || {}),
          status: n.data?.status || 'pending',
          selectedOS: full.targetOS || os,
        },
      }));

      const edges = (full.edges || []).map((e: any) => ({
        id: e.id || `edge_${Math.random().toString(36).slice(2)}`,
        source: e.source,
        target: e.target,
      }));

      // Persist + load into the canvas (importProject assigns a fresh local id
      // and pushes to the localStorage project store, exactly like the wizard).
      const savedJson = JSON.stringify({
        id: projectId,
        name: full.name || trimmed.slice(0, 60),
        targetOS: full.targetOS || os,
        nodes,
        edges,
        savedAt: new Date().toISOString(),
        version: 1,
      });
      const imported = importProject(savedJson);
      if (!imported) throw new Error('Failed to load project into canvas');

      // Attach the generated code to each node (excluding the auto preview wrapper)
      const files: any[] = data?.files || [];
      for (const file of files) {
        if (file.nodeId && file.nodeId !== 'preview_gui_wrapper') {
          updateNodeStatus(file.nodeId, 'valid', undefined, file.code || `// Generated: ${file.fileName}`);
        }
      }

      const captured = data?.verifiedCapture?.captured ?? 0;
      const skipped = data?.verifiedCapture?.skipped ?? 0;

      // Keep the node-id mapping for the drift-repair action (regenerate the
      // missing modules individually via the per-node endpoint).
      if (Array.isArray(data?.project?.nodes)) {
        setBuiltNodes(
          (data.project.nodes as Array<{ id: string; label: string }>)
            .filter(n => n && n.id && n.label)
            .map(n => ({ id: n.id, label: n.label }))
        );
      }

      // Blueprint drift: did every module the mockup promised actually get a
      // file? Surfaces in the done screen so a silently-missing module is
      // visible instead of discovered later.
      if (data?.drift) {
        setDrift({
          expected: data.drift.expected || [],
          generated: data.drift.generated || [],
          matched: data.drift.matched || [],
          missing: data.drift.missing || [],
          unexpected: data.drift.unexpected || [],
          clean: data.drift.clean === true,
        });
      }

      // Behavioral smoke: did the assembled app actually load and respond?
      // Surfaced so a build that compiles but does not RUN is visible here.
      if (data?.smoke) {
        setSmoke({
          render: data.smoke.render ?? null,
          cli: data.smoke.cli ?? null,
          anyFailed: data.smoke.anyFailed === true,
        });
      }

      setResult({
        appType: data?.blueprint?.app_type || 'unknown',
        score: data?.matchScore ?? 0,
        files: files.filter((f: any) => f.nodeId && f.nodeId !== 'preview_gui_wrapper').length,
        captured,
        skipped,
        totalChars: data?.totalChars ?? 0,
        projectName: imported.name,
      });

      setLocalProgress(100);
      setProgress(100);
      setPhase('done');
      setStatusMsg('✅ Project loaded into the canvas with generated code attached.');

      broadcastMessage({
        role: 'ai',
        text: `🧠 Built "${imported.name}" from description → blueprint "${data?.blueprint?.app_type || 'unknown'}" (score ${(data?.matchScore ?? 0).toFixed(2)}). ${files.length} file(s) generated. Loaded into canvas.`,
        timestamp: new Date().toISOString(),
      });

      // ── Auto-export when the chat asked for it ──
      // The user said "build X and export it to my desktop", so don't make them
      // hunt for the Export button afterwards. The build cached its generation
      // server-side, so this scaffold reuses that code instead of re-running
      // the LLM for another 5+ minutes.
      if (exportRequest) {
        const appName = (exportRequest.folderName || imported.name || trimmed).slice(0, 60);
        setExportStatus('📦 Exporting the build to disk...');
        broadcastMessage({
          role: 'ai',
          text: `📦 Exporting "${appName}"…`,
          timestamp: new Date().toISOString(),
        });

        const exp = await exportBuild({
          projectId,
          appName,
          targetOS: full.targetOS || os,
          outputDir: exportRequest.outputDir,
          nodes,
          edges,
          trees: store.trees,
        });

        if (exp.success && exp.outputPath) {
          const count = (exp.files || []).length;
          setExportPath(exp.outputPath);
          setExportStatus(`✅ Exported to ${exp.outputPath} (${count} files)${exp.warning ? ` — ⚠️ ${exp.warning}` : ''}`);
          const opened = await openExportedFolder(exp.outputPath);
          broadcastMessage({
            role: 'ai',
            text: `📦 **Exported ${appName}** → \`${exp.outputPath}\` (${count} files)${exp.warning ? `\n⚠️ ${exp.warning}` : ''}${opened ? '\n📂 Opened the folder.' : ''}`,
            timestamp: new Date().toISOString(),
          });
        } else {
          setExportStatus(`❌ Export failed: ${exp.error || 'unknown error'}`);
          broadcastMessage({
            role: 'ai',
            text: `❌ Built "${appName}", but the export failed: ${exp.error || 'unknown error'}`,
            timestamp: new Date().toISOString(),
          });
        }
      }
    } catch (err: any) {
      console.error('[blueprint-dialog] Build failed:', err);
      const detail = err?.response?.data?.details || err?.message || String(err);
      setErrorMsg(detail);
      setPhase('error');
      setStatusMsg('❌ Build failed');
    } finally {
      setGenerating(false);
    }
  }, [appType, exportRequest, fastMode, importProject, language, os, setGenerating, setProgress, updateNodeStatus]);

  // ── Pre-build GUI mockup: show how the interface should look BEFORE
  // generating any code. Calls the deterministic /api/blueprint/mockup (no
  // LLM, sub-second) and displays the rendered PNG image (HTML fallback).
  const handlePreview = useCallback(async () => {
    const trimmed = goalRef.current.trim();
    if (!trimmed) {
      setErrorMsg('Please describe the app you want to build.');
      return;
    }

    setPhase('previewing');
    setErrorMsg('');
    setMockupError('');
    setDrift(null);
    setStatusMsg('🎨 Designing your GUI mockup...');

    try {
      const res = await api.blueprintMockup({
        goal: trimmed,
        targetOS: os,
        language,
        theme: mockupTheme,
        layout: mockupLayout,
        ...(appType.trim() ? { appType: appType.trim() } : {}),
      });
      const m = res.data?.mockup;
      if (!m) throw new Error('Mockup response missing data');
      setMockup({
        appType: m.appType,
        description: m.description,
        modules: m.modules || [],
        matchScore: m.matchScore ?? 0,
        imageBase64: m.imageBase64,
        html: m.html,
      });
      setStatusMsg(
        m.available
          ? '✅ GUI mockup ready — this is how the app interface should look.'
          : 'ℹ️ GUI mockup rendered (image rendering unavailable, showing HTML).'
      );
      setPhase('preview');
    } catch (err: any) {
      const detail = err?.response?.data?.error || err?.message || String(err);
      setMockupError(detail);
      setStatusMsg('❌ Could not render GUI mockup');
      setPhase('error');
    }
  }, [appType, language, os, mockupTheme, mockupLayout]);

  // ── Regenerate ONLY the drifted (missing) modules ──
  // The drift report told us which promised modules never produced a file.
  // This maps each missing module to its backend node (via project.nodes),
  // re-generates just that node through the existing per-file endpoint, and
  // updates both the canvas node code and the drift state. Only modules that
  // are actually missing get re-generated — nothing else is touched.
  const handleRegenerateMissing = useCallback(async () => {
    if (!drift || !builtProjectId || drift.missing.length === 0 || regenerating) return;

    setRegenerating(true);
    setRegenerateResults([]);
    setStatusMsg(`♻️ Re-generating ${drift.missing.length} missing module(s)...`);

    const results: Array<{ module: string; success: boolean; detail: string }> = [];
    const newlyMatched: string[] = [];

    for (const missingModule of drift.missing) {
      // Find the backend node for this module by label (trim + case-insensitive,
      // matching the drift comparison semantics).
      const node = builtNodes.find(n => n.label.trim().toLowerCase() === missingModule.trim().toLowerCase());
      if (!node) {
        results.push({ module: missingModule, success: false, detail: 'no node mapped to this module' });
        continue;
      }

      try {
        const res = await api.generateSingleFile(builtProjectId, node.id);
        const data = res.data;
        if (data?.success && data.file) {
          // Attach the freshly generated code to the canvas node (same pattern
          // as the initial build attach loop).
          updateNodeStatus(node.id, data.file.validated ? 'valid' : 'error', undefined, data.file.code || '');
          newlyMatched.push(missingModule);
          results.push({
            module: missingModule,
            success: true,
            detail: data.file.validated ? 'generated & validated' : 'generated (unvalidated)',
          });
        } else {
          results.push({ module: missingModule, success: false, detail: data?.error || 'generation failed' });
        }
      } catch (err: any) {
        results.push({ module: missingModule, success: false, detail: err?.message || String(err) });
      }
    }

    setRegenerateResults(results);
    setRegenerating(false);

    // Fold successfully regenerated modules back into the drift state so the
    // report reflects reality after the repair.
    if (newlyMatched.length > 0) {
      setDrift(prev => {
        if (!prev) return prev;
        const remaining = prev.missing.filter(m => !newlyMatched.some(nm => nm.trim().toLowerCase() === m.trim().toLowerCase()));
        return {
          ...prev,
          matched: [...prev.matched, ...newlyMatched],
          missing: remaining,
          clean: remaining.length === 0 && prev.unexpected.length === 0,
        };
      });
    }

    const ok = results.filter(r => r.success).length;
    setStatusMsg(
      ok === results.length
        ? `♻️ All ${results.length} missing module(s) regenerated.`
        : `♻️ Regenerated ${ok}/${results.length} missing module(s).`
    );
    broadcastMessage({
      role: 'ai',
      text: `♻️ Drift repair: regenerated ${ok}/${results.length} missing module(s): ${results.map(r => `${r.module} ${r.success ? '✅' : '❌'}`).join(', ')}`,
      timestamp: new Date().toISOString(),
    });
  }, [drift, builtProjectId, builtNodes, regenerating, updateNodeStatus]);

  const handleClose = useCallback(() => {
    if (socketRef.current) socketRef.current.disconnect();
    onClose();
  }, [onClose]);

  const pct = phase === 'done' ? 100 : progress;

  return (
    <div className="bp-overlay">
      <div className="bp-dialog">
        <div className="bp-header">
          <div className="bp-header-left">
            <span className="bp-icon">🧠</span>
            <span className="bp-title">Build from Description</span>
          </div>
          <button className="bp-close" onClick={handleClose} title="Close">✕</button>
        </div>

        <div className="bp-body">
          {phase === 'form' && (
            <>
              <p className="bp-hint">
                Describe the app you want to build. It will be matched against a bible of{' '}
                <strong>1,228 blueprints</strong>, turned into a node graph, and generated by the LLM.
                <br />
                <strong style={{ color: '#7dd3fc' }}>New:</strong> preview the GUI mockup first — see how it should
                look before generating any code.
              </p>

              <label className="bp-field-label">What should we build?</label>
              <textarea
                className="bp-goal-input"
                autoFocus
                placeholder="e.g. a todo list app with deadlines and priorities, or a home media server with streaming..."
                value={goal}
                onChange={(e) => { setGoal(e.target.value); setErrorMsg(''); }}
                rows={4}
              />

              <div className="bp-options-row">
                <label className="bp-field-label bp-field-small">
                  <span>Target OS</span>
                  <select value={os} onChange={(e) => setOs(e.target.value as OSType)}>
                    <option value="linux">🐧 Linux</option>
                    <option value="windows">🪟 Windows</option>
                    <option value="mac">🍎 Mac</option>
                    <option value="ios">📱 iOS</option>
                  </select>
                </label>

                <label className="bp-field-label bp-field-small">
                  <span>Language</span>
                  <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                    {LANGUAGE_OPTIONS.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="bp-field-label bp-field-small">
                <span>Blueprint override (optional)</span>
                <input
                  className="bp-text-input"
                  placeholder="e.g. todo_list — leave blank to auto-match"
                  value={appType}
                  onChange={(e) => setAppType(e.target.value)}
                />
              </label>

              <div className="bp-options-row">
                <label className="bp-field-label bp-field-small">
                  <span>Mockup Theme</span>
                  <select value={mockupTheme} onChange={(e) => setMockupTheme(e.target.value)}>
                    {MOCKUP_THEME_OPTIONS.map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                </label>
                <label className="bp-field-label bp-field-small">
                  <span>Mockup Layout</span>
                  <select value={mockupLayout} onChange={(e) => setMockupLayout(e.target.value)}>
                    {MOCKUP_LAYOUT_OPTIONS.map((l) => (
                      <option key={l.id} value={l.id}>{l.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="bp-check-row" title="Verified builds run a live tsc check and capture rows into the fine-tuning dataset (slower)">
                <input
                  type="checkbox"
                  checked={!fastMode}
                  onChange={(e) => setFastMode(!e.target.checked)}
                />
                <span>
                  <strong>Verified build</strong> — run live tsc check &amp; capture training data (slower)
                </span>
              </label>

              {errorMsg && <div className="bp-error">{errorMsg}</div>}

              <div className="bp-actions bp-actions-split">
                <button className="bp-btn bp-btn-secondary" onClick={handleClose}>Cancel</button>
                <div className="bp-actions-right">
                  <button className="bp-btn bp-btn-mockup" onClick={handlePreview} disabled={!goal.trim()}>
                    🎨 Preview GUI First
                  </button>
                  <button className="bp-btn bp-btn-primary" onClick={handleBuild} disabled={!goal.trim()}>
                    🏗️ Build &amp; Load into Canvas
                  </button>
                </div>
              </div>
            </>
          )}

          {phase === 'previewing' && (
            <div className="bp-progress-area">
              <div className="bp-progress-spinner" />
              <div className="bp-status-msg">{statusMsg}</div>
              <div className="bp-progress-track">
                <div className="bp-progress-fill bp-progress-fill-mockup" style={{ width: '60%' }} />
              </div>
              <p className="bp-wait-note">
                Deterministic preview — matching the blueprint and rendering the interface image.
              </p>
            </div>
          )}

          {phase === 'preview' && mockup && (
            <div className="bp-mockup-area">
              <div className="bp-mockup-head">
                <div className="bp-mockup-title-row">
                  <span className="bp-mockup-title">🎨 GUI Mockup — how it should look</span>
                  <span className="bp-mockup-badge">{mockup.appType}</span>
                </div>
                <div className="bp-mockup-meta">
                  <span>Blueprint match: <strong>{(mockup.matchScore * 100).toFixed(0)}%</strong></span>
                  <span>· {mockup.modules.length} module{mockup.modules.length !== 1 ? 's' : ''}</span>
                  <span>· <em>no code generated yet</em></span>
                </div>
              </div>

              <div className="bp-mockup-frame">
                {mockup.imageBase64 ? (
                  <img
                    className="bp-mockup-img"
                    src={`data:image/png;base64,${mockup.imageBase64}`}
                    alt={`GUI mockup for ${mockup.appType}`}
                  />
                ) : (
                  <iframe
                    className="bp-mockup-iframe"
                    sandbox="allow-scripts"
                    title={`GUI mockup for ${mockup.appType}`}
                    srcDoc={mockup.html}
                  />
                )}
              </div>

              <div className="bp-mockup-modules">
                {mockup.modules.slice(0, 8).map((mod) => (
                  <span key={mod} className="bp-mockup-module">{mod}</span>
                ))}
                {mockup.modules.length > 8 && <span className="bp-mockup-module">+{mockup.modules.length - 8} more</span>}
              </div>

              <p className="bp-mockup-note">
                This is a deterministic pre-build preview — not the generated app. When it looks right,
                generate the real code below.
              </p>

              {mockupError && <div className="bp-error">{mockupError}</div>}

              <div className="bp-actions">
                <button className="bp-btn bp-btn-secondary" onClick={() => { setPhase('form'); setMockup(null); }}>↩ Back</button>
                <button className="bp-btn bp-btn-mockup" onClick={handlePreview}>
                  🔄 Redesign
                </button>
                <button className="bp-btn bp-btn-primary" onClick={handleBuild}>
                  ✅ Looks Good — Generate the Code
                </button>
              </div>
            </div>
          )}

          {(phase === 'building' || phase === 'loading') && (
            <div className="bp-progress-area">
              <div className="bp-progress-spinner" />
              <div className="bp-status-msg">{statusMsg}</div>
              <div className="bp-progress-track">
                <div className="bp-progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="bp-progress-meta">
                <span>{pct}%</span>
                {liveNodes.length > 0 && <span className="bp-live-nodes">{liveNodes.join(', ')}</span>}
              </div>
              <p className="bp-wait-note">
                This can take a few minutes — the LLM is generating real code per module.
              </p>
            </div>
          )}

          {phase === 'error' && (
            <div className="bp-result-area">
              <div className="bp-result-icon bp-result-error">❌</div>
              <div className="bp-status-msg">{statusMsg}</div>
              <div className="bp-error">{errorMsg}</div>
              <div className="bp-actions">
                <button className="bp-btn bp-btn-secondary" onClick={() => { setPhase('form'); setErrorMsg(''); }}>↩ Back</button>
                <button className="bp-btn bp-btn-primary" onClick={handleClose}>Close</button>
              </div>
            </div>
          )}

          {phase === 'done' && result && (
            <div className="bp-result-area">
              <div className="bp-result-icon">✅</div>
              <div className="bp-result-title">Project loaded into the canvas</div>
              <div className="bp-status-msg">{statusMsg}</div>

              <div className="bp-stats">
                <div className="bp-stat">
                  <span className="bp-stat-value">{result.appType}</span>
                  <span className="bp-stat-label">Matched blueprint</span>
                </div>
                <div className="bp-stat">
                  <span className="bp-stat-value">{result.score.toFixed(2)}</span>
                  <span className="bp-stat-label">Match score</span>
                </div>
                <div className="bp-stat">
                  <span className="bp-stat-value">{result.files}</span>
                  <span className="bp-stat-label">Files generated</span>
                </div>
                <div className="bp-stat">
                  <span className="bp-stat-value">{(result.totalChars / 1024).toFixed(1)}K</span>
                  <span className="bp-stat-label">Chars of code</span>
                </div>
                {result.captured > 0 && (
                  <div className="bp-stat bp-stat-gold">
                    <span className="bp-stat-value">+{result.captured}</span>
                    <span className="bp-stat-label">Training rows captured</span>
                  </div>
                )}
                {result.skipped > 0 && (
                  <div className="bp-stat">
                    <span className="bp-stat-value">{result.skipped}</span>
                    <span className="bp-stat-label">Skipped (not verified)</span>
                  </div>
                )}
              </div>

              {smoke && (
                <div className={`bp-smoke bp-smoke-${smoke.anyFailed ? 'fail' : 'ok'}`}>
                  <span className="bp-smoke-title">
                    {smoke.anyFailed ? '⚠️ Behavioral smoke failed' : '✅ Behavioral smoke passed'}
                  </span>
                  <span className="bp-smoke-detail">
                    render: {smoke.render?.status ?? 'n/a'}
                    {smoke.cli && smoke.cli.status !== 'skipped' ? ` · cli: ${smoke.cli.status}` : ''}
                  </span>
                </div>
              )}

              {drift && (
                <div className={`bp-drift bp-drift-${drift.clean ? 'clean' : 'drift'}`}>
                  <div className="bp-drift-head">
                    <span className="bp-drift-title">
                      {drift.clean ? '✅ Mockup ↔ Build in sync' : '⚠️ Blueprint drift detected'}
                    </span>
                    <span className="bp-drift-count">
                      {drift.matched.length}/{drift.expected.length} promised module{drift.expected.length !== 1 ? 's' : ''} generated
                    </span>
                  </div>
                  {drift.clean ? (
                    <p className="bp-drift-note">
                      Every module shown in the GUI mockup produced a file — the preview matched the final build.
                    </p>
                  ) : (
                    <>
                      {drift.missing.length > 0 && (
                        <div className="bp-drift-group">
                          <span className="bp-drift-group-label">Missing (promised but no file):</span>
                          <div className="bp-drift-chips">
                            {drift.missing.map(m => (
                              <span key={m} className="bp-drift-chip bp-drift-chip-missing">{m}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {drift.unexpected.length > 0 && (
                        <div className="bp-drift-group">
                          <span className="bp-drift-group-label">Unexpected files (not in the mockup):</span>
                          <div className="bp-drift-chips">
                            {drift.unexpected.map(m => (
                              <span key={m} className="bp-drift-chip bp-drift-chip-unexpected">{m}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      <p className="bp-drift-note">
                        The preview showed {drift.expected.length} module{drift.expected.length !== 1 ? 's' : ''};
                        {drift.missing.length > 0 ? ` ${drift.missing.length} never generated a file` : ''}
                        {drift.missing.length > 0 && drift.unexpected.length > 0 ? ' and' : ''}
                        {drift.unexpected.length > 0 ? ` ${drift.unexpected.length} file${drift.unexpected.length !== 1 ? 's' : ''} came out of nowhere` : ''}.
                      </p>

                      {drift.missing.length > 0 && builtProjectId && (
                        <div className="bp-drift-repair">
                          <button
                            className="bp-btn bp-btn-regenerate"
                            onClick={handleRegenerateMissing}
                            disabled={regenerating}
                          >
                            {regenerating ? '⏳ Re-generating...' : `♻️ Regenerate ${drift.missing.length} Missing Module${drift.missing.length !== 1 ? 's' : ''}`}
                          </button>
                          {regenerateResults.length > 0 && (
                            <div className="bp-regenerate-results">
                              {regenerateResults.map(r => (
                                <div key={r.module} className={`bp-regenerate-row ${r.success ? 'ok' : 'fail'}`}>
                                  <span className="bp-regenerate-icon">{r.success ? '✅' : '❌'}</span>
                                  <span className="bp-regenerate-module">{r.module}</span>
                                  <span className="bp-regenerate-detail">{r.detail}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Export was requested from the chat ("build X and export it to
                  my desktop") — report where it landed, with a shortcut to
                  open the folder. */}
              {exportRequest && (
                <div
                  className="bp-drift"
                  style={{
                    marginTop: 12,
                    borderColor: exportPath ? '#2e7d32' : exportStatus.startsWith('❌') ? '#c62828' : '#455a64',
                  }}
                >
                  <div className="bp-drift-head">
                    <span className="bp-drift-title">
                      {exportPath ? '📦 Exported to disk' : '📦 Export'}
                    </span>
                  </div>
                  <p className="bp-drift-note" style={{ wordBreak: 'break-all' }}>
                    {exportStatus || 'Waiting for the build to finish…'}
                  </p>
                  {exportPath && (
                    <div className="bp-drift-repair">
                      <button
                        className="bp-btn bp-btn-secondary"
                        onClick={() => { void openExportedFolder(exportPath); }}
                      >
                        📂 Open Folder
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="bp-actions">
                <button className="bp-btn bp-btn-primary" onClick={handleClose}>Done — View in Canvas</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
