import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useProjectStore, getNextNodeId } from '../store/projectStore';
import type { Node, Edge } from 'reactflow';
import type { NodeType, NodeData } from '../types';
import { detectFolderRoot, buildFolderManifest } from '../utils/folderManifest';
import { resolveScanConnections } from '../utils/scanGraph';
import { dropRealPaths } from '../utils/dropPaths';
import './FileDropHandler.css';

// ─── Types for Veronica scan & repair ─────────────────────────────

interface VeronicaFinding {
  file: string;
  type: 'error' | 'warning' | 'info';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  line?: number;
  suggestion?: string;
}

interface VeronicaRepair {
  file: string;
  action: 'fixed' | 'skipped' | 'error';
  issue: string;
  detail: string;
}

interface VeronicaLog {
  tool: string;
  result: string;
  iteration: number;
  timestamp: string;
}

interface DroppedFile {
  path: string;
  content: string;
}

/** The Electron preload bridge (packaging/electron/preload.js). */
interface VeronicaBridge {
  getPathForFile?: (file: File) => string;
}

/**
 * The real on-disk location of a dropped file, when the app can tell us.
 *
 * In Electron the drop carries a path and Deep Scan hands it to REA, which reads
 * the artifact itself — the only way a dropped binary can be scanned, since its
 * bytes never travel through a browser drop. In a plain browser this returns ''
 * and the scan falls back to a staged copy of the dropped text.
 *
 * Which FILES to ask about, and in what order, is `dropRealPaths`' job — asking
 * an item alone can miss a dropped folder.
 *
 * Must be called synchronously while the drop event is still being handled: a
 * DataTransferItem is only readable then.
 */
function realPathForFile(file: File | null | undefined): string {
  const bridge = (window as unknown as { veronica?: VeronicaBridge }).veronica;
  if (!file || !bridge?.getPathForFile) return '';
  try {
    return bridge.getPathForFile(file) || '';
  } catch {
    return '';
  }
}

interface ScanArchitecture {
  projectName: string;
  projectType: string;
  frameworks: string[];
  nodes: Array<{
    label: string;
    description: string;
    type: string;
    language: string;
    files: string[];
    position: { x: number; y: number };
  }>;
  edges: Array<{
    source: string;
    target: string;
    description?: string;
  }>;
  /** How the app connects to OTHER apps/services: packages, external APIs, sibling apps. */
  externalDeps?: Array<{
    name: string;
    kind: 'package' | 'service' | 'app';
    usedBy: string[];
  }>;
  /** Distinct top-level folder roots (>1 = multiple apps dropped together). */
  apps?: string[];
  /** Evidence provenance + the scan engine's own stated limits (measured scans). */
  notes?: string[];
}

interface ScanConnection {
  name: string;
  kind: 'package' | 'service' | 'app';
  usedBy: string[];
}

async function readEntry(
  entry: FileSystemEntry,
  basePath = ''
): Promise<DroppedFile[]> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    return new Promise((resolve) => {
      fileEntry.file((file) => {
        const path = basePath ? `${basePath}/${file.name}` : file.name;
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const textExts = new Set([
          'js', 'ts', 'jsx', 'tsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h',
          'css', 'html', 'json', 'yaml', 'yml', 'toml', 'md', 'txt', 'xml',
          'sh', 'bash', 'zig', 'swift', 'kt', 'rb', 'php', 'vue', 'svelte',
          'sql', 'graphql', 'prisma', 'env', 'ini', 'cfg', 'conf',
        ]);
        if (file.size > 12884901888 || !textExts.has(ext)) {
          resolve([{ path, content: `[${file.size > 12884901888 ? 'binary/large' : 'binary'} file: ${file.name}]` }]);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve([{ path, content: reader.result as string }]);
        reader.onerror = () => resolve([{ path, content: '' }]);
        reader.readAsText(file);
      });
    });
  }
  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const dir = dirEntry.createReader();
    return new Promise((resolve) => {
      const results: DroppedFile[] = [];
      const readDir = () => {
        dir.readEntries(async (entries) => {
          if (entries.length === 0) {
            resolve(results);
            return;
          }
          const sub = await Promise.all(
            entries.map((e) => readEntry(e, basePath ? `${basePath}/${entry.name}` : entry.name))
          );
          for (const s of sub) results.push(...s);
          readDir();
        }, () => resolve(results));
      };
      readDir();
    });
  }
  return [];
}

async function readFiles(dt: DataTransfer): Promise<{ files: DroppedFile[]; realPaths: string[] }> {
  const entries: FileSystemEntry[] = [];
  // This whole pass runs before the first `await`, while the DataTransfer is
  // still valid — the entries AND the real paths have to be taken here. The
  // paths go through dropRealPaths, which also covers a dropped folder that
  // `item.getAsFile()` alone would leave unresolved (see utils/dropPaths).
  const realPaths = dropRealPaths(dt.items, dt.files, realPathForFile);
  for (let i = 0; i < dt.items.length; i++) {
    const item = dt.items[i];
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry();
    if (entry) entries.push(entry);
  }
  const results = await Promise.all(entries.map((e) => readEntry(e)));
  return { files: results.flat(), realPaths };
}

const FILE_NODE_TYPES: NodeType[] = ['logic', 'input', 'output', 'api', 'database', 'ui'];

// ─── Scan state types ──────────────────────────────────────────────

type ScanState = 'idle' | 'scanning' | 'preview' | 'done' | 'error';

interface ScanEvidence {
  evidenceId: string | null;
  providerId: string | null;
  providerVersion: string | null;
  operation: string | null;
  durationMs: number;
}

interface ScanResult {
  architecture: ScanArchitecture;
  source: 'llm' | 'rule-based' | 'rea';
  llmError?: string;
  /** Measured-scan provenance (REA). */
  evidence?: ScanEvidence;
  /** 'path' = REA read the artifact itself; 'staged' = a copy of the dropped text. */
  mode?: 'path' | 'staged';
  stagedFiles?: number;
  skippedFiles?: number;
  /** What the staged copy had to leave out, and why. */
  skipped?: string[];
  /** Which REA command answered for this target. */
  plan?: { command: string; reason: string };
}

