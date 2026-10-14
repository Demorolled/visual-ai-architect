import axios from 'axios';
import { applyAxiosInterceptor } from '../utils/apiUrl';

// Apply the axios interceptor once
applyAxiosInterceptor();

const API_BASE = '/api';

export const api = {
  // Projects
  getProjects: () => axios.get(`${API_BASE}/projects`),
  getProject: (id: string) => axios.get(`${API_BASE}/projects/${id}`),
  createProject: (data: { name: string; targetOS: string }) =>
    axios.post(`${API_BASE}/projects`, data),
  updateProject: (id: string, data: object) =>
    axios.put(`${API_BASE}/projects/${id}`, data),
  deleteProject: (id: string) =>
    axios.delete(`${API_BASE}/projects/${id}`),

  // Agents
  getAgents: () => axios.get(`${API_BASE}/agents`),
  getAgentStatus: () => axios.get(`${API_BASE}/agents/status`),
  getTasks: () => axios.get(`${API_BASE}/agents/tasks`),
  getTask: (id: string) => axios.get(`${API_BASE}/agents/tasks/${id}`),
  cancelTask: (id: string) => axios.post(`${API_BASE}/agents/tasks/${id}/cancel`),
  createPlan: (data: object) => axios.post(`${API_BASE}/agents/plan`, data),
  executeGraph: (data: object) => axios.post(`${API_BASE}/agents/execute`, data),
  getBusEvents: (limit?: number) => axios.get(`${API_BASE}/agents/bus/events?limit=${limit || 100}`),

  // Scanner
  scanFile: (data: object) => axios.post(`${API_BASE}/scanner/scan-file`, data),
  scanDirectory: (data: object) => axios.post(`${API_BASE}/scanner/scan-directory`, data),
  securityScan: (data: object) => axios.post(`${API_BASE}/scanner/security-scan`, data),
  analyzeComplexity: (data: object) => axios.post(`${API_BASE}/scanner/analyze-complexity`, data),
  injectDebugLogs: (data: object) => axios.post(`${API_BASE}/scanner/debug/inject-logs`, data),
  removeDebugLogs: (data: object) => axios.post(`${API_BASE}/scanner/debug/remove-logs`, data),

  // Generation Security Scan (built into generation pipeline)
  /**
   * Run a security scan on arbitrary code snippets.
   * Body: { code: string, filePath?: string }
   */
  securityScanCode: (data: { code: string; filePath?: string }) =>
    axios.post(`${API_BASE}/generate/security-scan-code`, data),

  // Per-File Generation (Node-per-File Architecture)
  generateFiles: (projectId: string, options?: { skipValidation?: boolean; skipSecurityScan?: boolean }) =>
    axios.post(`${API_BASE}/generate/${projectId}/files`, options || {}),
  generateSingleFile: (projectId: string, nodeId: string) =>
    axios.post(`${API_BASE}/generate/${projectId}/file/${nodeId}`),
  validateSingleFile: (projectId: string, nodeId: string, code: string) =>
    axios.post(`${API_BASE}/generate/${projectId}/validate-single-file`, { nodeId, code }),
  validateAndFix: (data: { code: string; language?: string; projectName?: string; goal?: string; maxAttempts?: number }) =>
    axios.post(`${API_BASE}/generate/validate-and-fix`, data),

  // Export / Scaffold
  exportPerFileScaffold: (projectId: string, data?: { projectName?: string; targetOS?: string; outputDir?: string }) =>
    axios.post(`${API_BASE}/export/${projectId}/per-file-scaffold`, data || {}),

  // Pre-build validation of a custom output path (writability check)
  validateExportPath: (path: string) =>
    axios.post(`${API_BASE}/export/validate-path`, { path }),

  // Open an exported folder in the system file manager
  openExportFolder: (path: string) =>
    axios.post(`${API_BASE}/export/open-folder`, { path }),

  // Plan Mode — capture ideas to a text file for later creation
  savePlan: (data: { projectName: string; ideas: string; guidance?: string; questions?: string }) =>
    axios.post(`${API_BASE}/plans`, data),
  // Big Plan Mode — autosave the design as a folder (data/plans/<name>/):
  // plan.md for humans, graph.json so the canvas can reload it.
  savePlanGraph: (data: {
    projectName: string;
    goal?: string;
    nodes: Array<{ id: string; type: string; label: string; description?: string; language?: string; isMaster?: boolean; qa?: Array<{ q: string; a: string; at: string }> }>;
    edges: Array<{ source: string; target: string; label?: string }>;
  }) => axios.post(`${API_BASE}/plans/graph`, data),
  getPlanGraph: (name: string) => axios.get(`${API_BASE}/plans/graph/${encodeURIComponent(name)}`),
  // Big Plan Mode "build": map the design onto real files and folders with no
  // code generated. Deterministic backend work — no model call, no training rows.
  mapPlan: (data: {
    projectName?: string;
    goal?: string;
    nodes: Array<{ id: string; type: string; label: string; description?: string; language?: string; isMaster?: boolean; qa?: Array<{ q: string; a: string }> }>;
    edges: Array<{ source: string; target: string; label?: string }>;
  }) => axios.post(`${API_BASE}/plans/map`, data),
  // Saved Big Plan Mode designs (data/plans/<name>/ folders) — the reopen list.
  // Distinct from getPlans(), which lists the old single-file .txt notes that
  // cannot be loaded back onto the canvas.
  listPlanGraphs: () => axios.get(`${API_BASE}/plans/graphs`),
  // Big Plan Mode co-worker — the design graph in, questions to ask out.
  // Advisory only: the endpoint answers 200 with `questions: []` when the LLM
  // is unavailable, so a failure here never breaks the canvas.
  coworkPlan: (data: {
    projectName?: string;
    goal?: string;
    nodes: Array<{ id: string; type: string; label: string; description?: string; language?: string; isMaster?: boolean; qa?: Array<{ q: string; a: string }> }>;
    edges: Array<{ source: string; target: string; label?: string }>;
    alreadyAsked?: string[];
  }) => axios.post(`${API_BASE}/plans/cowork`, data),
  getPlans: () => axios.get(`${API_BASE}/plans`),
  getPlan: (name: string) => axios.get(`${API_BASE}/plans/${encodeURIComponent(name)}`),

  // Merge two project graphs into one
  mergeProjects: (data: {
    projectA: { name: string; nodes: any[]; edges: any[] };
    projectB: { name: string; nodes: any[]; edges: any[] };
    offsetB?: boolean;
  }) => axios.post(`${API_BASE}/merge`, data),

  // Semantic Connect — interpret how a node from the dropped app (B) should
  // wire into a node from the existing app (A), given a plain-language
  // description. Returns a semantic edge (label/relation/codeHint) that
  // codegen implements.
  connectNodes: (data: {
    nodes: any[];
    edges: any[];
    sourceNodeId: string;
    targetNodeId: string;
    description: string;
    projectName?: string;
    targetOS?: string;
  }) => axios.post(`${API_BASE}/merge/connect`, data),

  // Blueprint-driven builds: match a description against the 1200+ blueprint
  // bible, build the project graph, and generate the files with the live LLM.
  buildFromBlueprint: (data: {
    goal: string;
    purpose?: string;
    targetOS?: string;
    language?: string;
    scale?: string;
    appType?: string;
    skipValidation?: boolean;
  }) => axios.post(`${API_BASE}/blueprint/build`, data),

  // Pre-build GUI mockup — shows how the app's interface should look (as an
  // image) BEFORE any code is generated. Deterministic, no LLM call.
  blueprintMockup: (data: {
    goal: string;
    purpose?: string;
    targetOS?: string;
    language?: string;
    appType?: string;
    theme?: string;
    layout?: string;
  }) => axios.post(`${API_BASE}/blueprint/mockup`, data),

  // Standalone Code Review (no project needed)
  reviewCode: (data: {
    files: Array<{ fileName: string; code: string; language?: string; nodeLabel?: string }>;
    projectName?: string;
    appGoal?: string;
    targetOS?: string;
  }) =>
    axios.post(`${API_BASE}/review`, data),

  // Chat reactions — persisted server-side so they sync across devices
  getReactions: (messageId: string, userId: string) =>
    axios.get(`${API_BASE}/reactions/${encodeURIComponent(messageId)}`, { params: { userId } }),
  setReaction: (messageId: string, emoji: string, userId: string) =>
    axios.post(`${API_BASE}/reactions/${encodeURIComponent(messageId)}`, { emoji, userId }),
};

