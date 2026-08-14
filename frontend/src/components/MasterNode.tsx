import { memo, useCallback, useState, useEffect, useRef } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { OSType, LinuxDistro, StoredDesign, OpenSourceRepo, OS_OPTIONS, LINUX_DISTRO_OPTIONS, WizardStep, AppScale, SCALE_OPTIONS, detectScaleFromText, estimateScaleFromFeatures } from '../types';
import { useProjectStore, getNextNodeId } from '../store/projectStore';
import { userProfile } from '../utils/userProfile';
import DesignBrowser from './DesignBrowser';
import './MasterNode.css';

interface MasterNodeData {
  label: string;
  appGoal?: string;
  appPurpose?: string;
  selectedOS?: OSType;
  selectedDistro?: LinuxDistro;
  scale?: AppScale;
  status?: string;
}

/**
 * Compact S/M/L/XL badge shown in the master node header so the chosen
 * program scale is visible at a glance. Mirrors the welcome-step selector
 * and the ReasoningPanel pills (same SCALE_OPTIONS source of truth).
 */
function ScaleBadge({ scale }: { scale?: AppScale }) {
  const opt = SCALE_OPTIONS.find(o => o.value === scale) || SCALE_OPTIONS[1]; // fallback Medium
  return (
    <span
      className={`master-scale-badge scale-${opt.value}`}
      title={`${opt.label} program — ${opt.nodes} nodes. ${opt.hint}`}
      aria-label={`Program scale: ${opt.label}`}
    >
      {opt.short}
    </span>
  );
}

