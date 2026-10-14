import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { NodeType, WizardStep } from './types';
import { useProjectStore } from './store/projectStore';
import { useRoadmapSync } from './hooks/useRoadmapSync';
import { useAutoSave } from './hooks/useAutoSave';
import { usePlanAutosave } from './hooks/usePlanAutosave';
import { usePlanCoworker } from './hooks/usePlanCoworker';
import { useIsMobile } from './hooks/useIsMobile';
import { api } from './api/client';
import { checkBackendConnection } from './utils/apiUrl';
import { useToolManifest } from './utils/useToolManifest';
import { nodeDatabase } from './utils/nodeDatabase';
import NodePalette from './components/NodePalette';
import Toolbar from './components/Toolbar';
const Canvas = lazy(() => import('./components/Canvas'));
import RoadmapDocked from './components/RoadmapDocked';
import NodeLogicEditor from './components/NodeLogicEditor';
import ReasoningPanel from './components/ReasoningPanel';
import CodeOutputPanel from './components/CodeOutputPanel';
import ProjectManager from './components/ProjectManager';
import AutoSavePanel from './components/AutoSavePanel';
import ErrorBoundary from './components/ErrorBoundary';
import EQIndicator from './components/EQIndicator';
import VeronicaLLMIndicator from './components/VeronicaLLMIndicator';
import ContextStatusBar from './components/ContextStatusBar';
import FileDropHandler from './components/FileDropHandler';
import GlobalShortcuts from './components/GlobalShortcuts';
import UserNamePrompt, { useUserName } from './components/UserNamePrompt';
import ReviewPanel from './components/ReviewPanel';
import SandboxPreview from './components/SandboxPreview';
import LivePreviewPanel from './components/LivePreviewPanel';
import FloatingPreviewWindow from './components/FloatingPreviewWindow';
import MockupPreviewPanel, { MockupPreviewData } from './components/MockupPreviewPanel';
import SessionHistoryPanel from './components/SessionHistoryPanel';
import WikiPanel from './components/WikiPanel';
import TodoPanel from './components/TodoPanel';
import ExportDialog from './components/ExportDialog';
import PlanPanel from './components/PlanPanel';
import BlueprintBuildDialog from './components/BlueprintBuildDialog';
import ProjectHistory from './components/ProjectHistory';
import ReferenceLibrary from './components/ReferenceLibrary';
import LLMSelector from './components/LLMSelector';
import { useTheme } from './hooks/useTheme';
import { broadcastStatus } from './utils/statusSync';
import { loadDismissedPreviewKeys, persistDismissedPreviewKey } from './utils/previewToastPrefs';
import { broadcastMessage } from './utils/terminalSync';
import { autoLearn } from './utils/autoLearn';
import { userProfile } from './utils/userProfile';
import { saveRoadmap } from './utils/roadmapStorage';
import { getSharedEmotion, subscribeSharedEmotion } from './utils/emotionEngine';
import EmotionDropdown from './components/EmotionDropdown';
import { hasSeenTutorial } from './utils/tutorialUtils';
import './App.css';

const HelpPanel = lazy(() => import('./components/HelpPanel'));
const TutorialOverlay = lazy(() => import('./components/TutorialOverlay'));

function LazyFallback() {
  return <div style={{ display:'none' }} />;
}

const STEP_LABELS: Record<WizardStep, string> = {
  welcome: '💡 Idea',
  searching: '🔍 Search',
  'select-design': '🎯 Pick',
  'building-nodes': '🏗️ Build',
  'filling-nodes': '✏️ Fill',
  'code-gen': '⚡ Code',
  sandbox: '🧪 Test',
  review: '📋 Review',
  saving: '💾 Save',
  complete: '✅ Done',
};

function ConnectionIndicator() {
  const [status, setStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [backendUrl, setBackendUrlState] = useState('');
  const isCapacitor = typeof (window as any).Capacitor !== 'undefined' || navigator.userAgent.includes('Capacitor');
  const checkConnection = useCallback(async () => {
    setStatus('checking');
    const ok = await checkBackendConnection();
    setStatus(ok ? 'connected' : 'disconnected');
    setBackendUrlState(localStorage.getItem('vaia-backend-url') || '');
  }, []);
  useEffect(() => {
    checkConnection();
    if (isCapacitor) {
      const interval = setInterval(checkConnection, 15000);
      return () => clearInterval(interval);
    }
  }, [checkConnection, isCapacitor]);
  if (!isCapacitor && status === 'connected') return null;
  const color = status === 'connected' ? '#4ade80' : status === 'checking' ? '#f59e0b' : '#ef4444';
  const label = status === 'connected' ? '📡 Connected' : status === 'checking' ? '📡 Checking...' : '📡 Disconnected';
  return (
    <div title={isCapacitor ? `Backend: ${backendUrl || 'Not configured'}` : 'Backend status'} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600, color, border: `1px solid ${color}`, background: `${color}11`, borderRadius: 0, cursor: 'default', whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: status === 'connected' ? `0 0 6px ${color}` : 'none', animation: status === 'checking' ? 'pulse 1s ease-in-out infinite' : 'none' }} />
      {label}
    </div>
  );
}