/**
 * Ensure the backend has a registered project for the current graph and return
 * a project id that is guaranteed to exist server-side.
 *
 * The backend keeps projects in memory, so a server restart wipes its registry
 * and leaves the stored `current-project-id` stale — every subsequent
 * generation/scaffold call then fails with "Project not found" (404). This
 * recovers by re-registering the project from the current canvas state and
 * pushing the latest nodes/edges, and auto-creates one when no id is stored.
 * It also always pushes the graph, so the server copy is never empty or stale.
 */
export async function ensureServerProject(data: {
  projectId: string | null;
  name: string;
  targetOS: string;
  nodes: any[];
  edges: any[];
  /**
   * Tree Mode: the app trees on the canvas. The backend builds each tree as a
   * separate app and derives the cross-app bridges from the tree membership, so
   * without this the server copy is a single-app project and Tree Mode silently
   * produces one flat app.
   */
  trees?: any[];
}): Promise<string> {
  let id = data.projectId;
  const payload = { nodes: data.nodes, edges: data.edges, ...(data.trees ? { trees: data.trees } : {}) };

  // Fast path: the stored id may still exist — push the graph to it. If the
  // registry was wiped by a restart this 404s and we recreate the project.
  if (id) {
    try {
      await api.updateProject(id, payload);
      return id;
    } catch (err: any) {
      if (err?.response?.status !== 404) throw err;
    }
  }

  const createRes = await api.createProject({ name: data.name, targetOS: data.targetOS });
  const freshId: string = createRes.data.id;
  localStorage.setItem('current-project-id', freshId);
  await api.updateProject(freshId, payload);
  return freshId;
}
