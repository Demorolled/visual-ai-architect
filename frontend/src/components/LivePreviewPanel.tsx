/**
 * LivePreviewPanel — shows live app preview during the build process.
 *
 * Features:
 * - Shows each generated file as a selectable tab
 * - Live preview of HTML/JS output in an iframe sandbox
 * - Console output panel with error highlighting
 * - Per-file validation status (pass/fail/warning)
 * - Quick "Regenerate" and "Test" buttons per file
 * - Full "Run All Tests" on all generated files
 * - Suggestion panel for improvements
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { checkBackendConnection, getBackendUrl } from '../utils/apiUrl';
import { useProjectStore } from '../store/projectStore';
import { api, ensureServerProject } from '../api/client';
import './LivePreviewPanel.css';

interface GeneratedFile {
  fileName: string;
  language: string;
  code: string;
  nodeId: string;
  nodeLabel: string;
  dependencies: string[];
  exports: string[];
  errors: string[];
  validated: boolean;
}

interface SandboxTestResult {
  testName: string;
  passed: boolean;
  detail: string;
}

/**
 * Pick the file to show in the preview by default. GUI apps always have an
 * index.html entry — prefer it (falling back to any .html) so the app shows
 * up immediately instead of a random logic/UI source file.
 */
function pickPreviewFile(files: GeneratedFile[]): GeneratedFile | undefined {
  if (!files.length) return undefined;
  return (
    files.find(f => /^index\.html?$/i.test(f.fileName)) ||
    files.find(f => f.language === 'html') ||
    files[0]
  );
}

interface FixReport {
  fileName: string;
  nodeLabel: string;
  success: boolean;
  fixed: boolean;
  fixAttempts: number;
  totalTimeMs: number;
  report: string;
  finalCode: string;
  language: string;
  errors: string[];
}