// ─── Deep-scan → canvas graph helpers ───────────────────────────────

/** File nodes shown per module before they're folded into a "+N more" node. */
const FILE_NODE_CAP = 8;

/** Best-guess canvas node type for a scanned file path. */
function inferFileType(path: string): NodeType {
  const lower = path.toLowerCase();
  if (/(^|\/)(main|app|index|entry|bootstrap|server|cli|bin|cmd)[^/]*\./.test(lower)) return 'input';
  if (/(component|page|screen|view|ui|layout|widget|container|modal|form)/.test(lower) && /\.(tsx?|jsx?|vue|svelte|css|scss|less|html?)$/.test(lower)) return 'ui';
  if (/\.(css|scss|sass|less|html?)$/.test(lower)) return 'ui';
  if (/(route|controller|endpoint|api|middleware|graphql|resolver|service)/.test(lower)) return 'api';
  if (/(db|schema|model|entity|repository|migration|prisma|store|sqlite)/.test(lower)) return 'database';
  return 'logic';
}

/** Emoji for a file node based on its extension. */
function fileEmoji(path: string): string {
  const ext = (path.split('.').pop() || '').toLowerCase();
  if (['py'].includes(ext)) return '🐍';
  if (['rs'].includes(ext)) return '🦀';
  if (['go'].includes(ext)) return '🐹';
  if (['css', 'scss', 'sass', 'less'].includes(ext)) return '🎨';
  if (['html', 'htm'].includes(ext)) return '📄';
  if (['json', 'yaml', 'yml', 'toml'].includes(ext)) return '🧾';
  if (['tsx', 'jsx'].includes(ext)) return '⚛️';
  if (['ts', 'js'].includes(ext)) return '📘';
  if (['md', 'txt'].includes(ext)) return '📝';
  if (['sql', 'db', 'sqlite'].includes(ext)) return '🗄️';
  if (['sh', 'bash'].includes(ext)) return '🐚';
  return '📄';
}

const CONNECTION_ICONS: Record<string, string> = {
  package: '📦',
  service: '🌐',
  app: '🔗',
};

