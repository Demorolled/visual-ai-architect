import { create } from 'zustand';
import { Node, Edge } from 'reactflow';
import { OSType, NodeStatus, SubNodeData, CodeLanguage, WizardStep, StoredDesign } from '../types';
import { saveProject as persistSave, loadProject, loadProjects, deleteProject as persistDelete, exportProject, importProject as persistImport, SavedProject } from '../utils/projectStorage';
import { performAutoSave, AutoSaveSnapshot } from '../utils/autoSave';

export type { SavedProject };

let nodeIdCounter = 0;
let subNodeIdCounter = 0;

export function getNextNodeId() {
  return `node_${nodeIdCounter++}`;
}

export function getNextSubNodeId() {
  return `sub_${subNodeIdCounter++}_${Date.now()}`;
}

// ── Undo/redo types ─────────────────────────────────────────────

interface CanvasSnapshot {
  nodes: Node[];
  edges: Edge[];
}

const MAX_HISTORY = 50;

function snapshotProject(state: ProjectState): CanvasSnapshot {
  return {
    nodes: JSON.parse(JSON.stringify(state.nodes)),
    edges: JSON.parse(JSON.stringify(state.edges)),
  };
}

interface ProjectState {
  projectId: string | null;
  projectName: string;
  targetOS: OSType;
  nodes: Node[];
  edges: Edge[];
  selectedNode: string | null;
  logicEditorOpen: boolean;
  roadmapDetached: boolean;
  reasoningDetached: boolean;
  codeOutputDetached: boolean;
  showCanvasRoadmap: boolean;
  isGenerating: boolean;
  generationLayer: number;
  saved: boolean;
  thinking: boolean;
  progress: number;

  // ── Code review ──
  codeReviewResult: Record<string, any> | null;
  setCodeReviewResult: (result: Record<string, any> | null) => void;

  // ── Dropped-site preview ──
  /** URL (relative /api path) of a dropped folder served as a static site */
  sitePreviewUrl: string | null;
  setSitePreviewUrl: (url: string | null) => void;

  // ── Preview-open request (chat "show me a preview" button) ──
  /** Incrementing token — each bump tells App.tsx to open the floating preview. */
  previewRequestToken: number;
  /**
   * Optional app description carried with the request. When nothing is built
   * yet, App.tsx uses it to generate a GUI mockup for this description
   * (falls back to userGoal / projectName). Each request resets it.
   */
  previewRequestGoal: string | null;
  /** Bump the token to request the floating preview window to open. */
  requestPreview: (goal?: string) => void;

  // ── Blueprint build request (mockup's "Build This Now" → pre-filled dialog) ──
  /** Incrementing token — each bump tells App.tsx to open the blueprint dialog. */
  blueprintRequestToken: number;
  /** Goal carried with the request — pre-fills the build dialog. */
  blueprintRequestGoal: string | null;
  /** Optional purpose carried with the request. */
  blueprintRequestPurpose: string | null;
  /** Request the blueprint build dialog to open, pre-filled with the goal. */
  requestBlueprintBuild: (goal: string, purpose?: string) => void;
  /** Consume (clear) a pending blueprint request after the dialog opens. */
  clearBlueprintRequest: () => void;

  // ── Settings open request (preview toast → Auto GUI Preview toggle) ──
  /** Incrementing token — each bump tells ProjectManager to open settings. */
  settingsOpenToken: number;
  /** Bump the token to request the settings dropdown to open. */
  requestOpenSettings: () => void;

  // ── Session-history request (chat "show me the session history") ──
  /** Incrementing token — each bump tells App.tsx to open the session-history window. */
  sessionHistoryRequestToken: number;
  /** Bump the token to request the session history window to open. */
  requestSessionHistory: () => void;

  // ── Wiki request (chat "show your wiki") ──
  /** Incrementing token — each bump tells App.tsx to open the wiki window. */
  wikiRequestToken: number;
  /** Bump the token to request the wiki window to open. */
  requestWiki: () => void;