export default function LivePreviewPanel() {
  const store = useProjectStore();
  const { nodes, projectName } = store;
  const setCodeReviewResult = useProjectStore(s => s.setCodeReviewResult);
  const sitePreviewUrl = useProjectStore(s => s.sitePreviewUrl);
  const setSitePreviewUrl = useProjectStore(s => s.setSitePreviewUrl);

  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string>('');
  const [consoleOutput, setConsoleOutput] = useState<string[]>([]);
  const [testResults, setTestResults] = useState<SandboxTestResult[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [fixReports, setFixReports] = useState<FixReport[]>([]);
  const [activeTab, setActiveTab] = useState<'preview' | 'console' | 'source' | 'tests' | 'suggestions'>('preview');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [showFullApp, setShowFullApp] = useState(true);

  // ── Streaming progress from Socket.IO ──
  // ── On mount, load any pre-generated files from the node store ──
  // This bridges the gap when App.tsx's handleGenerate generates files
  // and opens the floating preview — the panel starts with the existing
  // code instead of blank white + requiring a redundant second generation.
  useEffect(() => {
    const state = useProjectStore.getState();
    const workNodes = state.nodes.filter(n => n.type !== 'master');
    const filesFromNodes = workNodes
      .filter(n => n.data?.generatedCode)
      .map(n => ({
        fileName: (n.data?.label || n.id)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') + '.' + (n.data?.language === 'python' ? 'py' : n.data?.language === 'go' ? 'go' : n.data?.language === 'rust' ? 'rs' : n.data?.language === 'css' ? 'css' : n.data?.language === 'html' ? 'html' : 'ts'),
        language: n.data?.language || 'typescript',
        code: n.data?.generatedCode || '',
        nodeId: n.id,
        nodeLabel: n.data?.label || n.id,
        dependencies: [] as string[],
        exports: [] as string[],
        errors: [] as string[],
        validated: true,
      }));
    if (filesFromNodes.length > 0) {
      setGeneratedFiles(filesFromNodes);
      // Auto-select the GUI entry (index.html) when present so GUI apps show
      // up in the preview without extra steps. pickPreviewFile always returns a
      // file for a non-empty list.
      setSelectedFile(pickPreviewFile(filesFromNodes)!.fileName);
      setConsoleOutput(prev => [...prev, `📂 Loaded ${filesFromNodes.length} pre-generated files from the canvas`]);
    }
  }, []);

  const [streamProgress, setStreamProgress] = useState<{
    visible: boolean;
    percent: number;
    batch: number;
    totalBatches: number;
    generatingNodes: string[];
    phase: string;
    message: string;
  }>({ visible: false, percent: 0, batch: 0, totalBatches: 0, generatingNodes: [], phase: '', message: '' });

  // ── Detect if we have multiple file types for a composite app ──
  const hasHtmlFile = generatedFiles.some(f => f.language === 'html');
  const hasCssFile = generatedFiles.some(f => f.language === 'css');
  const hasJsFile = generatedFiles.some(f => f.language === 'javascript' || f.language === 'typescript');
  const hasMultiFileApp = (hasHtmlFile ? 1 : 0) + (hasCssFile ? 1 : 0) + (hasJsFile ? 1 : 0) >= 2;

  // ── Streaming progress via Socket.IO ──
  const socketRef = useRef<Socket | null>(null);

  // ── Check backend connectivity on mount ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await checkBackendConnection();
      if (!cancelled) {
        setBackendStatus(ok ? 'online' : 'offline');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Connect to Socket.IO for generation progress ──
  useEffect(() => {
    if (socketRef.current) return;

    socketRef.current = io({
      path: '/ws',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
    });

    socketRef.current.on('connect', () => {
      console.log('[LivePreview] Socket.IO connected');
    });

    socketRef.current.on('architect_progress', (data: {
      phase: string;
      message: string;
      percent: number;
    }) => {
      if (data.phase === 'done' || data.phase === 'error') {
        setStreamProgress({ visible: false, percent: 100, batch: 0, totalBatches: 0, generatingNodes: [], phase: '', message: '' });
      }
      setGenerationStatus(data.message);
    });

    socketRef.current.on('generation_progress', (data: {
      batch: number;
      totalBatches: number;
      batchSize: number;
      generatingNodes: string[];
      percent: number;
      phase: string;
      message?: string;
    }) => {
      setStreamProgress({
        visible: data.phase !== 'done',
        percent: data.percent,
        batch: data.batch,
        totalBatches: data.totalBatches,
        generatingNodes: data.generatingNodes,
        phase: data.phase,
        message: data.message || '',
      });

      // Update console progress (explicit phase message wins over batch label)
      if (data.message) {
        setGenerationStatus(data.message);
      } else if (data.generatingNodes.length > 0) {
        const fileNames = data.generatingNodes.join(', ');
        setGenerationStatus(`⏳ Batch ${data.batch + 1}/${data.totalBatches}: ${fileNames}`);
      }
    });

    socketRef.current.on('disconnect', () => {
      console.log('[LivePreview] Socket.IO disconnected');
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const consoleRef = useRef<HTMLDivElement>(null);

  // ── Generate all files (auto-creates project if needed) ──
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setGenerationStatus('Preparing project...');
    setStreamProgress({ visible: true, percent: 0, batch: 0, totalBatches: 0, generatingNodes: [], phase: 'starting', message: '' });
    setConsoleOutput(prev => [...prev, `⚡ Starting per-file generation for "${projectName}"...`]);

    let projectId = localStorage.getItem('current-project-id');

    // Ensure the backend has a project registered for this graph — auto-creating
    // when none exists, and re-registering when a server restart wiped the
    // in-memory registry (a stale id would make generation 404).
    try {
      const state = useProjectStore.getState();
      projectId = await ensureServerProject({
        projectId,
        name: state.projectName || 'Untitled',
        targetOS: state.targetOS || 'linux',
        nodes: state.nodes.filter((n: any) => n.type !== 'master'),
        edges: state.edges,
        trees: state.trees,
      });
    } catch (err: any) {
      setConsoleOutput(prev => [...prev, `❌ Could not prepare server project: ${err.message}`]);
      setConsoleOutput(prev => [...prev, '💡 Save the project first using the Project Manager.']);
      setStreamProgress({ visible: false, percent: 0, batch: 0, totalBatches: 0, generatingNodes: [], phase: '', message: '' });
      setIsGenerating(false);
      return;
    }

    setGenerationStatus('Generating files...');

    try {
      // Default to fast preview (skip sandbox validation + security scan) for speed.
      // Validation can be run separately via the "Run Tests" button, and the "Fix All"
      // button fixes failing files individually. This avoids the preview getting stuck
      // on slow or failing sandbox validation during initial generation.
      const skipValidation = localStorage.getItem('vaia-fast-preview') !== 'false';
      const options = { skipValidation, skipSecurityScan: skipValidation };
      const res = await api.generateFiles(projectId!, options);
      const data = res.data;

      if (data.success && data.files) {
        setGeneratedFiles(data.files);
        if (data.files.length > 0) {
          // Auto-select the GUI entry (index.html) so generated GUI apps render
          // in the preview immediately instead of showing a source wrapper.
          setSelectedFile(pickPreviewFile(data.files)!.fileName);
        }
        setConsoleOutput(prev => [
          ...prev,
          `✅ Generated ${data.files.length} files (${data.totalChars.toLocaleString()} chars)`,
          `   Validated: ${data.validatedCount} / ${data.files.length}`,
          ...(data.failedCount > 0 ? [`⚠️ ${data.failedCount} file(s) have errors`] : []),
        ]);
        // Save code review results to the project store for persistence
        if (data.codeReview) {
          setCodeReviewResult(data.codeReview);
        }

        setGenerationStatus(`Generated ${data.files.length} files — ${data.validatedCount} validated`);
      } else {
        setConsoleOutput(prev => [...prev, `❌ Generation failed: ${data.error || 'Unknown error'}`]);
        setGenerationStatus('Generation failed');
        setStreamProgress({ visible: false, percent: 0, batch: 0, totalBatches: 0, generatingNodes: [], phase: '', message: '' });
      }
    } catch (err: any) {
      setConsoleOutput(prev => [...prev, `❌ Generation error: ${err.message}`]);
      setGenerationStatus('Error');
      setStreamProgress({ visible: false, percent: 0, batch: 0, totalBatches: 0, generatingNodes: [], phase: '', message: '' });
    }

    setIsGenerating(false);
  }, [projectName]);

  // ── Regenerate a single file ──
  const handleRegenerateFile = useCallback(async (file: GeneratedFile) => {
    const projectId = localStorage.getItem('current-project-id');
    if (!projectId) {
      setConsoleOutput(prev => [...prev, '⚠️ No saved project to regenerate from — save the project first.']);
      return;
    }

    setConsoleOutput(prev => [...prev, `♻️ Regenerating "${file.fileName}"...`]);

    try {
      const res = await api.generateSingleFile(projectId, file.nodeId);
      const data = res.data;

      if (data.success && data.file) {
        setGeneratedFiles(prev =>
          prev.map(f => f.fileName === file.fileName ? { ...data.file, dependencies: f.dependencies, exports: data.file.exports || f.exports } : f)
        );
        setConsoleOutput(prev => [...prev, `✅ Regenerated "${file.fileName}"`]);
      }
    } catch (err: any) {
      const status = (err as any)?.response?.status;
      if (status === 404) {
        setConsoleOutput(prev => [...prev,
          `⚠️ Can't regenerate "${file.fileName}": its node isn't saved in the backend project.`,
          '   Save the project first, or use "⚡ Generate All" to rebuild from the canvas.']);
      } else {
        setConsoleOutput(prev => [...prev, `❌ Regeneration failed: ${err.message}`]);
      }
    }
  }, []);

  // ── Validate & Fix a single file ──
  const handleFixFile = useCallback(async (file: GeneratedFile) => {
    setIsFixing(true);
    setConsoleOutput(prev => [...prev, `🔧 Running error correction on "${file.fileName}"...`]);

    try {
      const res = await api.validateAndFix({
        code: file.code,
        language: file.language,
        projectName: projectName || 'Untitled',
        goal: 'Fix validation errors in generated code',
        maxAttempts: 3,
      });
      const data = res.data;

      const report: FixReport = {
        fileName: file.fileName,
        nodeLabel: file.nodeLabel,
        success: data.success,
        fixed: data.fixed,
        fixAttempts: data.fixAttempts,
        totalTimeMs: data.totalTimeMs,
        report: data.report,
        finalCode: data.finalCode,
        language: data.language || file.language,
        errors: data.finalValidation?.errors || [],
      };

      setFixReports(prev => [...prev, report]);

      // Update the generated file with fixed code
      setGeneratedFiles(prev =>
        prev.map(f =>
          f.fileName === file.fileName
            ? { ...f, code: data.finalCode, validated: data.success, errors: data.finalValidation?.errors || [] }
            : f
        )
      );

      if (data.success) {
        setConsoleOutput(prev => [...prev,
          `✅ Fixed "${file.fileName}" after ${data.fixAttempts} attempt(s) (${data.totalTimeMs}ms)`,
        ]);
      } else {
        setConsoleOutput(prev => [...prev,
          `❌ Could not fix "${file.fileName}" after ${data.fixAttempts} attempt(s)`,
          `   Last errors: ${(data.finalValidation?.errors || ['Unknown']).join('; ').slice(0, 200)}`,
        ]);
      }
    } catch (err: any) {
      setConsoleOutput(prev => [...prev, `❌ Fix failed for "${file.fileName}": ${err.message}`]);
      setFixReports(prev => [...prev, {
        fileName: file.fileName,
        nodeLabel: file.nodeLabel,
        success: false,
        fixed: false,
        fixAttempts: 0,
        totalTimeMs: 0,
        report: `Error during fix attempt: ${err.message}`,
        finalCode: file.code,
        language: file.language,
        errors: [err.message],
      }]);
    }

    setIsFixing(false);
  }, [projectName]);

  // ── Fix ALL failing files in sequence ──
  const handleFixAll = useCallback(async () => {
    const failingFiles = generatedFiles.filter(f => !f.validated && f.errors.length > 0);
    if (failingFiles.length === 0) {
      setConsoleOutput(prev => [...prev, '✅ No files need fixing — all validated!']);
      return;
    }

    setIsFixing(true);
    setFixReports([]);
    setConsoleOutput(prev => [...prev, `🔧 Fixing ${failingFiles.length} file(s) with errors...`]);
    let localFixedCount = 0;

    for (let i = 0; i < failingFiles.length; i++) {
      const file = failingFiles[i];
      setConsoleOutput(prev => [...prev, `📦 [${i + 1}/${failingFiles.length}] Fixing "${file.fileName}"...`]);

      try {
        const res = await api.validateAndFix({
          code: file.code,
          language: file.language,
          projectName: projectName || 'Untitled',
          goal: 'Fix validation errors in generated code',
          maxAttempts: 3,
        });
        const data = res.data;

        setFixReports(prev => [...prev, {
          fileName: file.fileName,
          nodeLabel: file.nodeLabel,
          success: data.success,
          fixed: data.fixed,
          fixAttempts: data.fixAttempts,
          totalTimeMs: data.totalTimeMs,
          report: data.report,
          finalCode: data.finalCode,
          language: data.language || file.language,
          errors: data.finalValidation?.errors || [],
        }]);

        setGeneratedFiles(prev =>
          prev.map(f =>
            f.fileName === file.fileName
              ? { ...f, code: data.finalCode, validated: data.success, errors: data.finalValidation?.errors || [] }
              : f
          )
        );

        if (data.success) {
          localFixedCount++;
          setConsoleOutput(prev => [...prev, `  ✅ Fixed (${data.fixAttempts} attempts, ${data.totalTimeMs}ms)`]);
        } else {
          setConsoleOutput(prev => [...prev, `  ❌ Failed after ${data.fixAttempts} attempts`]);
        }
      } catch (err: any) {
        setConsoleOutput(prev => [...prev, `  ❌ Error: ${err.message}`]);
      }
    }

    setConsoleOutput(prev => [...prev, `🏁 Fix batch complete: ${localFixedCount}/${failingFiles.length} fixed`]);
    setIsFixing(false);

    // Switch to suggestions tab to show results
    setActiveTab('suggestions');
  }, [generatedFiles, projectName]);

  // ── Run tests on all files ──
  const handleRunTests = useCallback(async () => {
    setIsTesting(true);
    setTestResults([]);
    setConsoleOutput(prev => [...prev, '🧪 Running validation tests on all files...']);

    const results: SandboxTestResult[] = [];

    // Test 1: All files generated
    results.push({
      testName: 'File count',
      passed: generatedFiles.length > 0,
      detail: `${generatedFiles.length} files generated`,
    });

    // Test 2: Syntax validation
    const validatedFiles = generatedFiles.filter(f => f.validated);
    results.push({
      testName: 'Syntax validation',
      passed: validatedFiles.length === generatedFiles.length,
      detail: `${validatedFiles.length}/${generatedFiles.length} files pass syntax check`,
    });

    // Test 3: No critical errors
    const filesWithErrors = generatedFiles.filter(f => f.errors.length > 0);
    results.push({
      testName: 'No critical errors',
      passed: filesWithErrors.length === 0,
      detail: filesWithErrors.length === 0
        ? 'All files are error-free'
        : `${filesWithErrors.length} file(s) have errors: ${filesWithErrors.map(f => f.fileName).join(', ')}`,
    });

    // Test 4: Import consistency
    const missingDeps: string[] = [];
    for (const file of generatedFiles) {
      for (const dep of file.dependencies) {
        const depFile = generatedFiles.find(f => f.nodeLabel === dep);
        if (!depFile) missingDeps.push(`${file.fileName} → ${dep}`);
      }
    }
    results.push({
      testName: 'Import consistency',
      passed: missingDeps.length === 0,
      detail: missingDeps.length === 0
        ? 'All imports resolve correctly'
        : `Missing dependencies: ${missingDeps.join(', ')}`,
    });

    // Test 5: Exports exist for each file
    const filesWithoutExports = generatedFiles.filter(f => f.exports.length === 0 && f.language !== 'css' && f.language !== 'html');
    results.push({
      testName: 'Exports present',
      passed: filesWithoutExports.length === 0,
      detail: filesWithoutExports.length === 0
        ? 'All files export symbols'
        : `${filesWithoutExports.length} file(s) have no exports: ${filesWithoutExports.map(f => f.fileName).join(', ')}`,
    });

    setTestResults(results);
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    setConsoleOutput(prev => [...prev, `🧪 Tests complete: ${passed}/${total} passed`]);
    setIsTesting(false);

    // Generate suggestions based on failures
    const failedTests = results.filter(r => !r.passed);
    if (failedTests.length > 0) {
      setSuggestions(failedTests.map(t => `🔧 ${t.testName}: ${t.detail}`));
    }
  }, [generatedFiles]);

  // ── Build a combined full-app preview from all HTML + CSS + JS files ──
  const buildFullAppPreview = useCallback((): string => {
    const apiBase = getBackendUrl() || 'http://localhost:3001';

    const htmlFiles = generatedFiles.filter(f => f.language === 'html');
    const cssFiles = generatedFiles.filter(f => f.language === 'css');
    const jsFiles = generatedFiles.filter(f => f.language === 'javascript' || f.language === 'typescript');

    // ── Detect if an HTML file was generated by the backend (preview_gui_wrapper) ──
    // The backend-generated index.html already has all CSS/JS inlined, no module imports,
    // error boundaries, loading states, and <base> tag. Use it AS-IS.
    const backendGeneratedHtml = htmlFiles.find(f => f.nodeId === 'preview_gui_wrapper');
    if (backendGeneratedHtml) {
      return backendGeneratedHtml.code;
    }

    // ── Fallback: No backend-generated HTML — assemble a preview ourselves ──
    if (htmlFiles.length === 0) {
      // No HTML file at all — create a wrapper that injects all JS/CSS
      const inlineStyles = cssFiles.map(f => `<style>\n${f.code}\n</style>`).join('\n');
      // Strip TypeScript → JS for preview (the iframe can't parse TS and the
      // parse error is NOT catchable by try/catch — it kills the whole script).
      const inlineScripts = jsFiles.length > 0
        ? `<script>\n${jsFiles.map(f => stripTsForPreview(f.code)).join('\n\n')}\n<\/script>`
        : '';
      return `<!DOCTYPE html>
<html>\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <base href="${apiBase}/">\n  <title>App Preview</title>\n  ${inlineStyles}\n</head>\n<body>\n  <div id="root"></div>\n  ${inlineScripts}\n</body>\n</html>`;
    }

    // ── User-provided HTML (not backend-generated) — inject styles & scripts ──
    // Prefer a file literally named index.html (the GUI entry) over whatever
    // happens to be first in the list.
    const mainHtmlFile = htmlFiles.find(f => /^index\.html?$/i.test(f.fileName)) || htmlFiles[0];
    let mainHtml = mainHtmlFile.code;

    // Inject <base> tag after <head> for relative path resolution
    if (!mainHtml.includes('<base')) {
      mainHtml = mainHtml.replace('<head>', `<head>\n  <base href="${apiBase}/">`);
    }

    // Inject CSS files as inline <style> tags before </head>
    // Use a unique marker to detect if files were already injected (to avoid double-injection)
    const INJECTED_MARKER = '<!-- vaca-injected -->';
    if (cssFiles.length > 0 && !mainHtml.includes(INJECTED_MARKER)) {
      const styleBlock = INJECTED_MARKER + '\n' + cssFiles.map(f => `<style data-file="${f.fileName}">\n${f.code}\n</style>`).join('\n');
      mainHtml = mainHtml.replace('</head>', `${styleBlock}\n</head>`);
    }

    // Inject JS files as inline <script> tags before </body>
    if (jsFiles.length > 0 && !mainHtml.includes(INJECTED_MARKER)) {
      const scriptBlock = INJECTED_MARKER + '\n' + jsFiles.map(f => `<script data-file="${f.fileName}">\n${stripTsForPreview(f.code)}\n<\/script>`).join('\n');
      mainHtml = mainHtml.replace('</body>', `${scriptBlock}\n</body>`);
    }

    // Add viewport meta if missing
    if (!mainHtml.includes('viewport')) {
      mainHtml = mainHtml.replace('<head>', '<head>\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">');
    }

    return mainHtml;
  }, [generatedFiles]);

  // ── Preview the selected file in iframe (per-file mode) ──
  const selectedFileData = generatedFiles.find(f => f.fileName === selectedFile);

  const getPreviewHtml = useCallback(() => {
    // When showFullApp is enabled and we have multiple file types, show the combined app
    if (showFullApp && hasMultiFileApp) {
      return buildFullAppPreview();
    }

    if (!selectedFileData) return '';
    const code = selectedFileData.code;
    const apiBase = getBackendUrl() || 'http://localhost:3001';

    if (selectedFileData.language === 'html') {
      // Inject <base> tag so relative image paths resolve against the backend
      if (code.includes('<head>')) {
        return code.replace('<head>', `<head>\n  <base href="${apiBase}/">`);
      }
      return `<head>\n  <base href="${apiBase}/">\n</head>\n${code}`;
    }

    if (selectedFileData.language === 'css') {
      // Wrap CSS in a minimal HTML page with a preview div
      return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <base href="${apiBase}/">
  <title>Preview: ${selectedFileData.fileName}</title>
  <style>${code}</style>
</head>
<body>
  <div style="padding:20px;font-family:system-ui,sans-serif;">
    <h3>🎨 CSS Preview — ${selectedFileData.fileName}</h3>
    <div class="preview-content">
      <p>Sample text to preview styles</p>
      <button>Button</button>
      <div style="margin-top:10px;padding:10px;border:1px solid #ccc;">Box element</div>
    </div>
  </div>
</body>
</html>`;
    }

    // For JS/TS, create an HTML wrapper that executes the code
    if (selectedFileData.language === 'typescript' || selectedFileData.language === 'javascript') {
      // Strip TypeScript before execution — raw TS in <script> throws a
      // SyntaxError at PARSE time, which try/catch cannot catch.
      const execCode = selectedFileData.language === 'typescript' ? stripTsForPreview(code) : code;
      return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <base href="${apiBase}/">
  <title>Preview: ${selectedFileData.fileName}</title>
</head>
<body>
  <div id="root" style="padding:20px;font-family:system-ui,sans-serif;"></div>
  <script>try { ${execCode} } catch(e) { document.getElementById('root').innerHTML = '<div style="color:red;padding:12px;background:#1a1a2e;border-radius:8px;margin-top:8px;">⚠️ ' + e.message + '</div>'; }</script>
</body>
</html>`;
    }

    // For other languages, show as highlighted source
    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Preview: ${selectedFileData.fileName}</title>
<style>body{background:#1a1a2e;color:#e0e0e0;padding:20px;font-family:monospace;white-space:pre-wrap;}</style>
</head>
<body><pre>${escapeHtml(code)}</pre></body>
</html>`;
  }, [selectedFileData, showFullApp, hasMultiFileApp, buildFullAppPreview]);

  // ── Update iframe when preview source changes ──
  useEffect(() => {
    if (!iframeRef.current) return;
    // External dropped-site preview (from a dropped folder served as a site)
    // takes priority over generated-file previews.
    if (sitePreviewUrl) {
      iframeRef.current.src = sitePreviewUrl;
      return;
    }
    // If full app mode and multiple files, always show the combined app
    if (showFullApp && hasMultiFileApp) {
      const html = buildFullAppPreview();
      iframeRef.current.srcdoc = html;
      return;
    }
    if (!selectedFileData) return;
    const html = getPreviewHtml();
    iframeRef.current.srcdoc = html;
  }, [selectedFileData, getPreviewHtml, showFullApp, hasMultiFileApp, buildFullAppPreview, sitePreviewUrl]);

  // ── Auto-scroll console ──
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [consoleOutput]);

  // ── Compute summary stats ──
  const totalFiles = generatedFiles.length;
  const validatedCount = generatedFiles.filter(f => f.validated).length;
  const filesWithErrors = generatedFiles.filter(f => f.errors.length > 0);
  const totalErrors = filesWithErrors.reduce((sum, f) => sum + f.errors.length, 0);

  const codeNodes = nodes.filter(n => n.type !== 'master');

  return (
    <div className="live-preview-panel">
      {/* ── Header ── */}
      <div className="lpp-header">
        <div className="lpp-title-row">
          <h3 className="lpp-title">
            <span className="lpp-icon">🖥</span>
            Live Preview
            {isGenerating && <span className="lpp-spinner" />}
          </h3>
          <div className="lpp-actions">
            <button
              className="lpp-btn lpp-btn-primary"
              onClick={handleGenerate}
              disabled={isGenerating || codeNodes.length === 0}
              title="Generate all files"
            >
              {isGenerating ? '⏳ Generating...' : '⚡ Generate All'}
            </button>
            {generatedFiles.length > 0 && (
              <button
                className="lpp-btn lpp-btn-test"
                onClick={handleRunTests}
                disabled={isTesting}
              >
                {isTesting ? '⏳ Testing...' : '🧪 Run Tests'}
              </button>
            )}
            {filesWithErrors.length > 0 && (
              <button
                className="lpp-btn lpp-btn-fix"
                onClick={handleFixAll}
                disabled={isFixing || isGenerating}
                title="Run error correction on all failing files"
              >
                {isFixing ? '⏳ Fixing...' : `🔧 Fix All (${filesWithErrors.length})`}
              </button>
            )}
          </div>
        </div>
        {generationStatus && (
          <div className={`lpp-status ${generationStatus.includes('failed') || generationStatus.includes('Error') ? 'lpp-status-error' : generationStatus.includes('Generated') ? 'lpp-status-ok' : ''}`}>
            {generationStatus}
          </div>
        )}
        {/* Summary line */}
        {totalFiles > 0 && (
          <div className="lpp-summary">
            <span className="lpp-stat">📄 {totalFiles} files</span>
            <span className={`lpp-stat ${validatedCount === totalFiles ? 'lpp-stat-ok' : 'lpp-stat-warn'}`}>
              ✅ {validatedCount}/{totalFiles} validated
            </span>
            {totalErrors > 0 && (
              <span className="lpp-stat lpp-stat-error">⚠️ {totalErrors} errors</span>
            )}
          </div>
        )}

        {/* ── Streaming Progress Bar ── */}
        {streamProgress.visible && (
          <div className="lpp-stream-progress">
            <div className="lpp-stream-header">
              <span className="lpp-stream-label">
                {streamProgress.phase === 'starting' && '⚡ Starting code generation...'}
                {streamProgress.phase === 'generating' && (
                  <>
                    📦 Batch {streamProgress.batch + 1}/{streamProgress.totalBatches}
                    {streamProgress.generatingNodes.length > 0 && (
                      <span className="lpp-stream-files">
                        {' — '}{streamProgress.generatingNodes.join(', ')}
                      </span>
                    )}
                  </>
                )}
                {streamProgress.phase === 'done' && '✅ Generation complete'}
              </span>
              <span className="lpp-stream-pct">{streamProgress.percent}%</span>
            </div>
            {streamProgress.message && (
              <div className="lpp-stream-message">{streamProgress.message}</div>
            )}
            <div className="lpp-stream-track">
              <div
                className="lpp-stream-fill"
                style={{ width: `${streamProgress.percent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="lpp-body">
        {/* File Tabs + Full App Toggle */}
        {totalFiles > 0 && (
          <div className="lpp-file-tabs">
            {hasMultiFileApp && (
              <button
                className={`lpp-file-tab lpp-app-toggle ${showFullApp ? 'active' : ''}`}
                onClick={() => {
                  setShowFullApp(!showFullApp);
                  // Auto-select first file when switching to per-file mode
                  if (showFullApp && !selectedFile && generatedFiles.length > 0) {
                    setSelectedFile(generatedFiles[0].fileName);
                  }
                }}
                title={showFullApp ? 'Switch to per-file preview' : 'Show full app preview with all files combined'}
              >
                {showFullApp ? '📱 Full App' : '📄 Per-File'}
              </button>
            )}
            {/* Only show file tabs when NOT in full-app mode */}
            {!showFullApp && generatedFiles.map(file => (
              <button
                key={file.fileName}
                className={`lpp-file-tab ${selectedFile === file.fileName ? 'active' : ''} ${file.validated ? 'validated' : file.errors.length > 0 ? 'has-errors' : ''}`}
                onClick={() => setSelectedFile(file.fileName)}
                title={`${file.fileName} — ${file.validated ? 'Validated ✅' : file.errors.length > 0 ? `${file.errors.length} error(s)` : 'Pending'}`}
              >
                <span className="lpp-file-icon">
                  {file.language === 'html' ? '🌐' :
                   file.language === 'css' ? '🎨' :
                   file.language === 'typescript' ? '📘' :
                   file.language === 'python' ? '🐍' : '📄'}
                </span>
                <span className="lpp-file-name">{file.fileName}</span>
                <span className={`lpp-file-badge ${file.validated ? 'badge-ok' : file.errors.length > 0 ? 'badge-error' : 'badge-pending'}`}>
                  {file.validated ? '✓' : file.errors.length > 0 ? '✗' : '○'}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Tab Content */}
        <div className="lpp-content">
          {/* Tab Navigation */}
          <div className="lpp-view-tabs">
            {['preview', 'source', 'console', 'tests', 'suggestions'].map(tab => (
              <button
                key={tab}
                className={`lpp-view-tab ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab as any)}
              >
                {tab === 'preview' && '🖥 Preview'}
                {tab === 'source' && '📄 Source'}
                {tab === 'console' && '🖥️ Console'}
                {tab === 'tests' && '🧪 Tests'}
                {tab === 'suggestions' && `💡 Suggestions${suggestions.length > 0 ? ` (${suggestions.length})` : ''}`}
              </button>
            ))}
          </div>

          {/* Preview Panel */}
          {activeTab === 'preview' && (
            <div className="lpp-preview-area">
              {/* External dropped-site preview banner */}
              {sitePreviewUrl && (
                <div className="lpp-external-banner">
                  <span className="lpp-external-label">🌐 External Site Preview</span>
                  <span className="lpp-external-hint">Dropped folder served as a playable app</span>
                  <div className="lpp-external-actions">
                    <button
                      className="lpp-btn lpp-btn-sm"
                      onClick={() => window.open(sitePreviewUrl, '_blank')}
                      title="Open the site in a full browser tab"
                    >
                      ↗ New Tab
                    </button>
                    <button
                      className="lpp-btn lpp-btn-sm lpp-btn-danger"
                      onClick={() => setSitePreviewUrl(null)}
                      title="Return to the generated-file preview"
                    >
                      ✕ Back to Generated
                    </button>
                  </div>
                </div>
              )}
              {(sitePreviewUrl || (showFullApp && hasMultiFileApp) || selectedFileData) ? (
                <iframe
                  ref={iframeRef}
                  className="lpp-iframe"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals"
                  title={sitePreviewUrl ? 'External Site Preview' : `${showFullApp ? 'App Preview' : 'Preview: ' + (selectedFileData?.fileName || 'unknown')}`}
                />
              ) : (
                <div className="lpp-empty-state">
                  <div className="lpp-empty-icon">🖥</div>
                  <h4>No Preview Available</h4>
                  <p>Generate files to see a live preview of each file.</p>
                </div>
              )}
            </div>
          )}

          {/* Source Panel */}
          {activeTab === 'source' && (
            <div className="lpp-source-area">
              {selectedFileData ? (
                <div className="lpp-source-view">
                  <div className="lpp-source-header">
                    <span className="lpp-source-lang">{selectedFileData.language}</span>
                    <span className="lpp-source-path">{selectedFileData.fileName}</span>
                    <div className="lpp-source-actions">
                      <span className="lpp-source-deps">
                        {selectedFileData.dependencies.length > 0
                          ? `Depends on: ${selectedFileData.dependencies.join(', ')}`
                          : 'No dependencies'}
                      </span>
                      {!selectedFileData.validated && selectedFileData.errors.length > 0 && (
                        <button
                          className="lpp-btn lpp-btn-sm lpp-btn-fix"
                          onClick={() => handleFixFile(selectedFileData)}
                          disabled={isFixing || isGenerating}
                        >
                          {isFixing ? '⏳' : '🔧 Fix Errors'}
                        </button>
                      )}
                      <button
                        className="lpp-btn lpp-btn-sm"
                        onClick={() => handleRegenerateFile(selectedFileData)}
                        disabled={isGenerating}
                      >
                        ♻️ Regenerate
                      </button>
                    </div>
                  </div>
                  <pre className="lpp-source-code">
                    <code>{selectedFileData.code}</code>
                  </pre>
                </div>
              ) : (
                <div className="lpp-empty-state">
                  <div className="lpp-empty-icon">📄</div>
                  <h4>Select a File</h4>
                  <p>Click a file tab above to view its source code.</p>
                </div>
              )}
            </div>
          )}

          {/* Console Panel */}
          {activeTab === 'console' && (
            <div className="lpp-console-area">
              <div className="lpp-console-header">
                <span>Console Output ({consoleOutput.length} lines)</span>
                <button
                  className="lpp-btn lpp-btn-sm lpp-btn-danger"
                  onClick={() => setConsoleOutput([])}
                >
                  ✕ Clear
                </button>
              </div>
              <div className="lpp-console-output" ref={consoleRef}>
                {consoleOutput.length === 0 ? (
                  <div className="lpp-console-empty">
                    ▶ Click "Generate All" to start building your app
                  </div>
                ) : (
                  consoleOutput.map((line, i) => (
                    <div
                      key={i}
                      className={`lpp-console-line ${
                        line.startsWith('✅') || line.startsWith('🧪') ? 'lpp-console-success' :
                        line.startsWith('❌') || line.startsWith('⚠️') ? 'lpp-console-error' :
                        line.startsWith('♻️') || line.startsWith('⚡') ? 'lpp-console-info' : ''
                      }`}
                    >
                      {line}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Tests Panel */}
          {activeTab === 'tests' && (
            <div className="lpp-tests-area">
              {testResults.length === 0 ? (
                <div className="lpp-empty-state">
                  <div className="lpp-empty-icon">🧪</div>
                  <h4>No Tests Run</h4>
                  <p>Click "Run Tests" to validate all generated files.</p>
                </div>
              ) : (
                <div className="lpp-tests-list">
                  <div className="lpp-tests-summary">
                    <span>
                      {testResults.filter(r => r.passed).length}/{testResults.length} tests passed
                    </span>
                    <span className={testResults.every(r => r.passed) ? 'lpp-tests-all-pass' : 'lpp-tests-has-fail'}>
                      {testResults.every(r => r.passed) ? '✅ All tests passing' : '⚠️ Some tests failed'}
                    </span>
                  </div>
                  {testResults.map((result, i) => (
                    <div key={i} className={`lpp-test-row ${result.passed ? 'test-passed' : 'test-failed'}`}>
                      <span className="lpp-test-icon">{result.passed ? '✅' : '❌'}</span>
                      <div className="lpp-test-info">
                        <span className="lpp-test-name">{result.testName}</span>
                        <span className="lpp-test-detail">{result.detail}</span>
                      </div>
                    </div>
                  ))}

                  {/* Suggestion prompt when tests fail */}
                  {testResults.some(r => !r.passed) && (
                    <div className="lpp-tests-fix-prompt">
                      <button
                        className="lpp-btn lpp-btn-suggestion"
                        onClick={() => {
                          setActiveTab('suggestions');
                        }}
                      >
                        💡 Show Fix Suggestions
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Suggestions Panel */}
          {activeTab === 'suggestions' && (
            <div className="lpp-suggestions-area">
              {suggestions.length === 0 && testResults.length === 0 ? (
                <div className="lpp-empty-state">
                  <div className="lpp-empty-icon">💡</div>
                  <h4>No Suggestions Yet</h4>
                  <p>Run tests to get AI-powered suggestions for improving your app.</p>
                </div>
              ) : (
                <div className="lpp-suggestions-list">
                  <h4 className="lpp-suggestions-title">
                    💡 Suggestions & Improvements
                    {suggestions.length > 0 && <span className="lpp-suggestions-count">{suggestions.length}</span>}
                  </h4>
                  {suggestions.length === 0 ? (
                    <div className="lpp-suggestions-empty">
                      ✅ All tests pass — no suggestions needed.
                    </div>
                  ) : (
                    suggestions.map((s, i) => (
                      <div key={i} className="lpp-suggestion-item">
                        <span className="lpp-suggestion-text">{s}</span>
                      </div>
                    ))
                  )}

                  {/* ── Fix Reports ── */}
                  {fixReports.length > 0 && (
                    <div className="lpp-fix-reports">
                      <h4 className="lpp-fix-reports-title">
                        🔧 Error Correction Results
                        <span className="lpp-fix-reports-count">
                          {fixReports.filter(r => r.success).length}/{fixReports.length} fixed
                        </span>
                      </h4>
                      {fixReports.map((report, i) => (
                        <details key={i} className={`lpp-fix-report ${report.success ? 'fix-success' : 'fix-failed'}`}>
                          <summary className="lpp-fix-report-summary">
                            <span className="lpp-fix-report-icon">{report.success ? '✅' : '❌'}</span>
                            <span className="lpp-fix-report-name">{report.fileName}</span>
                            <span className="lpp-fix-report-meta">
                              {report.fixAttempts > 0
                                ? `${report.fixAttempts} fix attempt(s)`
                                : 'no fix needed'}
                              {report.totalTimeMs > 0 && ` · ${report.totalTimeMs}ms`}
                            </span>
                          </summary>
                          <div className="lpp-fix-report-detail">
                            <pre className="lpp-fix-report-text">{report.report}</pre>
                          </div>
                        </details>
                      ))}
                    </div>
                  )}

                  {/* Quality suggestions based on patterns */}
                  {generatedFiles.length > 0 && (
                    <div className="lpp-suggestion-group">
                      <h5>📊 Code Quality Observations</h5>
                      <ul className="lpp-suggestion-observations">
                        {generatedFiles.filter(f => f.code.includes('TODO')).length > 0 && (
                          <li>
                            ⚠️ {generatedFiles.filter(f => f.code.includes('TODO')).length} file(s) contain TODO placeholders
                            — consider implementing them for a complete app.
                          </li>
                        )}
                        {generatedFiles.filter(f => f.code.length < 50).length > 0 && (
                          <li>
                            📝 {generatedFiles.filter(f => f.code.length < 50).length} file(s) have minimal code
                            — they may need more implementation detail.
                          </li>
                        )}
                        {totalFiles === 1 && (
                          <li>
                            🏗️ Only 1 file generated. Consider adding more architecture nodes for a complete app.
                          </li>
                        )}
                        {validatedCount < totalFiles && (
                          <li>
                            🔧 {totalFiles - validatedCount} file(s) failed validation
                            — check the Console tab for error details.
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Import Graph (collapsible) ── */}
      {totalFiles > 0 && (
        <details className="lpp-import-graph">
          <summary className="lpp-import-graph-summary">
            📊 Import Graph ({totalFiles} nodes, {generatedFiles.reduce((s, f) => s + f.dependencies.length, 0)} edges)
          </summary>
          <div className="lpp-import-graph-content">
            {generatedFiles.map(file => (
              <div key={file.nodeId} className="lpp-graph-node">
                <div className="lpp-graph-node-name">
                  {file.fileName}
                  <span className="lpp-graph-node-exports">
                    {file.exports.length > 0 ? ` exports: ${file.exports.join(', ')}` : ' (no exports)'}
                  </span>
                </div>
                {file.dependencies.length > 0 && (
                  <div className="lpp-graph-node-deps">
                    <span className="lpp-graph-arrow">⬅ imports from:</span>
                    {file.dependencies.map(dep => (
                      <span key={dep} className="lpp-graph-dep-tag">{dep}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* ── Backend offline fallback ── */}
      {backendStatus === 'offline' && (
        <div className="lpp-empty-full" style={{ border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.04)' }}>
          <div className="lpp-empty-icon" style={{ fontSize: 40 }}>🔌</div>
          <h3 style={{ color: '#ef4444' }}>Backend Offline</h3>
          <p style={{ color: '#94a3b8', maxWidth: 420, lineHeight: 1.6, fontSize: 13 }}>
            The backend server is not reachable. The live preview needs the backend
            to generate per-node files for preview.
          </p>
          <div className="lpp-empty-steps" style={{ textAlign: 'left', color: '#64748b', fontSize: 12, maxWidth: 400, lineHeight: 1.8 }}>
            <div style={{ fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>To start the backend:</div>
            <code style={{ display: 'block', background: '#0d0d20', padding: '8px 12px', borderRadius: 6, border: '1px solid #1a1a3e', marginBottom: 8 }}>
              cd backend &amp;&amp; npm run dev
            </code>
            <div style={{ color: '#64748b' }}>Or check that Docker is running if using containerized preview.</div>
          </div>
          <button
            className="lpp-btn lpp-btn-primary"
            onClick={async () => {
              setBackendStatus('checking');
              const ok = await checkBackendConnection();
              setBackendStatus(ok ? 'online' : 'offline');
            }}
            style={{ marginTop: 12 }}
          >🔄 Retry Connection</button>
        </div>
      )}

      {/* ── Empty state when no nodes ── */}
      {codeNodes.length === 0 && backendStatus !== 'offline' && (
        <div className="lpp-empty-full">
          <div className="lpp-empty-icon">🏗️</div>
          <h3>Build Your App</h3>
          <p>Add architecture nodes to the canvas, then generate files here.</p>
          <ol className="lpp-empty-steps">
            <li>1. Describe your app goal in the master node</li>
            <li>2. Click "Build Architecture" to create nodes</li>
            <li>3. Review and adjust the node connections</li>
            <li>4. Come here to generate and preview files</li>
          </ol>
        </div>
      )}
    </div>
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Best-effort TypeScript → browser-JS strip, used ONLY for the live preview
 * iframe (never touches the generated files on disk). The iframe has no TS
 * compiler, so interfaces, type annotations, module syntax and non-null
 * assertions would throw a SyntaxError that try/catch can't intercept.
 * Removes the common shapes generated code uses. Conservative on purpose.
 */
function stripTsForPreview(code: string): string {
  let out = code;
  // Module syntax lines.
  out = out.replace(/^import\s[^;]*;\s*$/gm, '');
  out = out.replace(/^export\s+(?:default\s+)?/gm, '');
  // interface / type / enum declaration blocks.
  out = out.replace(/^(?:export\s+)?(?:interface|type|enum)\s+\w+[^{]*\{[^}]*\}\s*;?\s*$/gm, '');
  // Non-null assertions `foo!` → `foo` — POSTFIX only, so logical negation
  // `!x` / `!!x` is preserved (a prefix `!` has no char before it).
  out = out.replace(/([\w$)\]])(\s*)!(?!=)/g, '$1$2');
  // Primitive type annotations `: number` → `` (keep `= default` values, drop
  // the annotation entirely so no stray space is left behind).
  out = out.replace(/:(\s*)(string|number|boolean|any|void|unknown|never|undefined|null|object)\b(\s*=\s*[^,;)]+)?/g, (_m, s, _t, init) => init ? s + init : '');
  // Identifier type annotations on params/vars — only when the colon is
  // preceded by `(` or `,` or `=` (a declaration/param context), never inside
  // an object literal `{ key: value }` or ternary `a ? b : c`. Must be followed
  // by `,` `)` `;` or `=` so `{ a: b }` (followed by `}`) stays intact. The
  // variable NAME is captured and re-emitted so `(x: Foo)` becomes `(x)`.
  out = out.replace(/([(\[,=])\s*([A-Za-z_$][\w$]*)\s*:\s*[A-Za-z_$][\w$]*(?:\[\])?(\s*=\s*[^,;)]+)?(?=\s*[,);=])/g, (_m, lead, name, init) => init ? lead + name + init : lead + name);
  // Return-type annotations on arrows `): Foo =>` → `) =>`.
  out = out.replace(/\)\s*:\s*[A-Za-z_$][\w$.<>\[\],| ]*\s*=>/g, ') =>');
  // `as Type` casts.
  out = out.replace(/\s+as\s+[A-Za-z_$][\w$.<>\[\]]*/g, '');
  return out;
}