function App() {
  useRoadmapSync();
  useAutoSave();
  // Big Plan Mode: keeps the design saved to data/plans/<project>/ every 5
  // minutes, and creates it as soon as the master node is placed.
  usePlanAutosave();
  usePlanCoworker();
  useTheme();
  useToolManifest();
  const isMobile = useIsMobile();

  useEffect(() => {
    fetch('/api/config/tts').then(r => r.json()).then(d => {
      if (d.success && d.config) {
        const c = d.config;
        if (c.voice) localStorage.setItem('tts-voice', c.voice);
        if (c.speed != null) localStorage.setItem('tts-speed', String(c.speed));
        if (c.pitch != null) localStorage.setItem('tts-pitch', String(c.pitch));
        if (c.volume != null) localStorage.setItem('tts-volume', String(c.volume));
      }
    }).catch(() => {});
  }, []);

  const [sidebarCollapsed, setSidebarCollapsed] = useState<Record<string, boolean>>(() => {
    try { const saved = localStorage.getItem('sidebar-collapsed'); if (saved) return JSON.parse(saved); } catch {}
    return { right: false, nodePalette: false, roadmap: false, llm: false };
  });
  const toggleSidebar = (key: string) => {
    setSidebarCollapsed(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem('sidebar-collapsed', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const [mobilePanel, setMobilePanel] = useState<'none' | 'palette' | 'roadmap' | 'terminals'>('none');

  const { name: userName, setName: setUserName } = useUserName();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [showTutorial, setShowTutorial] = useState(() => !hasSeenTutorial());
  const [genStatus, setGenStatus] = useState('');
  const [isDraggingDivider, setIsDraggingDivider] = useState(false);
  const [previewTab, setPreviewTab] = useState<'live' | 'sandbox'>('sandbox');
  const [floatingPreviewOpen, setFloatingPreviewOpen] = useState(false);

  // ── What the floating preview window shows ──
  // 'live'            → LivePreviewPanel (the real generated app / dropped site)
  // 'mockup'          → MockupPreviewPanel (deterministic planned-interface
  //                     mockup, shown when nothing has been generated yet)
  // 'session-history' → SessionHistoryPanel (conversation / builds / sessions)
  // 'wiki'            → WikiPanel (modelVeronice.txt)
  // 'todo'            → TodoPanel (TODO fixes.txt)
  const [previewMode, setPreviewMode] = useState<'live' | 'mockup' | 'session-history' | 'wiki' | 'todo'>('live');
  const [mockupData, setMockupData] = useState<MockupPreviewData | null>(null);
  const [mockupLoading, setMockupLoading] = useState(false);
  const [mockupError, setMockupError] = useState('');
  // The description this mockup was designed from — needed by the panel's
  // "⚡ Build This Now" to pass the goal into the blueprint build.
  const [mockupGoal, setMockupGoal] = useState('');
  const [mockupPurpose, setMockupPurpose] = useState('');

  // ── Toast explaining why the "Planned Interface" window appeared ──
  const [previewToast, setPreviewToast] = useState<string | null>(null);
  const previewToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Per-preview gating so the toast only shows once per session per preview
  // (keyed by blueprint appType): an in-memory seen-set for the current session
  // plus the persisted ✕-dismissed set that survives reloads.
  const dismissedToastKeysRef = useRef<Set<string>>(loadDismissedPreviewKeys());
  const seenToastKeysRef = useRef<Set<string>>(new Set());

  // ── Open the floating preview automatically when a dropped folder is served
  //    as a playable site (set by FileDropHandler → store). ──
  const sitePreviewUrl = useProjectStore(s => s.sitePreviewUrl);
  useEffect(() => {
    if (sitePreviewUrl) {
      setFloatingPreviewOpen(true);
      setPreviewMode('live');
    }
  }, [sitePreviewUrl]);

  // ── Smart preview: the chat's "show me a preview" button ──
  // If the app is already built (site preview URL or any node with generated
  // code), show the live preview. Otherwise generate a deterministic GUI
  // mockup of how the interface should look and show THAT instead — no code
  // exists yet, so a live preview would be empty.
  // ── "⚡ Build This Now" from the mockup preview: close the floating window
  //    and open the pre-filled blueprint build dialog (which auto-starts). ──
  const blueprintRequestToken = useProjectStore(s => s.blueprintRequestToken);
  const blueprintRequestGoal = useProjectStore(s => s.blueprintRequestGoal);
  useEffect(() => {
    if (blueprintRequestToken === 0) return;
    setFloatingPreviewOpen(false);
    setBlueprintDialogOpen(true);
  }, [blueprintRequestToken]);

  // ── Toast when the planned-interface mockup appears (auto-opened from the
  //    chat or via Show Preview on a not-yet-built app): explains what the
  //    window is, since it may have opened without the user asking. Shows at
  //    most once per session per preview; an explicit ✕ dismissal persists
  //    so that preview never nags again. ──
  useEffect(() => {
    const key = mockupData?.appType || '';
    if (previewMode === 'mockup' && mockupData && !mockupLoading && key) {
      if (dismissedToastKeysRef.current.has(key) || seenToastKeysRef.current.has(key)) {
        setPreviewToast(null);
        return;
      }
      seenToastKeysRef.current.add(key);
      setPreviewToast(
        '🎨 Opened a GUI preview of how your app will look — click ⚡ Build This Now to generate the code.'
      );
      if (previewToastTimerRef.current) clearTimeout(previewToastTimerRef.current);
      previewToastTimerRef.current = setTimeout(() => setPreviewToast(null), 6000);
    } else {
      // Live preview, session history, or nothing — no mockup toast.
      setPreviewToast(null);
    }
    return () => {
      if (previewToastTimerRef.current) clearTimeout(previewToastTimerRef.current);
    };
  }, [previewMode, mockupData, mockupLoading]);

  const dismissPreviewToast = () => {
    const key = mockupData?.appType || '';
    if (key) persistDismissedPreviewKey(key, dismissedToastKeysRef.current);
    setPreviewToast(null);
  };

  // ── Session history: the chat's "show me the session history" (auto-detected)
  //    and the 📜 button on AI messages open the floating window in
  //    'session-history' mode — a real view of past sessions/builds, instead of
  //    the chat just claiming one. ──
  const sessionHistoryRequestToken = useProjectStore(s => s.sessionHistoryRequestToken);
  useEffect(() => {
    if (sessionHistoryRequestToken === 0) return;
    setFloatingPreviewOpen(true);
    setPreviewMode('session-history');
  }, [sessionHistoryRequestToken]);

  // ── Wiki: the chat's "show your wiki" (auto-detected) and the 📗 button on
  //    AI messages open a REAL view of modelVeronice.txt. ──
  const wikiRequestToken = useProjectStore(s => s.wikiRequestToken);
  useEffect(() => {
    if (wikiRequestToken === 0) return;
    setFloatingPreviewOpen(true);
    setPreviewMode('wiki');
  }, [wikiRequestToken]);

  // ── Todo: the chat's "open the todo list" (auto-detected) and the 📋 button
  //    on AI messages open a REAL view of TODO fixes.txt. ──
  const todoRequestToken = useProjectStore(s => s.todoRequestToken);
  useEffect(() => {
    if (todoRequestToken === 0) return;
    setFloatingPreviewOpen(true);
    setPreviewMode('todo');
  }, [todoRequestToken]);

  const previewRequestToken = useProjectStore(s => s.previewRequestToken);
  useEffect(() => {
    if (previewRequestToken === 0) return;
    setFloatingPreviewOpen(true);

    const st = useProjectStore.getState();
    const hasLivePreview =
      !!st.sitePreviewUrl || st.nodes.some(n => n.data?.generatedCode);
    if (hasLivePreview) {
      setPreviewMode('live');
      return;
    }

    const goal =
      st.previewRequestGoal?.trim() || st.userGoal?.trim() || st.projectName?.trim();
    if (!goal) {
      setPreviewMode('mockup');
      setMockupData(null);
      setMockupError(
        'No app has been generated yet and there is no description to design a mockup from. Describe your app in the chat or the wizard first.'
      );
      return;
    }

    setPreviewMode('mockup');
    setMockupLoading(true);
    setMockupError('');
    setMockupGoal(goal);
    setMockupPurpose(st.userPurpose?.trim() || '');
    fetch('/api/blueprint/mockup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal,
        purpose: st.userPurpose?.trim() || undefined,
        targetOS: st.targetOS || 'linux',
      }),
      signal: AbortSignal.timeout(30000),
    })
      .then(async (res) => {
        const payload = await res.json();
        const m = payload?.mockup;
        if (!res.ok || !m) throw new Error(payload?.error || 'Could not render GUI mockup');
        setMockupData({
          appType: m.appType,
          matchScore: m.matchScore ?? 0,
          modules: m.modules || [],
          imageBase64: m.imageBase64,
          html: m.html,
        });
      })
      .catch((err: any) => setMockupError(err?.message || String(err)))
      .finally(() => setMockupLoading(false));
  }, [previewRequestToken]);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [blueprintDialogOpen, setBlueprintDialogOpen] = useState(false);
  const terminalsRef = useRef<HTMLDivElement>(null);
  const [sharedEmotion, setSharedEmotionState] = useState(() => getSharedEmotion());

  useEffect(() => subscribeSharedEmotion(() => setSharedEmotionState(getSharedEmotion())), []);

  const handleLogout = () => {
    localStorage.removeItem('vaia-user-name');
    window.location.reload();
  };

  const state = useProjectStore();
  const {
    wizardStep, setWizardStep,
    userGoal, userPurpose,
    roadmapDetached, setRoadmapDetached,
    clearProject, setGenerating, setGenerationLayer, updateNodeStatus,
    nodes, projectName, targetOS, edges, saveProject,
    thinking, progress,
  } = state;

  const codeNodes = nodes.filter(n => n.type !== 'master');

  // ── Watch for code-gen step transition ──
  const prevStepRef = useRef<WizardStep>(wizardStep);
  useEffect(() => {
    if (prevStepRef.current !== 'code-gen' && wizardStep === 'code-gen') {
      handleGenerate(false);
    }
    prevStepRef.current = wizardStep;
  }, [wizardStep]);

  useEffect(() => { broadcastStatus({ thinking, progress }); }, [thinking, progress]);

  // ── Socket.IO listener for generation/architect progress ──
  const { setProgress } = state;
  const socketRef = useRef<Socket | null>(null);
  useEffect(() => {
    if (socketRef.current?.connected) return;

    socketRef.current = io({
      path: '/ws',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
    });

    socketRef.current.on('architect_progress', (data: { phase: string; message: string; percent: number }) => {
      setProgress(data.percent);
      setGenStatus(data.message);
    });

    socketRef.current.on('generation_progress', (data: {
      batch: number;
      totalBatches: number;
      generatingNodes: string[];
      percent: number;
      phase: string;
    }) => {
      setProgress(data.percent);
      if (data.generatingNodes.length > 0) {
        const files = data.generatingNodes.join(', ');
        setGenStatus(`📦 Batch ${data.batch + 1}/${data.totalBatches}: ${files}`);
      } else {
        setGenStatus(data.phase === 'done' ? '✅ Generation complete' : `⚡ Generating... (${data.percent}%)`);
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [setProgress]);

  const handleDragStart = (event: React.DragEvent, nodeType: NodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleGenerate = useCallback(async (openFloatingPreview = false) => {
    if (codeNodes.length === 0) {
      alert('Please set up nodes first via the blueprint node.');
      return;
    }

    // Record project in user profile
    const styleTags = codeNodes.map(n => n.type || 'logic').filter((v, i, a) => a.indexOf(v) === i);
    styleTags.forEach(tag => userProfile.recordStyleTag(tag));
    userProfile.recordProject({
      id: `proj_${Date.now()}`,
      name: projectName,
      nodeCount: codeNodes.length,
      styleTags,
    });
    userProfile.syncToBackend();

    autoLearn.projectEvent('created', projectName, codeNodes.length);

    setGenerating(true);
    setGenerationLayer(1);
    setGenStatus('Starting code generation...');

    const saved = saveProject();
    if (!saved) { setGenerating(false); return; }

    broadcastMessage({ role: 'ai', text: '⚡ Starting code generation...', timestamp: new Date().toISOString() });

    try {
      const createRes = await api.createProject({ name: projectName, targetOS });
      const serverProjectId = createRes.data.id;
      localStorage.setItem('current-project-id', serverProjectId);
      await api.updateProject(serverProjectId, { nodes: codeNodes, edges });

      broadcastMessage({ role: 'ai', text: `🧠 Reasoning LLM planning ${codeNodes.length} nodes...`, timestamp: new Date().toISOString() });

      const masterNode = nodes.find(n => n.type === 'master');
      const goal = masterNode?.data?.appGoal || userGoal || '';
      const purpose = masterNode?.data?.appPurpose || userPurpose || '';

      const profile = userProfile.get();
      const profileContext = profile.history.projects.length > 0
        ? `\nUser's past projects: ${profile.history.projects.map(p => p.name).join(', ')}`
        : '';
      const styleContext = userProfile.getTopStyleTags(3).length > 0
        ? `\nUser prefers these node types: ${userProfile.getTopStyleTags(3).join(', ')}`
        : '';
      const includeGUI = useProjectStore.getState().includeGUI;
      const activeNodes = includeGUI
        ? codeNodes
        : codeNodes.filter(n => n.type !== 'ui' && n.type !== 'ui-functions');

      const planPrompt = `Create a code generation plan for this app:
Goal: ${goal || projectName}
Purpose: ${purpose}
Target OS: ${targetOS}
${includeGUI ? 'Build type: With GUI' : 'Build type: CLI / API Only (no GUI)'}
Preferred framework: ${profile.preferences.framework}
Preferred languages: ${profile.preferences.preferredLanguages.join(', ')}${profileContext}${styleContext}
Nodes to implement:
${activeNodes.map(n => `- ${n.data?.label || n.id} (${n.type}, ${n.data?.language || 'typescript'}): ${n.data?.description || 'No description'}`).join('\n')}
For each node, specify the key functions, classes, or modules needed. Keep it brief.`;

      try {
        const planRes = await fetch('/api/reason', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: planPrompt, system: 'You are a code architecture planner. List what each node needs in terms of code. Be concise.', maxTokens: 512 }),
          signal: AbortSignal.timeout(15000),
        });
        if (planRes.ok) {
          const planData = await planRes.json();
          broadcastMessage({ role: 'ai', text: `📋 Generation Plan:\n${planData.response || 'Plan generated.'}`, timestamp: new Date().toISOString() });
        }
      } catch { /* plan is optional */ }

      setGenerationLayer(2);
      setGenStatus('🧠 Multi-model: generating files with 7B + fast coder delegation...');

      // Use the per-file generation pipeline which automatically routes simple files
      // to the fast coder models (0.5B GPU1 → 1.5B GPU0 → 0.5B CPU) and complex
      // logic to the primary 7B delegator model.
      const res = await api.generateFiles(serverProjectId, { 
        skipValidation: true, 
        skipSecurityScan: true 
      });
      const files = res.data?.files || [];
      // Filter out the auto-generated preview wrapper — it's not a user node
      const generatedNodes = files.filter((f: any) => f.nodeId && f.nodeId !== 'preview_gui_wrapper');

      setGenStatus(`⚡ ${generatedNodes.length} files generated by delegated models...`);
      
      // Update each node with its own per-file generated code
      for (const file of generatedNodes) {
        const nodeLabel = file.nodeLabel || file.fileName;
        broadcastMessage({ 
          role: 'ai', 
          text: `🔧 ${nodeLabel} generated (${file.code.length} chars)`, 
          timestamp: new Date().toISOString() 
        });
        updateNodeStatus(file.nodeId, 'valid', undefined, file.code || `// Generated: ${file.fileName}`);
        
        const matchingNode = activeNodes.find(n => n.id === file.nodeId);
        nodeDatabase.learnFromNode({
          type: matchingNode?.type || 'logic',
          label: nodeLabel,
          description: nodeLabel,
          language: file.language || 'typescript',
        });
        
        autoLearn.codeGeneration(nodeLabel, file.language || 'typescript', file.code);
      }

      useProjectStore.getState().setProgress(100);
      setGenStatus(`✅ Generated ${generatedNodes.length} files via multi-model pipeline (7B + fast coders)`);

      setGenerationLayer(3);
      setGenStatus('');
      broadcastMessage({ role: 'ai', text: '✅ Code generation complete!', timestamp: new Date().toISOString() });

      saveRoadmap(projectName, targetOS, nodes, edges);
      if (openFloatingPreview) {
        setFloatingPreviewOpen(true);
      } else {
        setWizardStep('sandbox');
      }
      fetch('/api/memory/build', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, targetOS, nodeCount: codeNodes.length, edgeCount: edges.length, filesCreated: [] }),
      }).catch(() => {});
    } catch {
      console.warn('Backend unavailable — using simulated generation');
      broadcastMessage({ role: 'ai', text: '⚠️ Backend unavailable. Running simulated generation...', timestamp: new Date().toISOString() });

      for (let phase = 1; phase <= 3; phase++) {
        setGenerationLayer(phase);
        for (const node of codeNodes) {
          updateNodeStatus(node.id, 'generating');
          const nodeLabel = node.data?.label || node.id;
          setGenStatus(`Simulating ${nodeLabel} (phase ${phase}/3)...`);
          broadcastMessage({ role: 'ai', text: `🔧 Generating ${nodeLabel} (phase ${phase}/3)...`, timestamp: new Date().toISOString() });
          await new Promise(resolve => setTimeout(resolve, 600));
          updateNodeStatus(node.id, 'valid', undefined, `// Generated code for ${nodeLabel}\n// Description: ${node.data?.description || ''}\nconsole.log("Generated code for ${nodeLabel}");`);
          nodeDatabase.learnFromNode({
            type: node.type || 'logic',
            label: nodeLabel,
            description: node.data?.description || '',
            language: node.data?.language,
          });
          autoLearn.codeGeneration(nodeLabel, node.data?.language || 'typescript', `// Generated code for ${nodeLabel}`);
        }
      }
      setGenStatus('');
      broadcastMessage({ role: 'ai', text: '✅ Simulated code generation complete.', timestamp: new Date().toISOString() });
      saveRoadmap(projectName, targetOS, nodes, edges);
      if (openFloatingPreview) {
        setFloatingPreviewOpen(true);
      } else {
        setWizardStep('sandbox');
      }
      fetch('/api/memory/build', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, targetOS, nodeCount: codeNodes.length, edgeCount: edges.length, filesCreated: [] }),
      }).catch(() => {});
    }
    setGenerating(false);
  }, [codeNodes, nodes, edges, projectName, targetOS, saveProject, setGenerating, setGenerationLayer, updateNodeStatus, userGoal, userPurpose, setWizardStep, setFloatingPreviewOpen]);

  const handleRegenerate = useCallback(async () => {
    userProfile.recordFeedback(codeNodes.length > 0 ? `proj_${Date.now()}` : 'unknown', 3, 'Regenerated — needed improvement');
    const tags = codeNodes.map(n => n.type || 'logic').filter((v, i, a) => a.indexOf(v) === i);
    tags.forEach(tag => userProfile.recordStyleTag(`${tag}-needs-work`));
    userProfile.syncToBackend();
    autoLearn.record('feedback', `User regenerated project ${projectName} — nodes: ${codeNodes.length}`, { outcome: 'needs-improvement' });
    setWizardStep('code-gen');
  }, [setWizardStep, codeNodes, projectName]);

  const handleApproveAndSave = useCallback(async () => {
    setWizardStep('saving');
    broadcastMessage({ role: 'ai', text: '💾 Saving design to library...', timestamp: new Date().toISOString() });

    try {
      const goal = userGoal || nodes.find(n => n.type === 'master')?.data?.appGoal || projectName;
      const roadmap = `App: ${projectName}
Target OS: ${targetOS}
Nodes:
${codeNodes.map(n => `- ${n.data?.label || n.id} (${n.type}): ${n.data?.description || ''}`).join('\n')}
Connections: ${edges.length}`;

      const profileTags = codeNodes.map(n => n.type || 'logic').filter((v, i, a) => a.indexOf(v) === i);
      const projectId = `proj_${Date.now()}`;
      profileTags.forEach(tag => userProfile.recordStyleTag(tag));
      userProfile.recordProject({
        id: projectId,
        name: projectName,
        nodeCount: codeNodes.length,
        styleTags: profileTags,
        rating: 5,
      });
      userProfile.recordFeedback(projectId, 5, 'Approved and saved');
      userProfile.syncToBackend();

      autoLearn.designSaved(projectName, codeNodes.length, roadmap);

      const designRes = await fetch('/api/designs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectName,
          goal,
          purpose: userPurpose || nodes.find(n => n.type === 'master')?.data?.appPurpose || '',
          targetOS,
          nodes: codeNodes.map(n => ({
            label: n.data?.label || n.id,
            type: n.type,
            description: n.data?.description || '',
            language: n.data?.language || 'typescript',
            position: n.position,
            generatedCode: n.data?.generatedCode || '',
          })),
          edges: edges.map(e => ({ source: e.source, target: e.target })),
          roadmap,
          tags: codeNodes.map(n => n.type || 'logic').filter((v, i, a) => a.indexOf(v) === i),
        }),
      });
      await designRes.json();

      broadcastMessage({ role: 'ai', text: '📊 Generating LLM training datasheet...', timestamp: new Date().toISOString() });

      const dsRes = await fetch('/api/training/generate-datasheet-from-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          design: {
            name: projectName,
            goal,
            nodes: codeNodes.map(n => ({
              label: n.data?.label || n.id,
              type: n.type,
              description: n.data?.description || '',
              language: n.data?.language || 'typescript',
              generatedCode: n.data?.generatedCode || '',
            })),
          },
        }),
      });
      const dsData = await dsRes.json();

      autoLearn.projectEvent('completed', projectName, codeNodes.length);

      broadcastMessage({ role: 'ai', text: dsData.message || '✅ Training datasheet created!', timestamp: new Date().toISOString() });
    } catch (err) {
      console.error('Save error:', err);
      broadcastMessage({ role: 'ai', text: '⚠️ Error saving design. Local copy preserved.', timestamp: new Date().toISOString() });
    }

    setWizardStep('complete');
  }, [projectName, targetOS, codeNodes, edges, userGoal, userPurpose, nodes, setWizardStep]);

  const handleStartNew = useCallback(() => {
    clearProject();
    setWizardStep('welcome');
    const profile = userProfile.get();
    const suggestions = userProfile.getStyleSuggestions();
    if (profile.preferences.uiTheme !== 'auto') {
      document.documentElement.setAttribute('data-theme', profile.preferences.uiTheme);
    }
    broadcastMessage({
      role: 'ai',
      text: `🔄 Starting new project. ${suggestions.tags.length > 0 ? `Based on past projects, you tend to use: ${suggestions.tags.join(', ')}. ` : ''}Let me know what you'd like to build!`,
      timestamp: new Date().toISOString(),
    });
  }, [clearProject, setWizardStep]);

  const handleBuild = useCallback(async () => {
    await handleGenerate(true);
  }, [handleGenerate]);

  const handleExport = useCallback(() => {
    setExportDialogOpen(true);
  }, []);

  const handleClear = useCallback(() => {
    if (confirm('Are you sure you want to clear the entire project?')) {
      clearProject();
      setWizardStep('welcome');
    }
  }, [clearProject, setWizardStep]);

  const wizardSteps: WizardStep[] = ['welcome', 'searching', 'select-design', 'building-nodes', 'filling-nodes', 'code-gen', 'sandbox', 'review', 'saving', 'complete'];
  const currentStepIndex = wizardSteps.indexOf(wizardStep);

  return (
    <ErrorBoundary>
    <div className="app" data-mobile={isMobile ? 'true' : 'false'}>
      <header className="app-header">
        <div className="header-group">
          <ConnectionIndicator />
          {isMobile && <span style={{fontSize:10,color:'#00d9ff',fontWeight:600,marginLeft:4}}>📱</span>}
        </div>
        <div className="header-group" style={{ justifyContent: 'center' }}>
          <h1 className="app-title">🚀 Veronica</h1>
          <EmotionDropdown lastEmotion={sharedEmotion} />
          <EQIndicator />
          <VeronicaLLMIndicator />
        </div>
        <div className="header-divider" />
        <div className="header-group">
          <Toolbar
            onGenerate={handleGenerate}
            onBuild={handleBuild}
            onExport={handleExport}
            onClear={handleClear}
            onPlan={() => {
              // Plan Mode is the canvas-first flow now. The button used to open
              // the notepad modal (data/plans/<name>.txt), which nothing ever
              // read back. It now toggles the mode: the palette offers the seed
              // node, drops open the type/language window, and the co-pilot
              // reads the resulting graph. getState() keeps this handler free of
              // stale-closure risk inside the memoised header.
              const next = !useProjectStore.getState().planMode;
              useProjectStore.getState().setPlanMode(next);
              if (next) setPlanOpen(false);
            }}
            onBlueprint={() => setBlueprintDialogOpen(true)}
          />
        </div>
        <div className="header-divider" />
        <div className="header-group">
          <AutoSavePanel />
        </div>
        <div className="header-divider" />
        <div className="header-group">
          <ProjectManager />
        </div>
        <div className="header-divider" />
        <div className="header-group" style={{gap:"4px", flexWrap:"wrap"}}>
          <button onClick={() => setWizardStep('welcome')} title="Start new project wizard" style={{padding:"4px 8px",background:"rgba(74,222,128,0.15)",border:"1px solid #4ade80",borderRadius:0,color:"#4ade80",cursor:"pointer",fontSize:"0.75rem",fontWeight:600}}>✨ New Design</button>
          <button onClick={() => setLibraryOpen(!libraryOpen)} style={{ background: libraryOpen ? '#a78bfa' : 'rgba(167,139,250,0.15)', border: '1px solid #a78bfa', borderRadius: 0, color: libraryOpen ? '#fff' : '#a78bfa', cursor: 'pointer', fontSize: 12, padding: '4px 8px', lineHeight: '1.4', fontWeight: 600, whiteSpace: 'nowrap' }} title="Reference Library">📚 Library</button>
          <button
            onClick={() => setFloatingPreviewOpen(prev => !prev)}
            style={{
              border: `1px solid ${floatingPreviewOpen ? '#4a9eff' : 'rgba(74,158,255,0.3)'}`,
              borderRadius: 0, padding: '6px 10px', fontSize: 12,
              fontFamily: 'var(--font-sans)',
              background: floatingPreviewOpen ? 'rgba(74,158,255,0.2)' : 'transparent',
              color: floatingPreviewOpen ? '#60a5fa' : 'var(--color-text-secondary)',
              cursor: 'pointer', whiteSpace: 'nowrap'
            }}
            title="Floating Preview Window"
          >🖥 Preview</button>
          <button onClick={() => setHistoryOpen(!historyOpen)} style={{ background: historyOpen ? '#3b82f6' : 'rgba(59,130,246,0.15)', border: '1px solid #3b82f6', borderRadius: 0, color: historyOpen ? '#fff' : '#3b82f6', cursor: 'pointer', fontSize: 12, padding: '4px 8px', lineHeight: '1.4', fontWeight: 600, whiteSpace: 'nowrap' }} title="Build History">📋 History</button>
          <button onClick={() => setHelpOpen(!helpOpen)} style={{ background: helpOpen ? '#818cf8' : 'rgba(99,102,241,0.12)', border: '1px solid #818cf8', borderRadius: 0, color: helpOpen ? '#0a0a1a' : '#818cf8', cursor: 'pointer', fontSize: 12, padding: '4px 8px', lineHeight: '1.4', fontWeight: 700, whiteSpace: 'nowrap' }} title="User Manual & Help">❓ Help</button>
        </div>
        <div className="header-divider" />
        <div className="header-group">
          {userName && (
            <div style={{ position: 'relative' }}>
              <button onClick={() => setUserMenuOpen(!userMenuOpen)} style={{ background: userMenuOpen ? '#4ade80' : 'rgba(74,222,128,0.15)', border: '1px solid #4ade80', borderRadius: 0, color: userMenuOpen ? '#0f0f1a' : '#4ade80', cursor: 'pointer', fontSize: 12, padding: '2px 10px', lineHeight: '1.4', fontWeight: 600, whiteSpace: 'nowrap' }}>👤 {userName}</button>
              {userMenuOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setUserMenuOpen(false)} />
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 100, background: '#1a1a2e', border: '1px solid #4a4a6a', borderRadius: 0, padding: 10, minWidth: 260, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', fontSize: 12 }}>
                    <div style={{ fontWeight: 600, color: '#4ade80', marginBottom: 4 }}>📁 {userName}'s Workspace</div>
                    <div style={{ color: '#888', marginBottom: 8 }}>All your projects, roadmaps, and code exports are saved here.</div>
                    <div style={{ color: '#666', fontSize: 11, marginBottom: 6 }}>
                      <div><strong>Projects:</strong> backend/users/{userName}/projects/</div>
                      <div><strong>Roadmaps:</strong> backend/users/{userName}/roadmaps/</div>
                      <div><strong>Code Exports:</strong> backend/users/{userName}/code-exports/</div>
                    </div>
                    <button onClick={handleLogout} style={{ width: '100%', marginTop: 8, padding: '6px 10px', border: '1px solid #ef4444', borderRadius: 0, background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🚪 Logout</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ── Workflow Step Indicator ── */}
      {wizardStep !== 'complete' && (
        <div className="workflow-bar">
          {wizardSteps.filter(s => s !== 'select-design' && s !== 'building-nodes' && s !== 'saving').map((step, idx) => {
            const isActive = idx === currentStepIndex;
            const isPast = idx < currentStepIndex;
            const filteredSteps = wizardSteps.filter(s => s !== 'select-design' && s !== 'building-nodes' && s !== 'saving');
            const filteredIdx = filteredSteps.indexOf(step);
            const activeFilteredIdx = filteredSteps.indexOf(wizardStep as any);
            return (
              <div key={step} className={`wf-step ${isActive ? 'active' : ''} ${isPast ? 'past' : ''}`}>
                <div className="wf-indicator">
                  {isPast ? '✅' : isActive ? '⬤' : '○'}
                </div>
                <div className="wf-label">{STEP_LABELS[step]}</div>
                {filteredIdx < filteredSteps.length - 1 && (
                  <div className={`wf-line ${filteredIdx < activeFilteredIdx ? 'done' : ''}`} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Shared Context Status Bar ── */}
      <ContextStatusBar />

      {/* ── Code Generation Status Bar with Progress ── */}
      {genStatus && (
        <div className="gen-status-bar">
          <div className="gen-status-spinner" />
          <span className="gen-status-text">{genStatus}</span>
          {progress > 0 && progress < 100 && (
            <div className="gen-status-track">
              <div className="gen-status-fill" style={{ width: `${progress}%` }} />
            </div>
          )}
          {progress > 0 && (
            <span className="gen-status-pct">{progress}%</span>
          )}
        </div>
      )}

      {/* ── Complete Screen ── */}
      {wizardStep === 'complete' && (
        <div className="complete-screen">
          <div className="complete-card">
            <div className="complete-icon">✅</div>
            <h2>App Design Complete!</h2>
            <p className="complete-desc">
              Your app <strong>{projectName}</strong> has been designed, coded, and saved to the design library.
            </p>
            <div className="complete-stats">
              <div className="complete-stat">
                <span className="complete-stat-value">{codeNodes.length}</span>
                <span className="complete-stat-label">Nodes</span>
              </div>
              <div className="complete-stat">
                <span className="complete-stat-value">{edges.length}</span>
                <span className="complete-stat-label">Connections</span>
              </div>
              <div className="complete-stat">
                <span className="complete-stat-value">{nodeDatabase.count()}</span>
                <span className="complete-stat-label">Node Designs in DB</span>
              </div>
            </div>
            <div className="complete-actions">
              <button className="complete-btn complete-btn-primary" onClick={handleStartNew}>
                🚀 Start New Project
              </button>
              <button className="complete-btn complete-btn-secondary" onClick={() => setWizardStep('welcome')}>
                ↩ Back to Start
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sandbox Tester Screen ── */}
      {wizardStep === 'sandbox' && (
        <div className="sandbox-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <div className="sandbox-mode-tabs" style={{ display: 'flex', gap: 0, background: '#0d0d20', borderBottom: '1px solid #1a1a3e', flexShrink: 0 }}>
            <button
              className={`sandbox-mode-tab ${previewTab === 'live' ? 'active' : ''}`}
              onClick={() => setPreviewTab('live')}
              style={{
                padding: '8px 16px', fontSize: 12, fontWeight: 600, background: 'transparent',
                border: 'none', borderBottom: `2px solid ${previewTab === 'live' ? '#4a9eff' : 'transparent'}`,
                color: previewTab === 'live' ? '#4a9eff' : '#64748b', cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >🖥 Live Preview (Per-File)</button>
            <button
              className={`sandbox-mode-tab ${previewTab === 'sandbox' ? 'active' : ''}`}
              onClick={() => setPreviewTab('sandbox')}
              style={{
                padding: '8px 16px', fontSize: 12, fontWeight: 600, background: 'transparent',
                border: 'none', borderBottom: `2px solid ${previewTab === 'sandbox' ? '#4a9eff' : 'transparent'}`,
                color: previewTab === 'sandbox' ? '#4a9eff' : '#64748b', cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >🐳 Sandbox Preview</button>
          </div>
          {previewTab === 'live' ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <div className="lpp-empty-state" style={{ flex: 'none', padding: '60px 40px' }}>
                <div className="lpp-empty-icon" style={{ fontSize: 48, marginBottom: 12 }}>🪟</div>
                <h4 style={{ fontSize: 16, fontWeight: 600, color: '#94a3b8', margin: '8px 0 4px' }}>Floating Preview Window</h4>
                <p style={{ fontSize: 13, color: '#64748b', maxWidth: 360, lineHeight: 1.5 }}>
                  The live preview has been upgraded to a floating window you can drag anywhere, even outside the app.
                </p>
                <button
                  onClick={() => setFloatingPreviewOpen(true)}
                  style={{
                    marginTop: 16, padding: '10px 24px', fontSize: 13, fontWeight: 700,
                    borderRadius: 8, border: '1px solid rgba(74,158,255,0.4)',
                    background: 'rgba(74,158,255,0.15)', color: '#60a5fa',
                    cursor: 'pointer', transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(74,158,255,0.25)'; e.currentTarget.style.transform = 'scale(1.03)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(74,158,255,0.15)'; e.currentTarget.style.transform = 'scale(1)'; }}
                >🖥 Open Floating Preview</button>
              </div>
              <div className="sandbox-actions" style={{ display: 'flex', gap: 8, justifyContent: 'center', flexShrink: 0 }}>
                <button
                  className="preview-btn primary"
                  onClick={() => setWizardStep('review')}
                  style={{ padding: '8px 20px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: '1px solid rgba(74,222,128,0.3)', background: 'rgba(74,222,128,0.15)', color: '#4ade80', cursor: 'pointer' }}
                >✅ Approve & Review</button>
              </div>
            </div>
          ) : (
            <SandboxPreview
              onApprove={() => setWizardStep('review')}
              onReturn={() => setWizardStep('filling-nodes')}
              onRegenerate={handleRegenerate}
            />
          )}
        </div>
      )}

      {/* ── Review Screen ── */}
      {wizardStep === 'review' && (
        <div className="review-container">
          <ReviewPanel
            onApprove={handleApproveAndSave}
            onRegenerate={handleRegenerate}
            onCancel={() => setWizardStep('filling-nodes')}
          />
        </div>
      )}

      {/* ── Saving Screen ── */}
      {wizardStep === 'saving' && (
        <div className="complete-screen">
          <div className="complete-card">
            <div className="building-indicator" style={{ justifyContent: 'center', padding: 20 }}>
              <div className="building-spinner" />
              <span>Saving design and generating training data...</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Main App Layout (hidden during review/complete/saving) ── */}
      {wizardStep !== 'sandbox' && wizardStep !== 'review' && wizardStep !== 'complete' && wizardStep !== 'saving' && (
        isMobile ? (
          <div className="app-main-container mobile-layout">
            <div className="canvas-area mobile-canvas"><Suspense fallback={<div style={{width:'100%',height:'100%',background:'#1b1b30',display:'flex',alignItems:'center',justifyContent:'center',color:'#64748b',fontSize:13}}>⏳ Loading 3D viewer...</div>}><Canvas /></Suspense></div>
            <div className="mobile-bottom-bar">
              <button className="mobile-bar-btn" onClick={() => setMobilePanel(mobilePanel === 'palette' ? 'none' : 'palette')}><span className="mobile-bar-icon">📦</span><span className="mobile-bar-label">Nodes</span></button>
              <button className="mobile-bar-btn" onClick={() => setMobilePanel(mobilePanel === 'roadmap' ? 'none' : 'roadmap')}><span className="mobile-bar-icon">🗺</span><span className="mobile-bar-label">Roadmap</span></button>
              <button className="mobile-bar-btn" onClick={() => setMobilePanel(mobilePanel === 'terminals' ? 'none' : 'terminals')}><span className="mobile-bar-icon">💻</span><span className="mobile-bar-label">Terminal</span></button>
              <button className="mobile-bar-btn mobile-bar-gen" onClick={() => setWizardStep('code-gen')}><span className="mobile-bar-icon">⚡</span><span className="mobile-bar-label">Generate</span></button>
            </div>
            {mobilePanel === 'palette' && (<><div className="mobile-overlay-bg" onClick={() => setMobilePanel('none')} /><div className="mobile-overlay-panel"><div className="mobile-overlay-header"><span>📦 Nodes</span><button className="mobile-overlay-close" onClick={() => setMobilePanel('none')}>✕</button></div><div className="mobile-overlay-content"><NodePalette onDragStart={handleDragStart} /></div></div></>)}
            {mobilePanel === 'roadmap' && (<><div className="mobile-overlay-bg" onClick={() => setMobilePanel('none')} /><div className="mobile-overlay-panel"><div className="mobile-overlay-header"><span>🗺 Roadmap</span><button className="mobile-overlay-close" onClick={() => setMobilePanel('none')}>✕</button></div><div className="mobile-overlay-content"><RoadmapDocked /></div></div></>)}
            {mobilePanel === 'terminals' && (<><div className="mobile-overlay-bg" onClick={() => setMobilePanel('none')} /><div className="mobile-overlay-panel mobile-terminals-overlay"><div className="mobile-overlay-header"><span>💻 Terminal</span><button className="mobile-overlay-close" onClick={() => setMobilePanel('none')}>✕</button></div><div className="mobile-overlay-content mobile-terminals-content" style={{ display: 'flex' }}><ReasoningPanel /></div></div></>)}
          </div>
        ) : (
          <>
            <div className="app-main-container">
              <div className="canvas-area">
                <Suspense fallback={<div style={{width:'100%',height:'100%',background:'#1b1b30',display:'flex',alignItems:'center',justifyContent:'center',color:'#64748b',fontSize:13}}>⏳ Loading 3D viewer...</div>}><Canvas /></Suspense>
              </div>

              {sidebarCollapsed.right ? (
                <div className="sidebar-collapsed" onClick={() => toggleSidebar('right')} title="Show Sidebar">
                  <span className="sidebar-collapsed-icon">🗺</span>
                  <span className="sidebar-collapsed-label">Sidebar</span>
                </div>
              ) : (
                <div className="sidebar-collapsible sidebar-right">
                  <button className="sidebar-collapse-btn" onClick={() => toggleSidebar('right')} title="Collapse Sidebar">▶</button>
                  <div className="sidebar-right-content">
                    <div className={`sidebar-section ${sidebarCollapsed.nodePalette ? 'collapsed' : ''}`}>
                      <div className="sidebar-section-header" onClick={() => toggleSidebar('nodePalette')}>
                        <span className="sidebar-section-title">📦 Nodes</span>
                        <span className="sidebar-section-toggle">{sidebarCollapsed.nodePalette ? '▶' : '▼'}</span>
                      </div>
                      {!sidebarCollapsed.nodePalette && (
                        <div className="sidebar-section-body">
                          <NodePalette onDragStart={handleDragStart} />
                        </div>
                      )}
                    </div>
                    <div className={`sidebar-section ${sidebarCollapsed.roadmap ? 'collapsed' : ''}`}>
                      <div className="sidebar-section-header" onClick={() => toggleSidebar('roadmap')}>
                        <span className="sidebar-section-title">🗺 Roadmap</span>
                        <span className="sidebar-section-toggle">{sidebarCollapsed.roadmap ? '▶' : '▼'}</span>
                      </div>
                      {!sidebarCollapsed.roadmap && (
                        <div className="sidebar-section-body">
                          {!roadmapDetached ? (
                            <RoadmapDocked />
                          ) : (
                            <div className="roadmap-reattach-bar">
                              <span>Roadmap detached</span>
                              <button className="roadmap-reattach-btn" onClick={() => setRoadmapDetached(false)}>↩ Reattach</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className={`sidebar-section ${sidebarCollapsed.llm ? 'collapsed' : ''}`}>
                      <div className="sidebar-section-header" onClick={() => toggleSidebar('llm')}>
                        <span className="sidebar-section-title">🧠 LLM</span>
                        <span className="sidebar-section-toggle">{sidebarCollapsed.llm ? '▶' : '▼'}</span>
                      </div>
                      {!sidebarCollapsed.llm && (
                        <div className="sidebar-section-body">
                          <LLMSelector />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <NodeLogicEditor />
          </>
        )
      )}
      {wizardStep !== 'sandbox' && wizardStep !== 'review' && wizardStep !== 'complete' && wizardStep !== 'saving' && (
        <>
          <FileDropHandler />
          <GlobalShortcuts />
        </>
      )}

      {/* ── Terminal Split View: Left=Reasoning, Right=Generated Code ── */}
      {wizardStep !== 'sandbox' && wizardStep !== 'review' && wizardStep !== 'complete' && wizardStep !== 'saving' && !isMobile && (
        <div className="terminals-container" ref={terminalsRef}>
          <div className="terminal-left-panel">
            <ReasoningPanel />
          </div>
          <div
            className={`terminal-divider ${isDraggingDivider ? 'dragging' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault();
              setIsDraggingDivider(true);
              const container = terminalsRef.current;
              if (!container) return;
              const startX = e.clientX;
              const leftPanel = container.querySelector('.terminal-left-panel') as HTMLElement;
              const rightPanel = container.querySelector('.terminal-right-panel') as HTMLElement;
              if (!leftPanel || !rightPanel) return;
              const startLeft = leftPanel.getBoundingClientRect().width;
              const containerWidth = container.getBoundingClientRect().width;

              const onMove = (ev: MouseEvent) => {
                const delta = ev.clientX - startX;
                const leftPct = ((startLeft + delta) / containerWidth) * 100;
                const clampedPct = Math.max(20, Math.min(80, leftPct));
                leftPanel.style.flex = `0 0 ${clampedPct}%`;
                rightPanel.style.flex = `0 0 ${100 - clampedPct}%`;
              };

              const onUp = () => {
                setIsDraggingDivider(false);
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
              };

              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
          />
          <div className="terminal-right-panel">
            <CodeOutputPanel />
          </div>
        </div>
      )}

      {/* ── Reference Library Sidebar ── */}
      {libraryOpen && <ReferenceLibrary onClose={() => setLibraryOpen(false)} />}

      {/* ── Project History Sidebar ── */}
      {historyOpen && (
        <div className="history-overlay">
          <div className="history-sidebar">
            <div className="history-sidebar-header">
              <span className="history-sidebar-title">📋 Build History</span>
              <button className="history-close-btn" onClick={() => setHistoryOpen(false)}>✕</button>
            </div>
            <div className="history-sidebar-content">
              <ProjectHistory />
            </div>
          </div>
          <div className="history-overlay-bg" onClick={() => setHistoryOpen(false)} />
        </div>
      )}
      <UserNamePrompt onSet={(name) => { setUserName(name); }} />

      {/* ── Interactive Help Panel ── */}
      <Suspense fallback={<LazyFallback />}>
        {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
      </Suspense>

      {/* ── First-Launch Tutorial ── */}
      <Suspense fallback={<LazyFallback />}>
        {showTutorial && <TutorialOverlay onComplete={() => setShowTutorial(false)} />}
      </Suspense>

      {/* ── Export Dialog ── */}
      {exportDialogOpen && (
        <ExportDialog
          onClose={() => setExportDialogOpen(false)}
          onExported={(path) => {
            broadcastMessage({ role: 'ai', text: `📦 App built at: ${path}`, timestamp: new Date().toISOString() });
          }}
        />
      )}

      {/* ── Plan Mode Dialog ── */}
      {planOpen && (
        <PlanPanel
          onClose={() => setPlanOpen(false)}
        />
      )}

      {/* ── Build from Description Dialog ── */}
      {blueprintDialogOpen && (
        <BlueprintBuildDialog
          onClose={() => setBlueprintDialogOpen(false)}
          initialGoal={blueprintRequestGoal || undefined}
          autoStart={blueprintRequestToken > 0}
        />
      )}

      {/* ── Floating Preview Window ── */}
      <FloatingPreviewWindow
        isOpen={floatingPreviewOpen}
        onClose={() => setFloatingPreviewOpen(false)}
        onMinimize={undefined}
        title={
          previewMode === 'session-history' ? 'Session History'
          : previewMode === 'wiki' ? 'VACA Wiki'
          : previewMode === 'todo' ? 'VACA Todo List'
          : previewMode === 'mockup' ? 'Planned Interface'
          : 'Live Preview'
        }
        icon={previewMode === 'session-history' ? '📜' : previewMode === 'wiki' ? '📗' : previewMode === 'todo' ? '📋' : '🖥'}
      >
        {previewMode === 'session-history' ? (
          <SessionHistoryPanel />
        ) : previewMode === 'wiki' ? (
          <WikiPanel />
        ) : previewMode === 'todo' ? (
          <TodoPanel />
        ) : previewMode === 'mockup' ? (
          <MockupPreviewPanel
            loading={mockupLoading}
            error={mockupError}
            mockup={mockupData}
            goal={mockupGoal}
            purpose={mockupPurpose}
          />
        ) : (
          <LivePreviewPanel />
        )}
      </FloatingPreviewWindow>

      {/* ── Toast explaining the planned-interface preview ── */}
      {previewToast && (
        <div className="preview-toast" role="status">
          <span>{previewToast}</span>
          <button
            className="preview-toast-settings"
            onClick={() => {
              // Open the Settings dropdown at the Auto GUI Preview toggle (the
              // setting that controls this popup), then dismiss the toast.
              useProjectStore.getState().requestOpenSettings();
              setPreviewToast(null);
            }}
            title="Open Settings — the Auto GUI Preview toggle controls this popup"
          >
            ⚙ Auto Preview setting
          </button>
          <button
            className="preview-toast-close"
            onClick={dismissPreviewToast}
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
    </div>
    </ErrorBoundary>
  );
}

export default App;