  // ── Todo request (chat "open the todo list") ──
  /** Incrementing token — each bump tells App.tsx to open the todo window. */
  todoRequestToken: number;
  /** Bump the token to request the todo list window to open. */
  requestTodo: () => void;

  // ── Workflow state ──
  wizardStep: WizardStep;
  userGoal: string;
  userPurpose: string;
  selectedDesign: StoredDesign | null;
  includeGUI: boolean;
  reworkMode: boolean;
  /** ID of the node currently being stream-filled (for typing animation) */
  nodeBeingFilled: string | null;
  /** ID of the node whose code editor is open (null = closed) */
  codeEditorNodeId: string | null;
  setWizardStep: (step: WizardStep) => void;
  setUserGoal: (goal: string) => void;
  setUserPurpose: (purpose: string) => void;
  setSelectedDesign: (design: StoredDesign | null) => void;
  setIncludeGUI: (include: boolean) => void;
  setReworkMode: (rework: boolean) => void;
  setNodeBeingFilled: (id: string | null) => void;
  setCodeEditorNodeId: (id: string | null) => void;

  setTargetOS: (os: OSType) => void;
  addNode: (node: Node) => void;
  batchAddNodes: (newNodes: Node[], newEdges: Edge[], os: OSType) => void;
  /** Replace all non-master nodes/edges with new ones (used on rebuild) */
  replaceNodes: (newNodes: Node[], newEdges: Edge[], os: OSType, masterNodeId?: string) => void;
  updateNode: (id: string, data: Partial<Node['data']>) => void;
  updateNodePosition: (id: string, position: { x: number; y: number }) => void;
  deleteNode: (id: string) => void;
  addEdge: (edge: Edge) => void;
  removeEdge: (id: string) => void;
  setSelectedNode: (id: string | null) => void;
  setLogicEditorOpen: (open: boolean) => void;
  setRoadmapDetached: (detached: boolean) => void;
  setShowCanvasRoadmap: (show: boolean) => void;
  setReasoningDetached: (detached: boolean) => void;
  setCodeOutputDetached: (detached: boolean) => void;
  setGenerating: (generating: boolean) => void;
  setGenerationLayer: (layer: number) => void;
  setThinking: (thinking: boolean) => void;
  setProgress: (progress: number) => void;
  setNodeLanguage: (id: string, language: CodeLanguage) => void;
  toggleNodeExpanded: (id: string) => void;
  updateNodeStatus: (id: string, status: NodeStatus, error?: string, code?: string) => void;
  clearProject: () => void;

  addSubNode: (parentId: string, subNode: SubNodeData) => void;
  updateSubNode: (parentId: string, subNodeId: string, data: Partial<SubNodeData>) => void;
  deleteSubNode: (parentId: string, subNodeId: string) => void;
  addSubNodeEdge: (parentId: string, edge: { id: string; source: string; target: string }) => void;
  removeSubNodeEdge: (parentId: string, edgeId: string) => void;

  saveProject: () => SavedProject | null;
  loadProject: (id: string) => void;
  loadLastProject: () => boolean;
  loadProjects: () => SavedProject[];
  deleteProject: (id: string) => boolean;
  exportProject: () => string | null;
  importProject: (json: string) => SavedProject | null;
  setProjectName: (name: string) => void;
  markSaved: () => void;
  restoreFromSnapshot: (snapshot: AutoSaveSnapshot) => void;

  // ── Undo/redo ──
  _undoStack: CanvasSnapshot[];
  _redoStack: CanvasSnapshot[];
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  _pushHistory: () => void;
  _clearHistory: () => void;
}