const FileDropHandler: React.FC = () => {
  const [dragOver, setDragOver] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [files, setFiles] = useState<DroppedFile[]>([]);
  const [nodeName, setNodeName] = useState('');
  const [nodeType, setNodeType] = useState<NodeType>('logic');
  const [instructions, setInstructions] = useState('');
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'done' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');

  // Deep scan state
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState('');
  const [scanProgress, setScanProgress] = useState('');
  // Real on-disk path of what was dropped, when the app can provide it (Electron).
  const [dropTarget, setDropTarget] = useState('');

  // Veronica scan & repair state
  const [veronicaState, setVeronicaState] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [veronicaResult, setVeronicaResult] = useState<{
    summary: string;
    findings: VeronicaFinding[];
    repairs: VeronicaRepair[];
  } | null>(null);
  const [veronicaProgress, setVeronicaProgress] = useState('');
  const [veronicaLogs, setVeronicaLogs] = useState<VeronicaLog[]>([]);
  const [veronicaInstructions, setVeronicaInstructions] = useState('');

  // Describe dropped folder contents (LLM)
  const [describeState, setDescribeState] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [describeResult, setDescribeResult] = useState('');
  const [describeProgress, setDescribeProgress] = useState('');

  // Play dropped folder as a static web app
  const [playState, setPlayState] = useState<'idle' | 'serving' | 'done' | 'error'>('idle');
  const [playError, setPlayError] = useState('');

  // Canvas clear confirmation
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const dragCounter = useRef(0);
  const { addNode, batchAddNodes, replaceNodes, setSitePreviewUrl } = useProjectStore();

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        dragCounter.current++;
        if (dragCounter.current === 1) setDragOver(true);
      }
    };
    const handleDragLeave = () => {
      dragCounter.current--;
      if (dragCounter.current <= 0) {
        dragCounter.current = 0;
        setDragOver(false);
      }
    };
    const handleDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
      }
    };
    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setDragOver(false);
      if (!e.dataTransfer?.items || e.dataTransfer.items.length === 0) return;

      setStatus('idle');
      setStatusMsg('');
      setScanState('idle');
      setScanResult(null);
      setDescribeState('idle');
      setDescribeResult('');
      setDescribeProgress('');

      try {
        const { files: dropped, realPaths } = await readFiles(e.dataTransfer);
        if (dropped.length === 0) return;

        // REA scans ONE target, so a single drop (a folder, an artifact) uses its
        // real path and nothing is copied; a multi-item drop falls back to a
        // staged copy of everything that was dropped.
        setDropTarget(realPaths.length === 1 ? realPaths[0] : '');
        setFiles(dropped);

        const firstFilename = dropped[0].path.split('/').pop() || dropped[0].path;
        const nameParts = firstFilename.replace(/\\.[^.]+$/, '').split(/[-_./\\\\]+/).filter(Boolean);
        setNodeName(nameParts.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' '));
        setNodeType('logic');
        setInstructions('');
        setDialogOpen(true);
      } catch (err) {
        setStatusMsg('Error reading files: ' + (err instanceof Error ? err.message : String(err)));
      }
    };
    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);
    return () => {
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleDrop);
    };
  }, []);

  // ── Single node analysis (original behavior) ────────────────────

  const handleAnalyze = useCallback(async () => {
    setStatus('analyzing');
    setStatusMsg(`Analyzing ${files.length} file(s) with LLM...`);

    const fileContext = files
      .map((f) => `--- ${f.path} ---\n${f.content}`)
      .join('\n\n');

    const systemPrompt = `You are a sassy code analysis assistant with a sharp wit. Analyze the following dropped file(s) and describe what the code/function does. Provide:
1. A concise summary of the purpose (2-3 sentences)
2. Key functions, classes, or exports
3. Dependencies and inputs/outputs

Keep the response technical and actionable for a developer building a visual app architecture.

User instructions: ${instructions || 'Analyze the files and describe what function they implement.'}

Files to analyze:
${fileContext}`;

    let analysis: string;
    try {
      const res = await axios.post('/api/reason', { prompt: systemPrompt, maxTokens: 1024 }, { timeout: 90000 });
      analysis = res.data.response || 'Analysis complete.';
    } catch (err: any) {
      const backendMsg = err?.response?.data?.error || err?.message || 'Connection error';
      console.warn('LLM unavailable, creating node without AI analysis:', backendMsg);
      const fileSummary = files.slice(0, 10).map(f => f.path).join(', ');
      analysis = `📁 Files: ${fileSummary}${files.length > 10 ? ` (+${files.length - 10} more)` : ''}\n\nLLM analysis unavailable (${backendMsg}). Node created with file references.`;
    }

    const nodeData: NodeData = {
      label: nodeName,
      description: analysis,
      type: nodeType,
      status: 'pending' as const,
    };

    const newNode: Node = {
      id: getNextNodeId(),
      type: nodeType,
      position: { x: 300 + Math.random() * 200, y: 200 + Math.random() * 150 },
      data: nodeData,
    };

    addNode(newNode);
    setStatus('done');
    setStatusMsg('Node created successfully!');

    // Record file accesses to session memory
    for (const f of files) {
      fetch('/api/memory/file-access', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: f.path, type: 'drop', projectName: useProjectStore.getState().projectName }),
      }).catch(() => {});
    }

    setTimeout(() => {
      setDialogOpen(false);
      setStatus('idle');
    }, 1200);
  }, [files, nodeName, nodeType, instructions, addNode]);

  // ── Play dropped folder as a static web app (index.html detected) ──

  const handlePlayWebApp = useCallback(async () => {
    if (files.length === 0) return;
    setPlayState('serving');
    setPlayError('');
    try {
      const res = await fetch('/api/preview/site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: files.map(f => ({ path: f.path, content: f.content })) }),
        signal: AbortSignal.timeout(60000),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to serve the folder as a web app');
      }
      setSitePreviewUrl(data.url);
      setPlayState('done');
    } catch (err: any) {
      setPlayState('error');
      setPlayError(err?.message || 'Could not serve the folder as a web app');
    }
  }, [files, setSitePreviewUrl]);

  // ── Send to Veronica: scan & repair files ──────────────────────

  const handleSendToVeronica = useCallback(async () => {
    setVeronicaState('processing');
    setVeronicaProgress(`Sending ${files.length} file(s) to Veronica for analysis...`);
    setVeronicaLogs([]);
    setVeronicaResult(null);

    const instructions = veronicaInstructions || 'Scan these files for issues, fix any problems found, and report what was done. Check for: syntax errors, bugs, security vulnerabilities, unused imports, undefined variables, deprecated APIs, hardcoded secrets, and code quality issues. Repair everything you find.';

    try {
      const res = await fetch('/api/scan/veronica-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: files.map(f => ({ path: f.path, content: f.content })),
          instructions,
          useToolLoop: true,
        }),
        signal: AbortSignal.timeout(300000),
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Veronica processing failed');
      }

      setVeronicaResult({
        summary: data.summary || data.message || 'Processing complete.',
        findings: data.findings || [],
        repairs: data.repairs || [],
      });
      setVeronicaState('done');
      setVeronicaProgress(`✅ ${data.repairs?.length || 0} repair(s), ${data.findings?.length || 0} finding(s)`);

      // Record file accesses to session memory
      for (const f of files) {
        fetch('/api/memory/file-access', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: f.path, type: 'veronica-scan', projectName: useProjectStore.getState().projectName }),
        }).catch(() => {});
      }
    } catch (err: any) {
      setVeronicaState('error');
      setVeronicaProgress(err?.response?.data?.error || err.message || 'Veronica processing failed');
    }
  }, [files, veronicaInstructions]);

  // ── Describe dropped folder contents ───────────────────────────

  const handleDescribeFolder = useCallback(async () => {
    if (files.length === 0) return;
    setDescribeState('processing');
    setDescribeResult('');
    setDescribeProgress(`Scanning ${files.length} file(s) from the dropped folder...`);

    const manifest = buildFolderManifest(files);
    const systemPrompt = `You are an expert code analyst. The user dropped a folder into the app; here is its scanned contents (file tree, types, and truncated samples).
Describe what is inside this folder:
1. What kind of project/app it is (2-3 sentences)
2. The main modules or components and what each one does
3. Tech stack / languages / frameworks used
4. Any notable or unusual files
Be concise but specific, and write in plain text (no markdown code fences).

Dropped folder contents:
${manifest}`;

    try {
      const res = await axios.post('/api/reason', { prompt: systemPrompt, maxTokens: 900 }, { timeout: 90000 });
      setDescribeResult(res.data.response || 'No description returned.');
      setDescribeState('done');
    } catch (err: any) {
      setDescribeState('error');
      setDescribeProgress(err?.response?.data?.error || err?.message || 'Could not describe the folder');
    }
  }, [files]);

  // ── Deep scan: REA measures whatever was dropped, then the canvas gets it ──
  //
  // The artifact's real path is sent when the app has one, so REA reads the file
  // itself (a dropped .apk/.exe/.dll only exists on disk). Otherwise the dropped
  // text is staged server-side into a temp directory and THAT is scanned.
  const handleDeepScan = useCallback(async () => {
    setScanState('scanning');
    setScanError('');
    setShowClearConfirm(false);
    setScanProgress(dropTarget
      ? `Scanning ${dropTarget.split(/[\\/]/).pop() || dropTarget} with REA...`
      : `Staging ${files.length} file(s), then scanning with REA...`);

    try {
      const res = await axios.post('/api/scan/deep-scan',
        dropTarget
          ? { path: dropTarget }
          : { files: files.map(f => ({ path: f.path, content: f.content })) },
        { timeout: 600000 },
      );

      const data = res.data;

      if (!data.success) {
        // REA reports what is missing and how to fix it; show that, not a generic failure.
        throw new Error([data.error, data.hint].filter(Boolean).join('\n') || 'Deep scan failed');
      }

      const architecture = data.architecture as ScanArchitecture;
      if (!architecture || !architecture.nodes || architecture.nodes.length === 0) {
        throw new Error('No architecture nodes returned from scan');
      }

      setScanResult({
        architecture,
        source: 'rea',
        evidence: data.evidence,
        mode: data.mode,
        stagedFiles: data.stagedFiles,
        skippedFiles: data.skippedFiles,
        skipped: data.skipped,
        plan: data.plan,
      });
      setScanState('preview');
      setScanProgress(`Found ${architecture.nodes.length} nodes and ${architecture.edges.length} connections`);
    } catch (err: any) {
      setScanState('error');
      setScanError(err?.response?.data?.details || err?.response?.data?.error || err.message || 'Deep scan failed');
    }
  }, [files, dropTarget]);

  // ── Build the full node graph from a scan result: module nodes (carrying
  //    their files), per-file nodes, external connection nodes (packages,
  //    services, sibling apps), and edges with descriptions. The master node is
  //    only included when the canvas is empty (append/replace keep the
  //    existing master). ──
  const buildGraphFromScan = useCallback((arch: ScanArchitecture, src: string, opts?: { includeMaster?: boolean }) => {
    const idMap: Record<string, string> = {};
    const moduleIdForFile: Record<string, string> = {};
    const fileNodeIdForPath: Record<string, string> = {};
    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];
    const modulePurpose = `Deep scan of ${arch.nodes.length} modules. ${
      src === 'rule-based' ? 'Rule-based analysis'
      : src === 'rea' ? 'Measured from the artifact itself (REA)'
      : 'AI-powered architecture analysis'
    }.`;

    // ── Master node (empty-canvas apply only) ──
    if (opts?.includeMaster) {
      const masterId = getNextNodeId();
      const allFiles = arch.nodes.flatMap(n => n.files || []);
      const extCount = (arch.externalDeps || []).length;
      const appsNote = (arch.apps || []).length > 1
        ? ` ${arch.apps!.length} apps detected: ${arch.apps!.join(', ')}`
        : '';
      flowNodes.push({
        id: masterId,
        type: 'master',
        position: { x: 250, y: 30 },
        data: {
          label: arch.projectName || 'Scanned Project',
          description: `Deep scan — ${arch.nodes.length} modules, ${allFiles.length} files, ${extCount} external connections.${appsNote}`,
          type: 'master',
          status: 'pending' as const,
          appGoal: `Imported from: ${arch.projectName}`,
          appPurpose: modulePurpose,
          files: allFiles,
        },
      });
    }

    // ── Module nodes (each carries the files it connects to) ──
    arch.nodes.forEach((n) => {
      const nodeId = getNextNodeId();
      idMap[n.label] = nodeId;
      const pos = n.position || { x: 250, y: 120 };
      flowNodes.push({
        id: nodeId,
        type: n.type as NodeType,
        position: pos,
        data: {
          label: n.label,
          description: n.description,
          type: n.type as NodeType,
          status: 'pending' as const,
          language: n.language || 'typescript',
          appGoal: `Imported from: ${arch.projectName}`,
          appPurpose: modulePurpose,
          files: n.files || [],
        },
      });
      (n.files || []).forEach(f => { moduleIdForFile[f] = nodeId; });
    });

    // ── File nodes: one per file under its module (capped), showing "how the
    //    app connects to its files". The rest fold into a "+N more" node. ──
    arch.nodes.forEach((n) => {
      const moduleId = idMap[n.label];
      if (!moduleId) return;
      const fileList = n.files || [];
      const baseX = (n.position?.x ?? 250) - 80;
      const baseY = (n.position?.y ?? 100) + 170;
      fileList.slice(0, FILE_NODE_CAP).forEach((f, j) => {
        const fileId = getNextNodeId();
        fileNodeIdForPath[f] = fileId;
        const fileType = inferFileType(f);
        flowNodes.push({
          id: fileId,
          type: fileType,
          position: { x: baseX + j * 160, y: baseY },
          data: {
            label: `${fileEmoji(f)} ${f.split('/').pop() || f}`,
            description: f,
            type: fileType,
            status: 'pending' as const,
            isFileNode: true,
            files: [f],
            appGoal: `Imported from: ${arch.projectName}`,
          },
        });
        flowEdges.push({ id: `edge_file_${fileId}`, source: moduleId, target: fileId, type: 'default' as const });
      });
      const rest = fileList.slice(FILE_NODE_CAP);
      if (rest.length > 0) {
        const moreId = getNextNodeId();
        flowNodes.push({
          id: moreId,
          type: 'logic',
          position: { x: baseX + FILE_NODE_CAP * 160, y: baseY },
          data: {
            label: `📁 +${rest.length} more files`,
            description: rest.join('\n'),
            type: 'logic',
            status: 'pending' as const,
            isFileNode: true,
            files: rest,
            appGoal: `Imported from: ${arch.projectName}`,
          },
        });
        flowEdges.push({ id: `edge_more_${moreId}`, source: moduleId, target: moreId, type: 'default' as const });
      }
    });

    // ── Scanned connections, with the import description as the label. A
    //    connection can name two modules (the LLM scan) or two files
    //    (`src/App.tsx imports ./TaskList`, what REA measures); a file that
    //    folded into its module's "+N more" still gets its connection drawn at
    //    the module level, so a measured import is never dropped just because
    //    the canvas did not give that file a node of its own. ──
    resolveScanConnections(arch.edges || [], {
      moduleLabels: idMap,
      fileNodes: fileNodeIdForPath,
      moduleOfFile: moduleIdForFile,
    }).forEach((e, i) => {
      flowEdges.push({
        id: `edge_scan_${i}_${Date.now()}`,
        source: e.source,
        target: e.target,
        type: 'default' as const,
        label: e.description.length > 48 ? `${e.description.slice(0, 48)}…` : e.description || undefined,
        data: { description: e.description },
      });
    });

    // ── External connection nodes: packages 📦, services 🌐, sibling apps 🔗
    //    ("how the app connects to OTHER apps") — wired from the files/modules
    //    that use them. ──
    (arch.externalDeps || []).forEach((ext: ScanConnection, i) => {
      const extId = getNextNodeId();
      const icon = CONNECTION_ICONS[ext.kind] || '📦';
      const type = ext.kind === 'package' ? 'database' : 'api';
      flowNodes.push({
        id: extId,
        type,
        position: { x: 1450 + Math.floor(i / 4) * 280, y: 60 + (i % 4) * 190 },
        data: {
          label: `${icon} ${ext.name}`,
          description: `${ext.kind === 'package' ? 'npm/pip package' : ext.kind === 'app' ? 'sibling app' : 'external service'} — used by ${ext.usedBy.length} file${ext.usedBy.length === 1 ? '' : 's'}`,
          type,
          status: 'pending' as const,
          external: true,
          externalKind: ext.kind,
          files: ext.usedBy || [],
          appGoal: `External connection of ${arch.projectName}`,
        },
      });
      // Wire from the file nodes that use it (fall back to the module, then master).
      const sources = new Set<string>();
      for (const f of ext.usedBy || []) {
        if (fileNodeIdForPath[f]) sources.add(fileNodeIdForPath[f]);
        else if (moduleIdForFile[f]) sources.add(moduleIdForFile[f]);
      }
      if (sources.size === 0 && flowNodes.length > 0) sources.add(flowNodes[0].id);
      [...sources].forEach((sid, k) => {
        flowEdges.push({ id: `edge_ext_${extId}_${k}`, source: sid, target: extId, type: 'default' as const });
      });
    });

    return { flowNodes, flowEdges };
  }, []);

  const handleApplyScan = useCallback(() => {
    if (!scanResult) return;

    const { architecture, source } = scanResult;
    const existingNodes = useProjectStore.getState().nodes.filter(n => n.type !== 'master');

    if (existingNodes.length > 0) {
      // Canvas has nodes — show clear confirmation
      setShowClearConfirm(true);
      return;
    }

    // Canvas is empty — apply directly (includes the master node)
    const { flowNodes, flowEdges } = buildGraphFromScan(architecture, source, { includeMaster: true });
    const currentOS = useProjectStore.getState().targetOS;
    batchAddNodes(flowNodes, flowEdges, currentOS);

    setScanState('done');
    setScanProgress(`✅ Created ${flowNodes.length} nodes with ${flowEdges.length} connections (modules + files + external)`);

    setTimeout(() => {
      setDialogOpen(false);
      setScanState('idle');
      setStatus('idle');
    }, 1500);
  }, [scanResult, batchAddNodes, buildGraphFromScan]);

  const handleApplyReplace = useCallback(() => {
    if (!scanResult) return;

    const { architecture, source } = scanResult;
    // Keep the existing master node — only replace modules/files/externals.
    const { flowNodes, flowEdges } = buildGraphFromScan(architecture, source, { includeMaster: false });
    const state = useProjectStore.getState();
    const masterId = state.nodes.find(n => n.type === 'master')?.id;
    const currentOS = state.targetOS;

    // Replace all non-master nodes with the scan result
    replaceNodes(flowNodes, flowEdges, currentOS, masterId);

    setShowClearConfirm(false);
    setScanState('done');
    setScanProgress(`✅ Replaced canvas with ${flowNodes.length} nodes and ${flowEdges.length} connections (modules + files + external)`);

    setTimeout(() => {
      setDialogOpen(false);
      setScanState('idle');
      setStatus('idle');
    }, 1500);
  }, [scanResult, replaceNodes, buildGraphFromScan]);

  const handleApplyAppend = useCallback(() => {
    if (!scanResult) return;

    const { architecture, source } = scanResult;
    // Append — no master node (the canvas already has one).
    const { flowNodes, flowEdges } = buildGraphFromScan(architecture, source, { includeMaster: false });
    const currentOS = useProjectStore.getState().targetOS;

    // Append to existing canvas nodes
    batchAddNodes(flowNodes, flowEdges, currentOS);

    setShowClearConfirm(false);
    setScanState('done');
    setScanProgress(`✅ Added ${flowNodes.length} nodes (modules + files + external) to existing canvas`);

    setTimeout(() => {
      setDialogOpen(false);
      setScanState('idle');
      setStatus('idle');
    }, 1500);
  }, [scanResult, batchAddNodes, buildGraphFromScan]);

  // ── Render ──────────────────────────────────────────────────────

  const folderRoot = files.length > 0 ? detectFolderRoot(files) : null;
  const hasIndexHtml = files.some(f => /(^|\/)index\.html?$/i.test(f.path));

  return (
    <>
      {dragOver && (
        <div className="filedrop-overlay dragging">
          <div className="filedrop-hint">Drop files or folders to create a node</div>
        </div>
      )}

      {dialogOpen && (
        <div className="filedrop-dialog-overlay" onClick={() => { if (status !== 'analyzing' && scanState !== 'scanning' && describeState !== 'processing' && veronicaState !== 'processing') setDialogOpen(false); }}>
          <div className="filedrop-dialog" onClick={(e) => e.stopPropagation()}>

            {/* ── File list header ── */}
            <h2>
              {folderRoot
                ? `📂 ${folderRoot}/ — ${files.length} file${files.length !== 1 ? 's' : ''} scanned from folder`
                : `📁 Import from ${files.length} file${files.length !== 1 ? 's' : ''}`}
            </h2>

            <div className="filedrop-file-list">
              {files.slice(0, 30).map((f, i) => (
                <span key={i}>{f.path}</span>
              ))}
              {files.length > 30 && <span>+{files.length - 30} more</span>}
            </div>

            {/* ── Play web app mode (hidden while serving — spinner shows instead) ── */}
            {hasIndexHtml && scanState === 'idle' && describeState === 'idle' && playState !== 'serving' && (
              <>
                <div className="filedrop-opt-group filedrop-play-group">
                  <h3>▶ Play Web App</h3>
                  <p className="filedrop-opt-desc">
                    This folder contains an <code>index.html</code> — launch it in the Live Preview
                    to play it like a real app.
                  </p>
                  <div className="filedrop-deepscan-actions">
                    <button
                      className="filedrop-play-btn"
                      onClick={handlePlayWebApp}
                    >
                      ▶ Play Web App
                    </button>
                  </div>
                  {playState === 'error' && (
                    <p className="filedrop-play-error">❌ {playError}</p>
                  )}
                </div>

                <div className="filedrop-divider">
                  <span>OR</span>
                </div>
              </>
            )}

            {/* ── Single node mode (hidden while serving/playing the web app) ── */}
            {scanState === 'idle' && describeState === 'idle' && playState === 'idle' && (
              <>
                <div className="filedrop-opt-group">
                  <h3>Option 1: Quick Single Node</h3>
                  <p className="filedrop-opt-desc">
                    Create one node with an LLM analysis of all files.
                  </p>
                  <div className="filedrop-field">
                    <label>Node Name</label>
                    <input value={nodeName} onChange={(e) => setNodeName(e.target.value)} placeholder="My Function" />
                  </div>
                  <div className="filedrop-field">
                    <label>Node Type</label>
                    <select value={nodeType} onChange={(e) => setNodeType(e.target.value as NodeType)}>
                      {FILE_NODE_TYPES.map((t) => (
                        <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="filedrop-field">
                    <label>Instructions for LLM (optional)</label>
                    <textarea
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      placeholder="Tell the LLM what to focus on when analyzing these files..."
                      rows={2}
                    />
                  </div>
                  <div className="filedrop-actions">
                    <button
                      className="nn-btn nn-cancel"
                      onClick={() => setDialogOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      className="nn-btn nn-confirm"
                      onClick={handleAnalyze}
                      disabled={status === 'analyzing' || !nodeName.trim()}
                    >
                      {status === 'analyzing' ? 'Analyzing...' : 'Create Single Node'}
                    </button>
                  </div>
                </div>

                <div className="filedrop-divider">
                  <span>OR</span>
                </div>

                <div className="filedrop-opt-group">
                  <h3>Option 2: Deep Scan Architecture</h3>
                  <p className="filedrop-opt-desc">
                    Measure the real structure with REA — modules, files, imports and external
                    dependencies — then create the complete node architecture on the canvas.
                    {dropTarget
                      ? ' The dropped item’s own path is used, so nothing is copied.'
                      : ' Without a real path, a staged copy of the dropped files is scanned.'}
                  </p>
                  <div className="filedrop-deepscan-actions">
                    <button
                      className="filedrop-deepscan-btn"
                      onClick={handleDeepScan}
                    >
                      🔍 Deep Scan Project
                    </button>
                  </div>
                </div>

                <div className="filedrop-divider">
                  <span>OR</span>
                </div>

                <div className="filedrop-opt-group filedrop-veronica-group">
                  <h3>Option 3: Send to Veronica — Scan & Repair</h3>
                  <p className="filedrop-opt-desc">
                    Veronica will analyze every file for bugs, security issues, and code quality problems,
                    then automatically fix them. She can read, write, edit, move, and create files as needed.
                    <strong> This is the default recommended option.</strong>
                  </p>
                  <div className="filedrop-field">
                    <label>Instructions (optional)</label>
                    <textarea
                      value={veronicaInstructions}
                      onChange={(e) => setVeronicaInstructions(e.target.value)}
                      placeholder="Focus on fixing syntax errors and security issues..."
                      rows={2}
                    />
                  </div>
                  <div className="filedrop-deepscan-actions column">
                    <button
                      className="filedrop-veronica-btn"
                      onClick={handleSendToVeronica}
                    >
                      🤖 Send to Veronica
                    </button>
                    <button
                      className="filedrop-describe-btn"
                      onClick={handleDescribeFolder}
                    >
                      📂 Describe Folder Contents
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ── Describe folder: processing ── */}
            {describeState === 'processing' && (
              <div className="filedrop-scanning">
                <div className="filedrop-spinner-lg" />
                <p className="filedrop-scan-title">📂 Scanning Folder...</p>
                <p className="filedrop-scan-sub">{describeProgress}</p>
                <p className="filedrop-scan-hint">
                  Reading the folder contents and building a description with the LLM.
                </p>
              </div>
            )}

            {/* ── Describe folder: done ── */}
            {describeState === 'done' && (
              <div className="filedrop-veronica-done">
                <div className="filedrop-veronica-done-header">
                  <span className="filedrop-veronica-done-icon">📂</span>
                  <span>Folder Description</span>
                </div>
                <div className="filedrop-veronica-summary" style={{ maxHeight: 320 }}>
                  {describeResult}
                </div>
                <div className="filedrop-actions" style={{ marginTop: 12 }}>
                  <button
                    className="nn-btn nn-confirm"
                    onClick={() => { setDialogOpen(false); setDescribeState('idle'); setDescribeResult(''); }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {/* ── Describe folder: error ── */}
            {describeState === 'error' && (
              <div className="filedrop-scan-error">
                <p className="filedrop-error-icon">❌</p>
                <p className="filedrop-error-text">{describeProgress}</p>
                <div className="filedrop-actions" style={{ marginTop: 12 }}>
                  <button className="nn-btn nn-cancel" onClick={() => { setDescribeState('idle'); setDescribeResult(''); }}>
                    Back
                  </button>
                  <button className="filedrop-retry-btn" onClick={handleDescribeFolder}>
                    🔄 Retry
                  </button>
                </div>
              </div>
            )}

            {/* ── Veronica processing ── */}
            {veronicaState === 'processing' && (
              <div className="filedrop-scanning">
                <div className="filedrop-spinner-lg" />
                <p className="filedrop-scan-title">🤖 Veronica Processing...</p>
                <p className="filedrop-scan-sub">{veronicaProgress}</p>
                <p className="filedrop-scan-hint">
                  Scanning files, identifying issues, and applying fixes automatically.
                </p>
                {veronicaLogs.length > 0 && (
                  <div className="filedrop-veronica-logs">
                    {veronicaLogs.slice(-5).map((log, i) => (
                      <div key={i} className="filedrop-veronica-log-entry">
                        <span className="filedrop-veronica-log-tool">{log.tool}</span>
                        <span className="filedrop-veronica-log-msg">{log.result.slice(0, 80)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {veronicaState === 'done' && veronicaResult && (
              <div className="filedrop-veronica-done">
                <div className="filedrop-veronica-done-header">
                  <span className="filedrop-veronica-done-icon">✅</span>
                  <span>Veronica Scan & Repair Complete</span>
                </div>
                {veronicaResult.repairs.length > 0 && (
                  <div className="filedrop-veronica-section">
                    <p className="filedrop-veronica-section-title">
                      🔧 Repairs Made ({veronicaResult.repairs.length})
                    </p>
                    <div className="filedrop-veronica-list">
                      {veronicaResult.repairs.map((r, i) => (
                        <div key={i} className={`filedrop-veronica-item ${r.action}`}>
                          <span className="filedrop-veronica-item-file">{r.file}</span>
                          <span className="filedrop-veronica-item-action">{r.action === 'fixed' ? '✅ Fixed' : r.action === 'error' ? '❌ Error' : '⏭ Skipped'}</span>
                          <span className="filedrop-veronica-item-detail">{r.issue}: {r.detail.slice(0, 120)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {veronicaResult.findings.length > 0 && (
                  <div className="filedrop-veronica-section">
                    <p className="filedrop-veronica-section-title">
                      🔍 Findings ({veronicaResult.findings.length})
                    </p>
                    <div className="filedrop-veronica-list">
                      {veronicaResult.findings.map((f, i) => (
                        <div key={i} className={`filedrop-veronica-item severity-${f.severity}`}>
                          <span className="filedrop-veronica-item-file">{f.file}</span>
                          <span className="filedrop-veronica-item-severity">{f.severity}</span>
                          <span className="filedrop-veronica-item-detail">{f.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="filedrop-veronica-summary">
                  {veronicaResult.summary.slice(0, 500)}
                </div>
                <div className="filedrop-actions" style={{ marginTop: 12 }}>
                  <button className="nn-btn nn-confirm" onClick={() => { setDialogOpen(false); setVeronicaState('idle'); setVeronicaResult(null); }}>
                    Done
                  </button>
                </div>
              </div>
            )}

            {veronicaState === 'error' && (
              <div className="filedrop-scan-error">
                <p className="filedrop-error-icon">❌</p>
                <p className="filedrop-error-text">{veronicaProgress}</p>
                <div className="filedrop-actions" style={{ marginTop: 12 }}>
                  <button className="nn-btn nn-cancel" onClick={() => { setVeronicaState('idle'); setVeronicaResult(null); }}>
                    Back
                  </button>
                  <button className="filedrop-retry-btn" onClick={handleSendToVeronica}>
                    🔄 Retry
                  </button>
                </div>
              </div>
            )}

            {/* ── Play web app: serving → done ── */}
            {playState === 'serving' && (
              <div className="filedrop-scanning">
                <div className="filedrop-spinner-lg" />
                <p className="filedrop-scan-title">▶ Launching Web App...</p>
                <p className="filedrop-scan-sub">Serving the dropped folder as a static site</p>
              </div>
            )}

            {playState === 'done' && (
              <div className="filedrop-done">
                <p className="filedrop-done-icon">▶</p>
                <p className="filedrop-done-text">Web app launched in Live Preview!</p>
                <div className="filedrop-actions" style={{ marginTop: 12 }}>
                  <button
                    className="nn-btn nn-confirm"
                    onClick={() => { setDialogOpen(false); setPlayState('idle'); }}
                  >
                    Play it now
                  </button>
                </div>
              </div>
            )}

            {/* ── Scanning in progress ── */}
            {scanState === 'scanning' && (
              <div className="filedrop-scanning">
                <div className="filedrop-spinner-lg" />
                <p className="filedrop-scan-title">Deep Scanning Project...</p>
                <p className="filedrop-scan-sub">{scanProgress}</p>
                <p className="filedrop-scan-hint">
                  REA is measuring the artifact's own structure — files, imports and
                  dependencies — so every node on the canvas comes from evidence.
                </p>
              </div>
            )}

            {/* ── Preview scan results ── */}
            {scanState === 'preview' && scanResult && (
              <div className="filedrop-preview">
                <div className="filedrop-preview-header">
                  <h3>
                    ✅ Architecture Analysis Complete
                    <span className={`filedrop-source-badge ${scanResult.source}`}>
                      {scanResult.source === 'rea' ? 'REA · Measured' : scanResult.source === 'llm' ? 'AI' : 'Rule-based'}
                    </span>
                  </h3>
                  <p className="filedrop-preview-project">
                    {scanResult.architecture.projectName}
                  </p>
                </div>

                <div className="filedrop-preview-stats">
                  <div className="filedrop-stat">
                    <span className="filedrop-stat-num">{scanResult.architecture.nodes.length}</span>
                    <span className="filedrop-stat-label">Modules</span>
                  </div>
                  <div className="filedrop-stat">
                    <span className="filedrop-stat-num">{scanResult.architecture.edges.length}</span>
                    <span className="filedrop-stat-label">Connections</span>
                  </div>
                  <div className="filedrop-stat">
                    <span className="filedrop-stat-num">{files.length}</span>
                    <span className="filedrop-stat-label">Files</span>
                  </div>
                  <div className="filedrop-stat">
                    <span className="filedrop-stat-num">{scanResult.architecture.frameworks.length}</span>
                    <span className="filedrop-stat-label">Frameworks</span>
                  </div>
                  <div className="filedrop-stat">
                    <span className="filedrop-stat-num">{(scanResult.architecture.externalDeps || []).length}</span>
                    <span className="filedrop-stat-label">External conns</span>
                  </div>
                </div>

                {(scanResult.architecture.apps || []).length > 1 && (
                  <div className="filedrop-preview-apps">
                    <p className="filedrop-preview-section-title">Apps detected (dropped together):</p>
                    <div className="filedrop-preview-app-list">
                      {scanResult.architecture.apps!.map((app, i) => (
                        <span key={i} className="filedrop-app-tag">🔗 {app}</span>
                      ))}
                    </div>
                  </div>
                )}

                {scanResult.architecture.frameworks.length > 0 && (
                  <div className="filedrop-preview-frameworks">
                    {scanResult.architecture.frameworks.map((fw, i) => (
                      <span key={i} className="filedrop-framework-tag">{fw}</span>
                    ))}
                  </div>
                )}

                {(scanResult.architecture.externalDeps || []).length > 0 && (
                  <div className="filedrop-preview-external">
                    <p className="filedrop-preview-section-title">Connects to other apps / services:</p>
                    <div className="filedrop-preview-external-list">
                      {scanResult.architecture.externalDeps!.slice(0, 20).map((c, i) => (
                        <div key={i} className="filedrop-preview-external-item">
                          <span className={`filedrop-external-icon ${c.kind}`}>{CONNECTION_ICONS[c.kind] || '📦'}</span>
                          <span className="filedrop-external-name">{c.name}</span>
                          <span className="filedrop-external-kind">{c.kind}</span>
                          <span className="filedrop-external-count">{c.usedBy.length} file{c.usedBy.length === 1 ? '' : 's'}</span>
                        </div>
                      ))}
                      {(scanResult.architecture.externalDeps || []).length > 20 && (
                        <div className="filedrop-external-more">…and {(scanResult.architecture.externalDeps || []).length - 20} more</div>
                      )}
                    </div>
                  </div>
                )}

                <div className="filedrop-preview-nodes">
                  <p className="filedrop-preview-section-title">Modules to create (each links to its files):</p>
                  <div className="filedrop-preview-list">
                    {scanResult.architecture.nodes.map((n, i) => (
                      <div key={i} className="filedrop-preview-node">
                        <span className={`filedrop-node-type type-${n.type}`}>{n.type}</span>
                        <span className="filedrop-node-label">{n.label}</span>
                        <span className="filedrop-node-files">{n.files?.length || 0} files</span>
                        {(n.files || []).length > 0 && (
                          <div className="filedrop-preview-node-files">
                            {(n.files || []).slice(0, 5).map((f, fi) => (
                              <span key={fi} className="filedrop-preview-file">{fileEmoji(f)} {f}</span>
                            ))}
                            {(n.files || []).length > 5 && (
                              <span className="filedrop-preview-file more">+{(n.files || []).length - 5} more</span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {scanResult.architecture.edges.length > 0 && (
                  <div className="filedrop-preview-edges">
                    <p className="filedrop-preview-section-title">Connections:</p>
                    <div className="filedrop-preview-edge-list">
                      {scanResult.architecture.edges.map((e, i) => (
                        <div key={i} className="filedrop-preview-edge">
                          <span className="filedrop-edge-source">{e.source}</span>
                          <span className="filedrop-edge-arrow">→</span>
                          <span className="filedrop-edge-target">{e.target}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {scanResult.source === 'rule-based' && (
                  <p className="filedrop-preview-notice">
                    ⚡ Rule-based analysis used{scanResult.llmError ? ` (LLM: ${scanResult.llmError})` : ' (LLM unavailable)'}
                  </p>
                )}

                {scanResult.mode === 'staged' && (
                  <p className="filedrop-preview-notice">
                    📦 Scanned a staged copy of {scanResult.stagedFiles ?? 0} dropped file(s) — no real path was
                    available, so bytes that never crossed the drop were not part of this scan.
                    {scanResult.skippedFiles ? ` ${scanResult.skippedFiles} file(s) were left out:` : ''}
                    {(scanResult.skipped || []).map((s, i) => (
                      <span key={i} className="filedrop-preview-note">· {s}</span>
                    ))}
                  </p>
                )}

                {(scanResult.architecture.notes || []).length > 0 && (
                  <div className="filedrop-preview-notes">
                    <p className="filedrop-preview-section-title">Evidence &amp; limits:</p>
                    {scanResult.architecture.notes!.slice(0, 10).map((note, i) => (
                      <p key={i} className="filedrop-preview-note">{note}</p>
                    ))}
                    {scanResult.architecture.notes!.length > 10 && (
                      <p className="filedrop-preview-note">
                        …and {scanResult.architecture.notes!.length - 10} more note(s)
                      </p>
                    )}
                  </div>
                )}

                {showClearConfirm && (
                  <div className="filedrop-clear-confirm">
                    <div className="filedrop-clear-confirm-icon">⚠️</div>
                    <p className="filedrop-clear-confirm-text">
                      Canvas already has nodes. What do you want to do?
                    </p>
                    <div className="filedrop-clear-confirm-actions">
                      <button
                        className="nn-btn filedrop-clear-btn"
                        onClick={handleApplyReplace}
                      >
                        🗑️ Clear & Replace
                      </button>
                      <button
                        className="nn-btn nn-confirm"
                        onClick={handleApplyAppend}
                        style={{ background: '#7c3aed' }}
                      >
                        ➕ Append to Canvas
                      </button>
                      <button
                        className="nn-btn nn-cancel"
                        onClick={() => setShowClearConfirm(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {!showClearConfirm && (
                  <div className="filedrop-actions" style={{ marginTop: 12 }}>
                    <button
                      className="nn-btn nn-cancel"
                    onClick={() => { setScanState('idle'); setScanResult(null); setShowClearConfirm(false); }}
                  >
                    Back
                  </button>
                  <button
                    className="nn-btn nn-confirm"
                    onClick={handleApplyScan}
                      style={{ background: '#7c3aed' }}
                    >
                      ✅ Create Node Build on Canvas
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Scan error ── */}
            {scanState === 'error' && (
              <div className="filedrop-scan-error">
                <p className="filedrop-error-icon">❌</p>
                <p className="filedrop-error-text">{scanError}</p>
                <div className="filedrop-actions" style={{ marginTop: 12 }}>
                  <button className="nn-btn nn-cancel" onClick={() => { setScanState('idle'); setScanResult(null); }}>
                    Back
                  </button>
                  <button className="filedrop-retry-btn" onClick={handleDeepScan}>
                    🔄 Retry Deep Scan
                  </button>
                </div>
              </div>
            )}

            {/* ── Applied status ── */}
            {scanState === 'done' && (
              <div className="filedrop-done">
                <p className="filedrop-done-icon">✅</p>
                <p className="filedrop-done-text">{scanProgress}</p>
              </div>
            )}

            {status !== 'idle' && scanState === 'idle' && (
              <div className={`filedrop-status ${status === 'error' ? 'error' : ''}`}>
                {status === 'analyzing' && <span className="spinner" />}
                {status === 'done' && '✅'}
                {status === 'error' && '❌'}
                {statusMsg}
              </div>
            )}

          </div>
        </div>
      )}
    </>
  );
};

export default FileDropHandler;