function MasterNode({ id, data, selected }: NodeProps<MasterNodeData>) {
  const store = useProjectStore();
  const {
    wizardStep, setWizardStep,
    userGoal, setUserGoal,
    userPurpose, setUserPurpose,
    setSelectedDesign,
    updateNode, setTargetOS, replaceNodes,
    projectName, setProjectName, nodes,
    includeGUI, setIncludeGUI,
    setNodeBeingFilled,
  } = store;

  const [building, setBuilding] = useState(false);
  // True once the user manually picks a scale on the segmented selector —
  // then auto-detection on submit no longer overrides their choice.
  const [scaleTouched, setScaleTouched] = useState(false);
  const [filling, setFilling] = useState(false);
  const [autoCompleteAll, setAutoCompleteAll] = useState(false);
  const [autoFillStep, setAutoFillStep] = useState(0);
  const [autoFillTotal, setAutoFillTotal] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [creatingUI, setCreatingUI] = useState(false);
  const [uiCreateResult, setUiCreateResult] = useState<string | null>(null);
  const [previewingGUI, setPreviewingGUI] = useState(false);
  const [guiMockup, setGuiMockup] = useState<{
    imageBase64?: string;
    html: string;
    appType: string;
    matchScore: number;
    modules: string[];
  } | null>(null);
  const [guiMockupError, setGuiMockupError] = useState('');
  const [mockupTheme, setMockupTheme] = useState('ocean');
  const [mockupLayout, setMockupLayout] = useState('sidebar');

  const prevStepRef = useRef<WizardStep>(wizardStep);
  const autoFillStartedRef = useRef(false);

  // Auto-apply user profile preferences on mount
  useEffect(() => {
    const profile = userProfile.get();
    const preferredOS = profile.preferences.os;
    const validOSes: string[] = ['linux','windows','mac','ios','android'];
    if (preferredOS && preferredOS !== 'auto' && validOSes.includes(preferredOS)) {
      setTargetOS(preferredOS as OSType);
      updateNode(id, { selectedOS: preferredOS as OSType });
    }
  }, []);

  const codeNodes = nodes.filter(n => n.type !== 'master');
  const masterData = nodes.find(n => n.type === 'master')?.data || {};

  const handleGoalSubmit = useCallback(() => {
    if (!userGoal.trim()) return;
    setProjectName(userGoal.trim().substring(0, 40));
    // Auto-pick the scale from the goal/purpose wording (explicit size words
    // always win; feature-count estimation otherwise) — unless the user chose
    // one manually on the selector.
    let scale = data.scale || 'medium';
    if (!scaleTouched) {
      const goalText = `${userGoal} ${userPurpose}`.trim();
      scale = detectScaleFromText(goalText) || estimateScaleFromFeatures(goalText) || scale;
    }
    updateNode(id, { appGoal: userGoal, appPurpose: userPurpose, selectedOS: data.selectedOS || 'linux', selectedDistro: data.selectedDistro, scale });
    setWizardStep('searching');
  }, [userGoal, userPurpose, data.selectedOS, data.selectedDistro, data.scale, scaleTouched, id, setWizardStep, setProjectName, updateNode]);

  const handleSelectDesign = useCallback(async (design: StoredDesign) => {
    setSelectedDesign(design);
    setBuilding(true);
    try {
      const idMap: Record<string, string> = {};
      const flowNodes = design.nodes.map((dn, i) => {
        const nodeId = getNextNodeId();
        idMap[dn.label] = nodeId;
        return {
          id: nodeId,
          type: dn.type,
          position: dn.position || { x: 250, y: 200 + i * 170 },
          data: {
            label: dn.label,
            description: dn.description || '',
            type: dn.type,
            status: 'pending' as const,
            language: dn.language || 'typescript',
            appGoal: design.goal,
            appPurpose: design.purpose,
          },
        };
      });
      const flowEdges = design.edges
        .filter(e => flowNodes.some(n => n.id === e.source) || flowNodes.some(n => n.id === e.target))
        .map((e, i) => ({
          id: `edge_design_${i}`,
          source: e.source,
          target: e.target,
          type: 'default' as const,
        }));
      const masterId = nodes.find(n => n.type === 'master')?.id;
      replaceNodes(flowNodes, flowEdges, design.targetOS as OSType, masterId);
      setWizardStep('filling-nodes');
    } catch (err) {
      console.error('Failed to import design:', err);
    }
    setBuilding(false);
  }, [nodes, replaceNodes, setSelectedDesign, setWizardStep]);

  const handleImportRepo = useCallback(async (repo: OpenSourceRepo) => {
    setImporting(true);
    setImportStatus('Fetching repository details...');
    try {
      const detailsRes = await fetch('/api/designs/search-open-source/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: repo.url }),
      });
      const details = await detailsRes.json();
      if (!details.success) {
        setImportStatus('Could not fetch details. Creating basic design...');
      }

      setImportStatus('Analyzing repository with AI...');
      const importRes = await fetch('/api/designs/search-open-source/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl: repo.url,
          name: repo.name,
          description: repo.description,
          goal: userGoal || repo.description,
        }),
        signal: AbortSignal.timeout(35000),
      });
      const data = await importRes.json();
      if (data.success && data.design) {
        setImportStatus(`✅ Design created from ${repo.name}!`);
        handleSelectDesign(data.design);
      } else {
        setImportStatus(`⚠️ ${data.error || 'Import failed. Try another repository.'}`);
      }
    } catch (err: any) {
      setImportStatus(`Error: ${err.message}`);
    }
    setImporting(false);
  }, [userGoal, handleSelectDesign]);

  /**
   * Stream a full text into a node's description character by character,
   * creating a visible typing effect on the canvas.
   */
  const streamDescription = useCallback(async (nodeId: string, fullText: string) => {
    setNodeBeingFilled(nodeId);
    // First set empty to clear any previous text, then type out
    for (let i = 0; i < fullText.length; i++) {
      useProjectStore.getState().updateNode(nodeId, { description: fullText.substring(0, i + 1) });
      // Varying delay: pause a bit longer on punctuation for natural feel
      const char = fullText[i];
      if (char === '.' || char === '!' || char === '?') await new Promise(r => setTimeout(r, 60));
      else if (char === ',' || char === ';' || char === ':') await new Promise(r => setTimeout(r, 40));
      else if (char === '\n') await new Promise(r => setTimeout(r, 80));
      else await new Promise(r => setTimeout(r, 18));
    }
    setNodeBeingFilled(null);
  }, [setNodeBeingFilled]);

  // ── Auto-fill descriptions with streaming typing effect ──
  const handleAutoFillNodes = useCallback(async () => {
    setFilling(true);
    setAutoCompleteAll(false);
    setAutoFillStep(0);
    const storeNodes = useProjectStore.getState().nodes.filter(n => n.type !== 'master');
    setAutoFillTotal(storeNodes.length);
    for (let i = 0; i < storeNodes.length; i++) {
      setAutoFillStep(i + 1);
      const node = storeNodes[i];
      if (!node.data?.description?.trim()) {
        try {
          const res = await fetch('/api/reason', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: `Describe what this node should do in an app. Keep it to 1-2 sentences.\n\nApp Goal: ${userGoal || masterData.appGoal || ''}\nApp Purpose: ${userPurpose || masterData.appPurpose || ''}\nNode Label: ${node.data?.label || node.id}\nNode Type: ${node.type}\n\nReturn ONLY a brief description of what this node's functionality should be.`,
              system: 'You are a software architect. Generate concise, implementation-focused descriptions for application components.',
              maxTokens: 128,
            }),
            signal: AbortSignal.timeout(10000),
          });
          if (res.ok) {
            const data = await res.json();
            const fullDesc = (data.response || '').trim();
            if (fullDesc) {
              // Stream the description character by character for visual effect
              await streamDescription(node.id, fullDesc);
            }
          }
        } catch { /* skip node */ }
      }
    }
    setFilling(false);
    setWizardStep('code-gen');
  }, [userGoal, userPurpose, masterData, streamDescription]);

  // ── Auto-trigger streaming fill when entering filling-nodes from architect ──
  useEffect(() => {
    const wasBuilding = prevStepRef.current === 'building-nodes' || prevStepRef.current === 'select-design';
    prevStepRef.current = wizardStep as WizardStep;
    if (wizardStep === 'filling-nodes' && wasBuilding && !autoFillStartedRef.current) {
      autoFillStartedRef.current = true;
      handleAutoFillNodes();
    }
    if (wizardStep !== 'filling-nodes') {
      autoFillStartedRef.current = false;
    }
  }, [wizardStep, handleAutoFillNodes]);

  // ── Auto-Complete ALL (descriptions + code skeletons) ──
  const handleAutoCompleteAll = useCallback(async () => {
    setFilling(true);
    setAutoCompleteAll(true);
    setAutoFillStep(0);
    const storeNodes = useProjectStore.getState().nodes.filter(n => n.type !== 'master');
    setAutoFillTotal(storeNodes.length);
    const goal = userGoal || masterData.appGoal || '';
    const purpose = userPurpose || masterData.appPurpose || '';
    const os = nodes.find(n => n.type === 'master')?.data?.selectedOS || 'linux';
    // Program scale the user picked — tailors each file's depth to the target size.
    const scale = nodes.find(n => n.type === 'master')?.data?.scale || 'medium';

    for (let i = 0; i < storeNodes.length; i++) {
      setAutoFillStep(i + 1);
      const node = storeNodes[i];
      let needDesc = !node.data?.description?.trim();
      let needCode = !node.data?.generatedCode;

      const osLang = getPrimaryLanguageForOS(os as OSType);
      if (needDesc || needCode) {
        try {
          const prompt = `You are filling in a node for an app being built.\n\nApp Goal: ${goal}\nApp Purpose: ${purpose}\nTarget OS: ${os} — PRIMARY LANGUAGE: ${osLang.toUpperCase()}\n\nNode Label: ${node.data?.label || node.id}\nNode Type: ${node.type}\nLanguage: ${osLang} (OS-primary)`;

          // Generate description if missing — stream it with typing effect
          if (needDesc) {
            const descRes = await fetch('/api/reason', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: `${prompt}\n\nDescribe what this file does in 1-2 sentences. Focus on its inputs, outputs, and purpose.\nReturn ONLY the description, no extra text.`,
                system: 'You are a software architect. Generate concise file descriptions.',
                maxTokens: 256,
              }),
              signal: AbortSignal.timeout(15000),
            });
            if (descRes.ok) {
              const descData = await descRes.json();
              const fullDesc = (descData.response || '').trim();
              if (fullDesc) {
                // Stream with typing effect instead of setting all at once
                await streamDescription(node.id, fullDesc);
              }
            }
          } else {
            // Description already exists, but still highlight it briefly
            setNodeBeingFilled(node.id);
            await new Promise(r => setTimeout(r, 300));
            setNodeBeingFilled(null);
          }

          // Generate code skeleton (always, whether description was missing or not)
          // Force OS-primary language for all code generation — prevents language mixing
          const lang = osLang;
          const codeRes = await fetch('/api/reason', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: `${prompt}\nDescription: ${node.data?.description || 'Auto-generated'}\n\nGenerate a complete, standalone code file for this ONE node.\n\nRULES:\n- LANGUAGE: You MUST write this file in ${lang.toUpperCase()}. This is NON-NEGOTIABLE.\n- The target OS is ${os}, which means the primary language is ${lang.toUpperCase()}.\n- Do NOT write code in any other language — no ${lang === 'go' ? 'TypeScript, Python, or C#' : lang === 'csharp' ? 'Go, Python, or TypeScript' : lang === 'swift' ? 'Go, Python, or TypeScript' : lang === 'kotlin' ? 'Go, Python, or TypeScript' : 'other languages'}.\n- PROGRAM SCALE: ${scale === 'small' ? 'SMALL app — keep this file lean and focused; basic error handling only, no over-engineering.' : scale === 'large' ? 'LARGE app — write production-grade code: thorough error handling, edge cases, and clean exports other files can import.' : scale === 'enterprise' ? 'ENTERPRISE app — maximize robustness: validate inputs, handle errors defensively, expose stable typed interfaces.' : 'MEDIUM app — solid error handling and clear structure.'}\n- Do NOT add import statements for other nodes in the project\n- Do NOT wrap the code in a main() function unless it IS the entry point\n- Include all needed imports within this file\n- Add proper error handling and type definitions\n- Keep it focused on this node's specific responsibility\n\nReturn ONLY the code, no markdown fences, no explanations.`,
              system: `You are a code generator for ${os} apps. You MUST write ALL code in ${lang.toUpperCase()}. Generate ONLY clean ${lang} code. NEVER generate code in any other language. No markdown, no explanations. THIS IS CRITICAL: every single line must be valid ${lang}.`,
              maxTokens: 1024,
            }),
            signal: AbortSignal.timeout(30000),
          });
          if (codeRes.ok) {
            const codeData = await codeRes.json();
            const code = (codeData.response || '').trim();
            if (code) {
              useProjectStore.getState().updateNodeStatus(node.id, 'valid', undefined, code);
            }
          }
        } catch { /* skip node */ }
      }
    }
    setFilling(false);
    setAutoCompleteAll(false);
    setWizardStep('code-gen');
  }, [userGoal, userPurpose, masterData, nodes]);

  const handleFillNode = useCallback((nodeId: string, desc: string) => {
    useProjectStore.getState().updateNode(nodeId, { description: desc });
  }, []);

  const handleProceedToCodeGen = useCallback(() => {
    const missingDesc = codeNodes.some(n => !n.data?.description?.trim());
    if (missingDesc && !confirm('Some nodes lack descriptions. Code will be generic. Continue?')) return;
    setWizardStep('code-gen');
  }, [codeNodes, setWizardStep]);

  const uiNodes = codeNodes.filter(n => n.type === 'ui' || n.type === 'ui-functions');

  // ── Auto-Create UI Controls via LLM ──
  const handleAutoCreateUI = useCallback(async () => {
    const store = useProjectStore.getState();
    const archNodes = store.nodes.filter(n => n.type !== 'master');
    const goal = userGoal || masterData.appGoal || '';
    const purpose = userPurpose || masterData.appPurpose || '';
    const os = nodes.find(n => n.type === 'master')?.data?.selectedOS || 'linux';

    if (archNodes.length === 0) {
      setUiCreateResult('⚠️ Add architecture nodes first — the LLM needs to know your app structure.');
      setTimeout(() => setUiCreateResult(null), 5000);
      return;
    }

    setCreatingUI(true);
    setUiCreateResult(null);

    try {
      const res = await fetch('/api/ui-functions/auto-place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal,
          purpose,
          targetOS: os,
          nodes: archNodes.map(n => ({
            id: n.id,
            label: n.data?.label || n.id,
            type: n.type,
            description: n.data?.description || '',
          })),
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.placedWidgets?.length > 0) {
          // Store generated widgets in the master node's data
          useProjectStore.getState().updateNode(id, {
            generatedFunctions: data.functions || [],
            generatedPlacedWidgets: data.placedWidgets || [],
          });

          // Optionally auto-create a ui-functions node to show the controls
          const hasUIFuncNode = store.nodes.some(n => n.type === 'ui-functions');
          if (!hasUIFuncNode) {
            const uiFuncNodeId = `ui-func-${Date.now()}`;
            useProjectStore.getState().addNode({
              id: uiFuncNodeId,
              type: 'ui-functions',
              position: { x: 550, y: 300 },
              data: {
                label: 'UI Functions',
                type: 'ui-functions',
                status: 'pending' as const,
                language: 'typescript',
                generatedFunctions: data.functions || [],
                generatedPlacedWidgets: data.placedWidgets || [],
              },
            });
          }

          setUiCreateResult(`✅ ${data.placedWidgets.length} UI controls created!`);
          setTimeout(() => setUiCreateResult(null), 8000);
        } else if (data.functions?.length > 0) {
          useProjectStore.getState().updateNode(id, {
            generatedFunctions: data.functions,
            generatedPlacedWidgets: [],
          });
          setUiCreateResult(`✅ ${data.functions.length} UI controls suggested.`);
          setTimeout(() => setUiCreateResult(null), 8000);
        } else {
          setUiCreateResult('⚠️ LLM could not generate UI controls. Try adding more node descriptions.');
          setTimeout(() => setUiCreateResult(null), 6000);
        }
      } else {
        setUiCreateResult('❌ Auto-place API error. Check the backend.');
        setTimeout(() => setUiCreateResult(null), 5000);
      }
    } catch (err: any) {
      setUiCreateResult(`❌ Error: ${err.message}`);
      setTimeout(() => setUiCreateResult(null), 6000);
    }

    setCreatingUI(false);
  }, [userGoal, userPurpose, masterData, id]);

  // ── Pre-build GUI mockup preview in the wizard ──
  // Same endpoint as Build-from-Description: match the goal to the blueprint
  // bible and show a deterministic mockup image of how the interface should
  // look BEFORE finding designs / generating code. Fast (no LLM, no files).
  const handlePreviewGUI = useCallback(async () => {
    if (!userGoal.trim()) return;
    setPreviewingGUI(true);
    setGuiMockupError('');
    try {
      const res = await fetch('/api/blueprint/mockup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: userGoal.trim(),
          purpose: userPurpose.trim(),
          targetOS: data.selectedOS || 'linux',
          language: getPrimaryLanguageForOS((data.selectedOS || 'linux') as OSType),
          theme: mockupTheme,
          layout: mockupLayout,
        }),
        signal: AbortSignal.timeout(30000),
      });
      const payload = await res.json();
      const m = payload?.mockup;
      if (!res.ok || !m) {
        setGuiMockupError(payload?.error || 'Could not render GUI mockup');
        return;
      }
      setGuiMockup({
        imageBase64: m.imageBase64,
        html: m.html,
        appType: m.appType,
        matchScore: m.matchScore ?? 0,
        modules: m.modules || [],
      });
    } catch (err: any) {
      setGuiMockupError(err?.message || String(err));
    } finally {
      setPreviewingGUI(false);
    }
  }, [userGoal, userPurpose, data.selectedOS, mockupTheme, mockupLayout]);

  // ── WELCOME STEP ──
  if (wizardStep === 'welcome') {
    return (
      <div className={`master-node welcome-mode ${selected ? 'selected' : ''}`}>
        <div className="master-node-header">
          <span className="master-node-icon">🤖</span>
          <span className="master-node-title">What do you want to build?</span>
          <ScaleBadge scale={data.scale} />
        </div>
        <div className="master-node-body">
          <label className="master-field">
            <span className="master-field-label">Describe your app idea</span>
            <textarea
              className="master-textarea react-flow__nodrag"
              placeholder="I want to build a..."
              value={userGoal}
              onChange={e => setUserGoal(e.target.value)}
              rows={3}
              onPointerDown={e => e.stopPropagation()}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGoalSubmit(); } }}
            />
          </label>
          <label className="master-field">
            <span className="master-field-label">What will users do with it? (optional)</span>
            <textarea
              className="master-textarea react-flow__nodrag"
              placeholder="Users will be able to..."
              value={userPurpose}
              onChange={e => setUserPurpose(e.target.value)}
              rows={2}
              onPointerDown={e => e.stopPropagation()}
            />
          </label>
          <label className="master-field">
            <span className="master-field-label">Target OS</span>
            <select
              className="master-select react-flow__nodrag"
              value={data.selectedOS || 'linux'}
              onChange={e => {
                const os = e.target.value as OSType;
                updateNode(id, { selectedOS: os, selectedDistro: os === 'linux' ? data.selectedDistro || 'ubuntu' : undefined });
                setTargetOS(os);
              }}
              onPointerDown={e => e.stopPropagation()}
            >
              {OS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.icon} {opt.label} ({opt.nativeLang})
                </option>
              ))}
            </select>
            {data.selectedOS === 'linux' && (
              <div style={{ marginTop: 6 }}>
                <span className="master-field-label" style={{ fontSize: 10 }}>Linux Distribution</span>
                <select
                  className="master-select react-flow__nodrag"
                  value={data.selectedDistro || ''}
                  onChange={e => {
                    const distro = e.target.value as LinuxDistro | '';
                    updateNode(id, { selectedDistro: distro || undefined });
                  }}
                  onPointerDown={e => e.stopPropagation()}
                  style={{ marginTop: 2 }}
                >
                  {LINUX_DISTRO_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.value ? `🐧 ${opt.label} (${opt.pkgFormat})` : `🐧 ${opt.label}`}
                    </option>
                  ))}
                </select>
                {data.selectedDistro && (
                  <div className="master-field-hint" style={{ marginTop: 2 }}>
                    Package manager: {LINUX_DISTRO_OPTIONS.find(o => o.value === data.selectedDistro)?.pkgManager || 'apt'} · Format: {LINUX_DISTRO_OPTIONS.find(o => o.value === data.selectedDistro)?.pkgFormat || 'AppImage'}
                  </div>
                )}
              </div>
            )}
          </label>
          <label className="master-field">
            <span className="master-field-label">Program Scale</span>
            <div
              className="scale-segmented react-flow__nodrag"
              onPointerDown={e => e.stopPropagation()}
              role="radiogroup"
              aria-label="Program scale"
            >
              {SCALE_OPTIONS.map(opt => {
                const active = (data.scale || 'medium') === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`scale-seg-btn ${active ? 'active' : ''}`}
                    onClick={() => { setScaleTouched(true); updateNode(id, { scale: opt.value }); }}
                    title={`${opt.label} — ${opt.nodes} nodes. ${opt.hint}`}
                  >
                    {opt.short}
                  </button>
                );
              })}
            </div>
            <div className="master-field-hint">
              {(() => {
                const opt = SCALE_OPTIONS.find(o => o.value === (data.scale || 'medium'));
                return `${opt?.icon || '⚙️'} ${opt?.label || 'Medium'} — ${opt?.nodes || '8–14 nodes'}. ${opt?.hint || ''}`;
              })()}
            </div>
          </label>
          <div className="master-mockup-options">
            <label className="master-mockup-opt">
              <span>Theme</span>
              <select
                className="react-flow__nodrag"
                value={mockupTheme}
                onChange={e => setMockupTheme(e.target.value)}
                onPointerDown={e => e.stopPropagation()}
              >
                <option value="ocean">🌊 Ocean</option>
                <option value="violet">🔮 Violet</option>
                <option value="emerald">🌿 Emerald</option>
                <option value="rose">🌸 Rose</option>
                <option value="amber">🌞 Amber</option>
                <option value="slate">🪨 Slate</option>
                <option value="cyan">💠 Cyan</option>
              </select>
            </label>
            <label className="master-mockup-opt">
              <span>Layout</span>
              <select
                className="react-flow__nodrag"
                value={mockupLayout}
                onChange={e => setMockupLayout(e.target.value)}
                onPointerDown={e => e.stopPropagation()}
              >
                <option value="sidebar">🖥 Sidebar</option>
                <option value="dashboard">📊 Dashboard</option>
                <option value="topnav">🧭 Top Nav</option>
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="master-build-btn master-preview-gui-btn react-flow__nodrag"
              onClick={handlePreviewGUI}
              disabled={!userGoal.trim() || previewingGUI}
              onPointerDown={e => e.stopPropagation()}
              style={{ flex: 1, background: 'rgba(125,211,252,0.15)', color: '#7dd3fc', border: '1px solid rgba(125,211,252,0.4)' }}
            >
              {previewingGUI ? '⏳ Designing...' : '🎨 Preview GUI'}
            </button>
            <button
              className="master-build-btn react-flow__nodrag"
              onClick={handleGoalSubmit}
              disabled={!userGoal.trim()}
              onPointerDown={e => e.stopPropagation()}
              style={{ flex: 1 }}
            >
              🔍 Find Designs
            </button>
          </div>

          {/* ── GUI Mockup result (deterministic pre-build preview) ── */}
          {guiMockup && (
            <div className="master-gui-mockup">
              <div className="master-gui-mockup-head">
                <span className="master-gui-mockup-title">🎨 GUI Mockup — how it should look</span>
                <span className="master-gui-mockup-badge">{guiMockup.appType}</span>
              </div>
              <div className="master-gui-mockup-meta">
                Blueprint match <strong>{(guiMockup.matchScore * 100).toFixed(0)}%</strong> · {guiMockup.modules.length} module{guiMockup.modules.length !== 1 ? 's' : ''} · <em>no code generated yet</em>
              </div>
              <div className="master-gui-mockup-frame">
                {guiMockup.imageBase64 ? (
                  <img
                    className="master-gui-mockup-img"
                    src={`data:image/png;base64,${guiMockup.imageBase64}`}
                    alt={`GUI mockup for ${guiMockup.appType}`}
                  />
                ) : (
                  <iframe
                    className="master-gui-mockup-iframe"
                    sandbox="allow-scripts"
                    title={`GUI mockup for ${guiMockup.appType}`}
                    srcDoc={guiMockup.html}
                  />
                )}
              </div>
              <div className="master-gui-mockup-modules">
                {guiMockup.modules.slice(0, 8).map(mod => (
                  <span key={mod} className="master-gui-mockup-module">{mod}</span>
                ))}
                {guiMockup.modules.length > 8 && <span className="master-gui-mockup-module">+{guiMockup.modules.length - 8} more</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="master-build-btn react-flow__nodrag"
                  onClick={() => { setGuiMockup(null); }}
                  onPointerDown={e => e.stopPropagation()}
                  style={{ flex: 1, padding: '8px', fontSize: 12, background: 'rgba(255,255,255,0.1)', color: '#cbd5e1' }}
                >
                  ↩ Back
                </button>
                <button
                  className="master-build-btn react-flow__nodrag"
                  onClick={handlePreviewGUI}
                  disabled={previewingGUI}
                  onPointerDown={e => e.stopPropagation()}
                  style={{ flex: 1, padding: '8px', fontSize: 12, background: 'rgba(125,211,252,0.15)', color: '#7dd3fc', border: '1px solid rgba(125,211,252,0.4)' }}
                >
                  {previewingGUI ? '⏳' : '🔄 Redesign'}
                </button>
                <button
                  className="master-build-btn react-flow__nodrag"
                  onClick={handleGoalSubmit}
                  onPointerDown={e => e.stopPropagation()}
                  style={{ flex: 1.4, padding: '8px', fontSize: 12 }}
                >
                  ✅ Looks Good — Find Designs
                </button>
              </div>
            </div>
          )}
          {guiMockupError && (
            <div style={{ padding: '8px 10px', fontSize: 11, color: '#f87171', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)' }}>
              ❌ {guiMockupError}
            </div>
          )}

          {/* ── Quick Actions while typing your idea ── */}
          <div style={{
            marginTop: 4,
            padding: '10px 12px',
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.2)',
          }}>
            <div style={{
              fontSize: 10,
              color: '#818cf8',
              fontWeight: 600,
              marginBottom: 8,
              textAlign: 'center',
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
            }}>
              ⚡ Quick Actions
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Option 1: Auto-Generate UI Controls */}
              <button
                className="master-build-btn react-flow__nodrag"
                onClick={handleAutoCreateUI}
                disabled={creatingUI}
                onPointerDown={e => e.stopPropagation()}
                style={{
                  width: '100%',
                  padding: '7px 12px',
                  fontSize: 11,
                  fontWeight: 600,
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: creatingUI
                    ? 'rgba(167,139,250,0.1)'
                    : 'rgba(167,139,250,0.18)',
                  border: '1px solid rgba(167,139,250,0.4)',
                  color: creatingUI ? '#a78bfa' : '#c4b5fd',
                  cursor: creatingUI ? 'default' : 'pointer',
                  opacity: creatingUI ? 0.7 : 1,
                }}
              >
                <span style={{ fontSize: 16 }}>🎛</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>
                    {creatingUI ? '⏳ LLM Generating UI Controls...' : 'Option 1: Auto-Generate UI Controls'}
                  </div>
                  <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 1 }}>
                    Let the LLM analyze your architecture and auto-create GUI buttons/sliders/widgets
                  </div>
                </div>
              </button>

            </div>

            {/* Result messages */}
            {uiCreateResult && (
              <div style={{
                marginTop: 6,
                padding: '4px 8px',
                fontSize: 10,
                background: uiCreateResult.startsWith('✅')
                  ? 'rgba(74,222,128,0.1)'
                  : 'rgba(248,113,113,0.1)',
                border: '1px solid',
                borderColor: uiCreateResult.startsWith('✅')
                  ? 'rgba(74,222,128,0.2)'
                  : 'rgba(248,113,113,0.2)',
                color: uiCreateResult.startsWith('✅') ? '#4ade80' : '#f87171',
              }}>
                {uiCreateResult}
              </div>
            )}
          </div>
        </div>
        <div className="master-node-footer">
          <span className="master-hint">
            Tell me what you want to build. I'll search my design library and open-source for matching patterns.
          </span>
        </div>
        <Handle type="source" position={Position.Bottom} className="master-handle" />
      </div>
    );
  }

  // ── SEARCH / SELECT DESIGN ──
  if (wizardStep === 'searching' || wizardStep === 'select-design') {
    return (
      <div className={`master-node design-mode ${selected ? 'selected' : ''}`}>
        <div className="master-node-header">
          <span className="master-node-icon">🔍</span>
          <span className="master-node-title">Looking for designs: {userGoal.substring(0, 30)}...</span>
          <ScaleBadge scale={data.scale} />
        </div>
        <div className="master-node-body" style={{ maxHeight: 500, overflow: 'auto' }}>
          <DesignBrowser
            goal={userGoal}
            purpose={userPurpose}
            onSelectDesign={handleSelectDesign}
            onImportRepo={handleImportRepo}
            importing={importing}
            importStatus={importStatus}
          />
        </div>
        <div className="master-node-footer" style={{ padding: 8 }}>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button
              className="master-build-btn react-flow__nodrag"
              onClick={() => {
                setBuilding(true);
                setWizardStep('building-nodes');
                handleBuildFallback(userGoal, userPurpose, data.selectedOS || 'linux', data.scale || 'medium');
              }}
              disabled={building}
              onPointerDown={e => e.stopPropagation()}
              style={{ fontSize: 12, padding: '6px 12px' }}
            >
              {building ? '⏳ Building...' : '🤖 Skip — AI Build from Scratch'}
            </button>
            <button
              className="master-build-btn react-flow__nodrag"
              onClick={() => setWizardStep('welcome')}
              onPointerDown={e => e.stopPropagation()}
              style={{ fontSize: 12, padding: '6px 12px', background: 'rgba(255,255,255,0.1)' }}
            >
              ↩ Back
            </button>
          </div>
        </div>
        <Handle type="source" position={Position.Bottom} className="master-handle" />
      </div>
    );
  }

  // ── BUILDING NODES (Deep Thinking) ──
  if (wizardStep === 'building-nodes') {
    return (
      <div className={`master-node building-mode ${selected ? 'selected' : ''}`}>
        <div className="master-node-header">
          <span className="master-node-icon">🧠</span>
          <span className="master-node-title">Deeply Thinking About Your App...</span>
          <ScaleBadge scale={data.scale} />
        </div>
        <div className="master-node-body">
          <div className="building-indicator" style={{ flexDirection: 'column', gap: 12, padding: '12px 0' }}>
            <div className="building-spinner" />
            <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
              <div>🔍 Analyzing your app idea...</div>
              <div style={{ marginTop: 4, opacity: 0.7 }}>Mapping out every file needed for your application</div>
              <div className="building-thoughts" style={{
                marginTop: 12,
                padding: '8px 12px',
                background: 'rgba(96,165,250,0.08)',
                border: '1px solid rgba(96,165,250,0.2)',
                fontSize: 11,
                color: '#93c5fd',
                textAlign: 'left',
                lineHeight: 1.6,
              }}>
                <div>📋 Decomposing app into individual files...</div>
                <div>🔗 Planning import/export relationships between files...</div>
                <div>📦 Determining languages and frameworks for each file...</div>
                <div>📐 Creating node graph with edges representing file dependencies...</div>
              </div>
            </div>
          </div>

          {/* ── Action buttons while deep thinking ── */}
          <div style={{
            marginTop: 4,
            padding: '10px 12px',
            background: 'rgba(15,15,26,0.6)',
            border: '1px solid rgba(99,102,241,0.25)',
          }}>
            <div style={{
              fontSize: 10,
              color: '#818cf8',
              fontWeight: 600,
              marginBottom: 8,
              textAlign: 'center',
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
            }}>
              ⚡ Actions While Thinking
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Option 1: Auto-Generate UI Controls */}
              <button
                className="master-build-btn react-flow__nodrag"
                onClick={handleAutoCreateUI}
                disabled={creatingUI}
                onPointerDown={e => e.stopPropagation()}
                style={{
                  width: '100%',
                  padding: '7px 12px',
                  fontSize: 11,
                  fontWeight: 600,
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: creatingUI
                    ? 'rgba(167,139,250,0.1)'
                    : 'rgba(167,139,250,0.18)',
                  border: '1px solid rgba(167,139,250,0.4)',
                  color: creatingUI ? '#a78bfa' : '#c4b5fd',
                  cursor: creatingUI ? 'default' : 'pointer',
                  opacity: creatingUI ? 0.7 : 1,
                }}
              >
                <span style={{ fontSize: 16 }}>🎛</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>
                    {creatingUI ? '⏳ LLM Generating UI Controls...' : 'Option 1: Auto-Generate UI Controls'}
                  </div>
                  <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 1 }}>
                    Let the LLM analyze your architecture and auto-create GUI buttons/sliders/widgets now
                  </div>
                </div>
              </button>

            </div>

            {/* Result messages */}
            {uiCreateResult && (
              <div style={{
                marginTop: 6,
                padding: '4px 8px',
                fontSize: 10,
                background: uiCreateResult.startsWith('✅')
                  ? 'rgba(74,222,128,0.1)'
                  : 'rgba(248,113,113,0.1)',
                border: '1px solid',
                borderColor: uiCreateResult.startsWith('✅')
                  ? 'rgba(74,222,128,0.2)'
                  : 'rgba(248,113,113,0.2)',
                color: uiCreateResult.startsWith('✅') ? '#4ade80' : '#f87171',
              }}>
                {uiCreateResult}
              </div>
            )}
          </div>
        </div>
        <Handle type="source" position={Position.Bottom} className="master-handle" />
      </div>
    );
  }

  // ── FILLING NODES ──
  if (wizardStep === 'filling-nodes') {
    return (
      <div className={`master-node fill-mode ${selected ? 'selected' : ''}`}>
        <div className="master-node-header">
          <span className="master-node-icon">✏️</span>
          <span className="master-node-title">Describe What Each Node Does</span>
          <ScaleBadge scale={data.scale} />
        </div>
        <div className="master-node-body" style={{ maxHeight: 360, overflow: 'auto' }}>
          {codeNodes.length === 0 ? (
            <div className="db-empty">No nodes to fill. Build from scratch first.</div>
          ) : (
            <div className="fill-node-list">
              {codeNodes.map(node => (
                <div key={node.id} className="fill-node-item">
                  <div className="fill-node-header">
                    <span className={`fill-node-type type-${node.type || 'logic'}`}>{node.type}</span>
                    <span className="fill-node-label">{node.data?.label || node.id}</span>
                    {node.data?.generatedCode && (
                      <span className="fill-node-has-code" style={{ marginLeft: 'auto', fontSize: 10, color: '#4ade80' }}>✅ Code</span>
                    )}
                  </div>
                  <textarea
                    className="fill-node-desc react-flow__nodrag"
                    placeholder="Describe what this file should do..."
                    value={node.data?.description || ''}
                    onChange={e => handleFillNode(node.id, e.target.value)}
                    rows={2}
                    onPointerDown={e => e.stopPropagation()}
                  />
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              className="master-build-btn react-flow__nodrag"
              onClick={handleAutoFillNodes}
              disabled={filling && !autoCompleteAll}
              onPointerDown={e => e.stopPropagation()}
              style={{ fontSize: 11, padding: '6px 10px' }}
            >
              {filling && !autoCompleteAll ? `⏳ Auto-filling (${autoFillStep}/${autoFillTotal})...` : '🤖 Fill Descriptions Only'}
            </button>
            <button
              className="master-build-btn react-flow__nodrag"
              onClick={handleAutoCompleteAll}
              disabled={filling}
              onPointerDown={e => e.stopPropagation()}
              style={{ fontSize: 11, padding: '6px 10px', background: '#a78bfa', color: '#0f0f1a' }}
            >
              {filling && autoCompleteAll ? `⏳ Auto-completing (${autoFillStep}/${autoFillTotal})...` : '⚡ Auto-Complete Descriptions + Code'}
            </button>
          </div>
        </div>
        <div className="master-node-footer" style={{ padding: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              className="master-build-btn react-flow__nodrag"
              onClick={handleProceedToCodeGen}
              onPointerDown={e => e.stopPropagation()}
              style={{ fontSize: 12, padding: '6px 12px', background: '#4ade80', color: '#0f0f1a' }}
            >
              ✅ Ready — Generate Code
            </button>
          </div>
          {filling && (
            <div className="master-hint" style={{ marginTop: 6, color: '#fbbf24' }}>
              ⏳ Auto-filling node {autoFillStep}/{autoFillTotal}...
            </div>
          )}
          {!filling && (
            <div className="master-hint" style={{ marginTop: 6 }}>
              Fill descriptions yourself, use AI auto-fill, or click "Auto-Complete" to generate both descriptions AND code skeletons for every node.
            </div>
          )}
        </div>
        <Handle type="source" position={Position.Bottom} className="master-handle" />
      </div>
    );
  }

  // ── CODE GEN (with GUI Toggle) ──
  if (wizardStep === 'code-gen') {
    return (
      <div className={`master-node gen-mode ${selected ? 'selected' : ''}`}>
        <div className="master-node-header">
          <span className="master-node-icon">⚡</span>
          <span className="master-node-title">Code Generation</span>
          <ScaleBadge scale={data.scale} />
        </div>
        <div className="master-node-body">
          <div className="gen-controls">
            <div className="gen-info">
              <span>📦 {codeNodes.length} nodes ({uiNodes.length} UI)</span>
              <span>🔗 {store.edges.length} connections</span>
              <span>🎯 {OS_OPTIONS.find(o => o.value === (data.selectedOS || 'linux'))?.label || data.selectedOS || 'linux'}{data.selectedDistro ? ` (${LINUX_DISTRO_OPTIONS.find(o => o.value === data.selectedDistro)?.label || data.selectedDistro})` : ''}</span>
            </div>
            
            {/* ── Include GUI Toggle ── */}
            <div className="gen-gui-toggle" style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: '8px 12px',
              margin: '8px 0',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Build type:</span>
              <button
                className={`gen-toggle-btn react-flow__nodrag ${includeGUI ? 'active' : ''}`}
                onClick={() => setIncludeGUI(true)}
                onPointerDown={e => e.stopPropagation()}
                style={{
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  border: `1px solid ${includeGUI ? '#4ade80' : 'rgba(255,255,255,0.15)'}`,
                  background: includeGUI ? 'rgba(74,222,128,0.15)' : 'transparent',
                  color: includeGUI ? '#4ade80' : '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                🖥 Include GUI
              </button>
              <button
                className={`gen-toggle-btn react-flow__nodrag ${!includeGUI ? 'active' : ''}`}
                onClick={() => setIncludeGUI(false)}
                onPointerDown={e => e.stopPropagation()}
                style={{
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  border: `1px solid ${!includeGUI ? '#f472b6' : 'rgba(255,255,255,0.15)'}`,
                  background: !includeGUI ? 'rgba(244,114,182,0.15)' : 'transparent',
                  color: !includeGUI ? '#f472b6' : '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                💻 CLI / API Only (No GUI)
              </button>
            </div>

            {!includeGUI && uiNodes.length > 0 && (
              <div style={{
                padding: '6px 10px',
                marginBottom: 8,
                background: 'rgba(244,114,182,0.08)',
                border: '1px solid rgba(244,114,182,0.2)',
                fontSize: 11,
                color: '#f9a8d4',
              }}>
                🚫 {uiNodes.length} UI node{uiNodes.length > 1 ? 's' : ''} will be skipped since you selected "No GUI"
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ color: '#94a3b8', fontSize: 12, margin: 0 }}>
                {includeGUI
                  ? `All ${codeNodes.length} nodes ready. Generating code with full GUI layer.`
                  : `Generating code for ${codeNodes.length - uiNodes.length} non-UI nodes as a CLI/API app.`}
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button
                  className="master-build-btn react-flow__nodrag"
                  onClick={() => setWizardStep('filling-nodes')}
                  onPointerDown={e => e.stopPropagation()}
                  style={{ fontSize: 12, padding: '6px 12px', background: 'rgba(255,255,255,0.1)' }}
                >
                  ↩ Back
                </button>
              </div>
            </div>
          </div>
        </div>
        <Handle type="source" position={Position.Bottom} className="master-handle" />
      </div>
    );
  }

  // ── DEFAULT (post-gen summary) ──
  const generatedCount = (data as any).generatedPlacedWidgets?.length || 0;

  return (
    <div className={`master-node ${selected ? 'selected' : ''}`}>
      <div className="master-node-header">
        <span className="master-node-icon">🚀</span>
        <span className="master-node-title">{projectName || 'App Blueprint'}</span>
        <ScaleBadge scale={data.scale} />
      </div>
      <div className="master-node-body">
        <div className="gen-info">
          <span>📦 {codeNodes.length} nodes</span>
          <span>🔗 {store.edges.length} edges</span>
          <span>🎯 {data.selectedOS || 'linux'}</span>
          <span>{includeGUI ? '🖥 With GUI' : '💻 CLI Only'}</span>
        </div>

        {/* Generated UI Controls indicator */}
        {generatedCount > 0 && (
          <div style={{
            marginTop: 8,
            padding: '4px 8px',
            background: 'rgba(167,139,250,0.1)',
            border: '1px solid rgba(167,139,250,0.3)',
            fontSize: 11,
            color: '#a78bfa',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span>🎛</span>
            <span>{generatedCount} widget{generatedCount !== 1 ? 's' : ''} ready</span>
          </div>
        )}

        {/* Auto-Create UI Controls button */}
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            className="master-build-btn react-flow__nodrag"
            onClick={handleAutoCreateUI}
            disabled={creatingUI}
            onPointerDown={e => e.stopPropagation()}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: 12,
              fontWeight: 600,
              background: creatingUI
                ? 'rgba(167,139,250,0.1)'
                : 'rgba(167,139,250,0.2)',
              border: '1px solid #a78bfa',
              color: creatingUI ? '#a78bfa' : '#c4b5fd',
              cursor: creatingUI ? 'default' : 'pointer',
              opacity: creatingUI ? 0.6 : 1,
            }}
          >
            {creatingUI
              ? '⏳ LLM generating UI controls...'
              : '🎛 Auto-Create UI Controls'}
          </button>

          {/* Result message */}
          {uiCreateResult && (
            <div style={{
              padding: '4px 8px',
              fontSize: 10,
              background: uiCreateResult.startsWith('✅')
                ? 'rgba(74,222,128,0.1)'
                : 'rgba(248,113,113,0.1)',
              border: '1px solid',
              borderColor: uiCreateResult.startsWith('✅')
                ? 'rgba(74,222,128,0.2)'
                : 'rgba(248,113,113,0.2)',
              color: uiCreateResult.startsWith('✅') ? '#4ade80' : '#f87171',
            }}>
              {uiCreateResult}
            </div>
          )}

        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="master-handle" />
    </div>
  );
}

/** Map OS to primary programming language — single source of truth */
function getPrimaryLanguageForOS(os: OSType): string {
  switch (os) {
    case 'linux': return 'go';
    case 'windows': return 'csharp';
    case 'mac': return 'swift';
    case 'ios': return 'swift';
    case 'android': return 'kotlin';
    default: return 'go';
  }
}

async function handleBuildFallback(goal: string, purpose: string, os: OSType, scale: AppScale) {
  const store = useProjectStore.getState();
  try {
    const res = await fetch('/api/architect/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal, purpose, targetOS: os, scale }),
      signal: AbortSignal.timeout(120000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.nodes?.length) {
        const masterId = store.nodes.find(n => n.type === 'master')?.id;
        store.replaceNodes(data.nodes, data.edges, os, masterId);
        store.setWizardStep('filling-nodes');
        return;
      }
    }
  } catch { /* fallback */ }

  const lang = getPrimaryLanguageForOS(os);
  const fallbackNodes = [
    { id: getNextNodeId(), type: 'input', position: { x: 250, y: 300 }, data: { label: 'User Input', description: 'Handle user input and validate entries.', type: 'input', status: 'pending' as const, language: lang, appGoal: goal, appPurpose: purpose } },
    { id: getNextNodeId(), type: 'logic', position: { x: 250, y: 470 }, data: { label: 'Core Logic', description: 'Main application processing logic.', type: 'logic', status: 'pending' as const, language: lang, appGoal: goal, appPurpose: purpose } },
    { id: getNextNodeId(), type: 'database', position: { x: 50, y: 470 }, data: { label: 'Data Storage', description: 'Store and retrieve application data.', type: 'database', status: 'pending' as const, language: lang, appGoal: goal, appPurpose: purpose } },
    { id: getNextNodeId(), type: 'ui', position: { x: 250, y: 640 }, data: { label: 'User Interface', description: 'Render the app interface.', type: 'ui', status: 'pending' as const, language: lang, appGoal: goal, appPurpose: purpose } },
  ];
  const masterId = store.nodes.find(n => n.type === 'master')?.id;
  store.replaceNodes(fallbackNodes, [
    { id: 'edge_0_1', source: fallbackNodes[0].id, target: fallbackNodes[1].id, type: 'default' as const },
    { id: 'edge_1_2', source: fallbackNodes[1].id, target: fallbackNodes[2].id, type: 'default' as const },
    { id: 'edge_1_3', source: fallbackNodes[1].id, target: fallbackNodes[3].id, type: 'default' as const },
  ], os, masterId);
  store.setWizardStep('filling-nodes');
}

export default memo(MasterNode);