function generateId() {
  return `proj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

const DEFAULT_PROJECT_STATE = {
  projectId: null,
  projectName: 'Untitled Project',
  targetOS: 'linux' as OSType,
  nodes: [],
  edges: [],
  selectedNode: null,
  _undoStack: [],
  _redoStack: [],
  canUndo: false,
  canRedo: false,
  logicEditorOpen: false,
  roadmapDetached: false,
  reasoningDetached: false,
  codeOutputDetached: false,
  showCanvasRoadmap: false,
  isGenerating: false,
  generationLayer: 0,
  saved: true,
  thinking: false,
  progress: 0,

  // Workflow state
  wizardStep: 'welcome' as WizardStep,
  userGoal: '',
  userPurpose: '',
  selectedDesign: null,
  includeGUI: true,
  reworkMode: false,
  nodeBeingFilled: null,
  codeEditorNodeId: null,
  codeReviewResult: null,
};

export const useProjectStore = create<ProjectState>((origSet, get) => {
  const set: typeof origSet = ((partial: any, replace?: boolean) => {
    origSet(partial as any, replace);
    const state = get();
    if (state.projectId) {
      performAutoSave(state.projectId, {
        nodes: state.nodes,
        edges: state.edges,
        targetOS: state.targetOS,
        projectName: state.projectName,
      });
    }
  }) as typeof origSet;

  return {
  projectId: null,
  projectName: 'Untitled Project',
  targetOS: 'linux' as OSType,
  nodes: [],
  edges: [],
  selectedNode: null,
  _undoStack: [],
  _redoStack: [],
  canUndo: false,
  canRedo: false,
  logicEditorOpen: false,
  roadmapDetached: false,
  reasoningDetached: false,
  codeOutputDetached: false,
  showCanvasRoadmap: false,
  isGenerating: false,
  generationLayer: 0,
  saved: true,
  thinking: false,
  progress: 0,

  // Workflow state
  wizardStep: 'welcome' as WizardStep,
  userGoal: '',
  userPurpose: '',
  selectedDesign: null,
  includeGUI: true,
  reworkMode: false,
  nodeBeingFilled: null,
  codeEditorNodeId: null,
  codeReviewResult: null,
  sitePreviewUrl: null,
  previewRequestToken: 0,
  previewRequestGoal: null,
  blueprintRequestToken: 0,
  blueprintRequestGoal: null,
  blueprintRequestPurpose: null,
  settingsOpenToken: 0,
  sessionHistoryRequestToken: 0,
  wikiRequestToken: 0,
  todoRequestToken: 0,

  setSitePreviewUrl: (url) => set({ sitePreviewUrl: url }),

  requestPreview: (goal) => set(state => ({ previewRequestToken: state.previewRequestToken + 1, previewRequestGoal: goal || null })),

  requestBlueprintBuild: (goal, purpose) => set(state => ({
    blueprintRequestToken: state.blueprintRequestToken + 1,
    blueprintRequestGoal: goal,
    blueprintRequestPurpose: purpose || null,
  })),
  clearBlueprintRequest: () => set({ blueprintRequestToken: 0, blueprintRequestGoal: null, blueprintRequestPurpose: null }),

  requestOpenSettings: () => set(state => ({ settingsOpenToken: state.settingsOpenToken + 1 })),

  requestSessionHistory: () => set(state => ({ sessionHistoryRequestToken: state.sessionHistoryRequestToken + 1 })),

  requestWiki: () => set(state => ({ wikiRequestToken: state.wikiRequestToken + 1 })),

  requestTodo: () => set(state => ({ todoRequestToken: state.todoRequestToken + 1 })),

  setWizardStep: (step) => set({ wizardStep: step }),

  setUserGoal: (goal) => set({ userGoal: goal }),

  setUserPurpose: (purpose) => set({ userPurpose: purpose }),

  setSelectedDesign: (design) => set({ selectedDesign: design }),

  setIncludeGUI: (include) => set({ includeGUI: include }),

  setReworkMode: (rework) => set({ reworkMode: rework }),

  setNodeBeingFilled: (id) => set({ nodeBeingFilled: id }),

  setProjectName: (name) => {
    set({ projectName: name, saved: false });
  },

  markSaved: () => set({ saved: true }),

  // ── History push helper ──
  _pushHistory: () => set((state) => {
    const snapshot = snapshotProject(state as ProjectState);
    const stack = [...state._undoStack, snapshot].slice(-MAX_HISTORY);
    return { _undoStack: stack, _redoStack: [], canUndo: true, canRedo: false };
  }),

  _clearHistory: () => set({ _undoStack: [], _redoStack: [], canUndo: false, canRedo: false }),

  undo: () => set((state) => {
    if (state._undoStack.length === 0) return state;
    const stack = [...state._undoStack];
    const snapshot = stack.pop()!;
    const currentSnapshot = snapshotProject(state as ProjectState);
    const redoStack = [...state._redoStack, currentSnapshot].slice(-MAX_HISTORY);
    return {
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      _undoStack: stack,
      _redoStack: redoStack,
      canUndo: stack.length > 0,
      canRedo: true,
      saved: false,
    };
  }),

  redo: () => set((state) => {
    if (state._redoStack.length === 0) return state;
    const stack = [...state._redoStack];
    const snapshot = stack.pop()!;
    const currentSnapshot = snapshotProject(state as ProjectState);
    const undoStack = [...state._undoStack, currentSnapshot].slice(-MAX_HISTORY);
    return {
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      _undoStack: undoStack,
      _redoStack: stack,
      canUndo: true,
      canRedo: stack.length > 0,
      saved: false,
    };
  }),

  setTargetOS: (os) => set({ targetOS: os, saved: false }),

  addNode: (node) => set((state) => {
    const prev = snapshotProject(state as ProjectState);
    const stack = [...state._undoStack, prev].slice(-MAX_HISTORY);
    return {
      nodes: [...state.nodes, node],
      _undoStack: stack,
      _redoStack: [],
      canUndo: true,
      canRedo: false,
      saved: false,
    };
  }),

  batchAddNodes: (newNodes, newEdges, os) => set((state) => {
    const prev = snapshotProject(state as ProjectState);
    const stack = [...state._undoStack, prev].slice(-MAX_HISTORY);
    return {
      nodes: [...state.nodes, ...newNodes],
      edges: [...state.edges, ...newEdges],
      targetOS: os,
      _undoStack: stack,
      _redoStack: [],
      canUndo: true,
      canRedo: false,
      saved: false,
    };
  }),

  replaceNodes: (newNodes, newEdges, os, masterNodeId) => set((state) => {
    const prev = snapshotProject(state as ProjectState);
    const stack = [...state._undoStack, prev].slice(-MAX_HISTORY);
    const keptMaster = masterNodeId ? state.nodes.find((n) => n.id === masterNodeId) : undefined;
    return {
      nodes: keptMaster ? [keptMaster, ...newNodes] : newNodes,
      edges: newEdges,
      targetOS: os,
      _undoStack: stack,
      _redoStack: [],
      canUndo: true,
      canRedo: false,
      saved: false,
    };
  }),

  updateNode: (id, data) => set((state) => {
    const prev = snapshotProject(state as ProjectState);
    const stack = [...state._undoStack, prev].slice(-MAX_HISTORY);
    return {
      nodes: state.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n
      ),
      _undoStack: stack,
      _redoStack: [],
      canUndo: true,
      canRedo: false,
      saved: false,
    };
  }),

  deleteNode: (id) => set((state) => {
    const prev = snapshotProject(state as ProjectState);
    const stack = [...state._undoStack, prev].slice(-MAX_HISTORY);
    return {
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
      _undoStack: stack,
      _redoStack: [],
      canUndo: true,
      canRedo: false,
      saved: false,
    };
  }),

  addEdge: (edge) => set((state) => {
    const prev = snapshotProject(state as ProjectState);
    const stack = [...state._undoStack, prev].slice(-MAX_HISTORY);
    return {
      edges: [...state.edges, edge],
      _undoStack: stack,
      _redoStack: [],
      canUndo: true,
      canRedo: false,
      saved: false,
    };
  }),

  removeEdge: (id) => set((state) => {
    const prev = snapshotProject(state as ProjectState);
    const stack = [...state._undoStack, prev].slice(-MAX_HISTORY);
    return {
      edges: state.edges.filter((e) => e.id !== id),
      _undoStack: stack,
      _redoStack: [],
      canUndo: true,
      canRedo: false,
      saved: false,
    };
  }),

  updateNodePosition: (id, position) => set((state) => ({
    nodes: state.nodes.map((n) =>
      n.id === id ? { ...n, position } : n
    ),
    saved: false,
  })),

  setSelectedNode: (id) => set({ selectedNode: id }),

  setGenerating: (generating) => {
    set({ isGenerating: generating, thinking: generating });
    if (!generating) set({ thinking: false, progress: 100 });
  },

  setGenerationLayer: (layer) => {
    const progress = Math.min(layer * 33, 99);
    set({ generationLayer: layer, progress });
  },

  setThinking: (thinking) => set({ thinking }),

  setProgress: (progress) => set({ progress: Math.min(100, Math.max(0, progress)) }),

  setNodeLanguage: (id, language) => set((state) => ({
    nodes: state.nodes.map((n) =>
      n.id === id ? { ...n, data: { ...n.data, language } } : n
    ),
    saved: false,
  })),

  toggleNodeExpanded: (id) => set((state) => ({
    nodes: state.nodes.map((n) =>
      n.id === id ? { ...n, data: { ...n.data, expanded: !n.data?.expanded } } : n
    ),
  })),

  updateNodeStatus: (id, status, error, code) => set((state) => ({
    nodes: state.nodes.map((n) =>
      n.id === id
        ? {
            ...n,
            data: {
              ...n.data,
              status,
              error: error || n.data?.error,
              generatedCode: code || n.data?.generatedCode
            }
          }
        : n
    ),
    saved: false,
  })),

  clearProject: () => {
    nodeIdCounter = 0;
    subNodeIdCounter = 0;
    set({ ...DEFAULT_PROJECT_STATE, codeReviewResult: null });
  },

  setLogicEditorOpen: (open) => set({ logicEditorOpen: open }),

  setRoadmapDetached: (detached) => set({ roadmapDetached: detached }),
  setShowCanvasRoadmap: (show) => set({ showCanvasRoadmap: show }),
  setReasoningDetached: (detached) => set({ reasoningDetached: detached }),
  setCodeOutputDetached: (detached) => set({ codeOutputDetached: detached }),
  setCodeReviewResult: (result) => set({ codeReviewResult: result }),
  setCodeEditorNodeId: (id) => set({ codeEditorNodeId: id }),

  addSubNode: (parentId, subNode) => set((state) => ({
    nodes: state.nodes.map((n) => {
      if (n.id !== parentId) return n;
      const existingSubNodes = n.data?.subNodes || [];
      return {
        ...n,
        data: { ...n.data, subNodes: [...existingSubNodes, subNode] },
      };
    }),
    saved: false,
  })),

  updateSubNode: (parentId, subNodeId, data) => set((state) => ({
    nodes: state.nodes.map((n) => {
      if (n.id !== parentId) return n;
      const existingSubNodes = n.data?.subNodes || [];
      return {
        ...n,
        data: {
          ...n.data,
          subNodes: existingSubNodes.map((sn: SubNodeData) =>
            sn.id === subNodeId ? { ...sn, ...data } : sn
          ),
        },
      };
    }),
    saved: false,
  })),

  deleteSubNode: (parentId, subNodeId) => set((state) => ({
    nodes: state.nodes.map((n) => {
      if (n.id !== parentId) return n;
      const existingSubNodes = n.data?.subNodes || [];
      const existingEdges = n.data?.subNodeEdges || [];
      return {
        ...n,
        data: {
          ...n.data,
          subNodes: existingSubNodes.filter((sn: SubNodeData) => sn.id !== subNodeId),
          subNodeEdges: existingEdges.filter(
            (e: { source: string; target: string }) => e.source !== subNodeId && e.target !== subNodeId
          ),
        },
      };
    }),
    saved: false,
  })),

  addSubNodeEdge: (parentId, edge) => set((state) => ({
    nodes: state.nodes.map((n) => {
      if (n.id !== parentId) return n;
      const existingEdges = n.data?.subNodeEdges || [];
      return {
        ...n,
        data: { ...n.data, subNodeEdges: [...existingEdges, edge] },
      };
    }),
    saved: false,
  })),

  removeSubNodeEdge: (parentId, edgeId) => set((state) => ({
    nodes: state.nodes.map((n) => {
      if (n.id !== parentId) return n;
      const existingEdges = n.data?.subNodeEdges || [];
      return {
        ...n,
        data: { ...n.data, subNodeEdges: existingEdges.filter((e: { id: string }) => e.id !== edgeId) },
      };
    }),
    saved: false,
  })),

  saveProject: () => {
    const state = get();
    const id = state.projectId || generateId();
    const saved = persistSave({
      id,
      name: state.projectName,
      targetOS: state.targetOS,
      nodes: state.nodes,
      edges: state.edges,
      codeReviewResult: state.codeReviewResult ?? undefined,
    });
    set({ projectId: id, saved: true });
    return saved;
  },

  loadProject: (id) => {
    const saved = loadProject(id);
    if (!saved) return;

    const existingCount = saved.nodes.length;
    nodeIdCounter = existingCount;

    set({
      projectId: saved.id,
      projectName: saved.name,
      targetOS: saved.targetOS,
      nodes: saved.nodes,
      edges: saved.edges,
      codeReviewResult: (saved as any).codeReviewResult ?? null,
      selectedNode: null,
      logicEditorOpen: false,
      roadmapDetached: false,
      reasoningDetached: false,
      codeOutputDetached: false,
      showCanvasRoadmap: false,
      isGenerating: false,
      generationLayer: 0,
      saved: true,
      _undoStack: [],
      _redoStack: [],
      canUndo: false,
      canRedo: false,
    });
  },

  loadProjects: () => loadProjects(),

  deleteProject: (id) => persistDelete(id),

  exportProject: () => {
    const state = get();
    if (!state.projectId) return null;
    return exportProject(state.projectId);
  },

  importProject: (json) => {
    const imported = persistImport(json);
    if (!imported) return null;

    const existingCount = imported.nodes.length;
    nodeIdCounter = existingCount;

    set({
      projectId: imported.id,
      projectName: imported.name,
      targetOS: imported.targetOS,
      nodes: imported.nodes,
      edges: imported.edges,
      codeReviewResult: (imported as any).codeReviewResult ?? null,
      selectedNode: null,
      logicEditorOpen: false,
      roadmapDetached: false,
      reasoningDetached: false,
      codeOutputDetached: false,
      showCanvasRoadmap: false,
      isGenerating: false,
      generationLayer: 0,
      saved: true,
      _undoStack: [],
      _redoStack: [],
      canUndo: false,
      canRedo: false,
    });

    return imported;
  },

  loadLastProject: () => {
    const projects = loadProjects();
    if (projects.length === 0) return false;

    const last = projects[0]; // Already sorted by date descending
    get().loadProject(last.id);
    return true;
  },

  restoreFromSnapshot: (snapshot) => {
    const state = get();
    if (state.projectId) {
      performAutoSave(state.projectId, {
        nodes: state.nodes,
        edges: state.edges,
        targetOS: state.targetOS,
        projectName: state.projectName,
      });
    }
    const maxId = snapshot.nodes.reduce((max, n) => {
      const m = n.id.match(/node_(\d+)/);
      return m ? Math.max(max, parseInt(m[1]) + 1) : max;
    }, 0);
    nodeIdCounter = maxId;
    set({
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      targetOS: snapshot.targetOS,
      projectName: snapshot.projectName,
      codeReviewResult: null,
      selectedNode: null,
      logicEditorOpen: false,
      roadmapDetached: false,
      reasoningDetached: false,
      codeOutputDetached: false,
      showCanvasRoadmap: false,
      isGenerating: false,
      generationLayer: 0,
      saved: false,
    });
  },
  };
});
