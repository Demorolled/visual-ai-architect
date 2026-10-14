import { create } from 'zustand';
import { Node, Edge } from 'reactflow';
import { OSType, NodeStatus, SubNodeData, CodeLanguage, WizardStep, StoredDesign, NodeType, NODE_TYPE_OPTIONS, LANGUAGE_OPTIONS, PlanQA, PlanQuestion, AppTree, CrossTreeConnection, CROSS_TREE_PAYLOAD_OPTIONS } from '../types';
import { saveProject as persistSave, loadProject, loadProjects, deleteProject as persistDelete, exportProject, importProject as persistImport, SavedProject } from '../utils/projectStorage';
import { performAutoSave, AutoSaveSnapshot } from '../utils/autoSave';

export type { SavedProject };

let nodeIdCounter = 0;
let subNodeIdCounter = 0;
let treeIdCounter = 0;

export function getNextNodeId() {
  return `node_${nodeIdCounter++}`;
}

/**
 * Advance the node-id counter past ids that came from somewhere else.
 *
 * The counter is per-session and starts at 0, so a design loaded from disk
 * (whose ids were minted in an earlier session) would collide: the next node
 * placed would be handed an id that a loaded node already owns, and updates
 * would then hit both. Called whenever a saved graph is loaded.
 */
export function reserveNodeIds(ids: string[]) {
  for (const id of ids) {
    const m = /^node_(\d+)$/.exec(id);
    if (m) nodeIdCounter = Math.max(nodeIdCounter, Number(m[1]) + 1);
  }
}

export function getNextSubNodeId() {
  return `sub_${subNodeIdCounter++}_${Date.now()}`;
}

/** Mint the next app-tree id (Tree Mode). */
export function getNextTreeId(): string {
  return `tree_${++treeIdCounter}`;
}

/**
 * Advance the tree-id counter past ids that came from somewhere else (a loaded
 * project, an imported file), mirroring reserveNodeIds — otherwise the next
 * tree added would be handed an id an existing tree already owns.
 */
export function reserveTreeIds(ids: string[]) {
  for (const id of ids) {
    const m = /^tree_(\d+)$/.exec(id);
    if (m) treeIdCounter = Math.max(treeIdCounter, Number(m[1]));
  }
}

/**
 * The root node id for a tree. The FIRST tree keeps the legacy `'master-node'`
 * id: dozens of places (filters, plan autosave, the palette) special-case that
 * literal, and a project saved before Tree Mode existed must still line up with
 * it. Later trees get their own id.
 */
export function rootNodeIdFor(treeId: string): string {
  return treeId === 'tree_1' ? 'master-node' : `master-${treeId}`;
}

/**
 * Is this node an app-tree ROOT?
 *
 * Roots are project metadata (they carry a tree's goal, target OS and scale),
 * not modules the user designs — so they are excluded from the design/plan
 * payloads. This used to be written as `id !== 'master-node'` in a dozen
 * places, which was correct while a project held exactly one tree; the type is
 * the real identity, so Tree Mode's extra roots are excluded too.
 */
export function isRootNode(node: { type?: string } | undefined | null): boolean {
  return !!node && node.type === 'master';
}

/** Which tree does this node belong to? Falls back to the first tree. */
export function treeIdOfNode(node: Node | undefined, trees: AppTree[]): string | null {
  if (!node) return null;
  const own = (node.data as any)?.treeId;
  if (typeof own === 'string' && trees.some(t => t.id === own)) return own;
  return trees[0]?.id ?? null;
}

/**
 * Stamp a freshly placed node with the active tree, so a node dropped while
 * tree #2 is active joins tree #2 instead of silently landing in tree #1.
 *
 * Roots (`type: 'master'`) and nodes that already name a tree are left alone —
 * the root belongs to the tree that created it, and `addTree` stamps its own.
 */
function withTree(node: Node, activeTreeId: string | null): Node {
  if (node.type === 'master') return node;
  if ((node.data as any)?.treeId) return node;
  if (!activeTreeId) return node;
  return { ...node, data: { ...node.data, treeId: activeTreeId } };
}

// ── Undo/redo types ─────────────────────────────────────────────

interface CanvasSnapshot {
  nodes: Node[];
  edges: Edge[];
  /**
   * Trees ride along with the snapshot: adding/removing a tree mutates both the
   * `trees` array and `nodes`, so an undo that restored nodes without trees (or
   * vice versa) would leave the two out of sync.
   */
  trees: AppTree[];
}

const MAX_HISTORY = 50;

function snapshotProject(state: ProjectState): CanvasSnapshot {
  return {
    nodes: JSON.parse(JSON.stringify(state.nodes)),
    edges: JSON.parse(JSON.stringify(state.edges)),
    trees: JSON.parse(JSON.stringify(state.trees)),
  };
}

/**
 * Normalize a loaded project into Tree Mode shape.
 *
 * Every project saved before Tree Mode has no `trees` and no `data.treeId` on
 * its nodes, but it IS conceptually one tree: the single master node and every
 * node hanging off it. This derives that tree, stamps membership onto the
 * nodes, and returns the normal form — so the rest of the store never has to
 * ask "is this a tree-mode project?".
 *
 * Also heals partial data on projects saved by an earlier build of Tree Mode
 * (a node with no treeId, a tree whose root is missing).
 *
 * Exported for tests.
 */
export function migrateTrees(
  nodes: Node[],
  trees: AppTree[] | undefined,
): { nodes: Node[]; trees: AppTree[]; activeTreeId: string | null } {
  const roots = nodes.filter(n => n.type === 'master');
  let next: AppTree[] = Array.isArray(trees) ? trees.map(t => ({ ...t })) : [];

  if (next.length === 0) {
    // No tree metadata: treat the whole canvas as one tree rooted at the master
    // node (a plan-only project has no master — its root stays null, and the
    // plan seed is the effective root).
    const root = roots[0];
    next = [{
      id: 'tree_1',
      name: 'App 1',
      goal: (root?.data as any)?.appGoal || '',
      purpose: (root?.data as any)?.appPurpose,
      targetOS: ((root?.data as any)?.selectedOS as OSType) || 'linux',
      scale: (root?.data as any)?.scale,
      rootNodeId: root?.id ?? null,
    }];
  }

  // Adopt any master node no tree claims as the root of the first root-less
  // tree (e.g. a project that gained a master after its trees were written).
  const claimed = new Set(next.map(t => t.rootNodeId).filter(Boolean) as string[]);
  for (const root of roots) {
    if (claimed.has(root.id)) continue;
    const target = next.find(t => !t.rootNodeId);
    if (!target) break;
    target.rootNodeId = root.id;
    claimed.add(root.id);
  }

  const fallbackId = next[0].id;
  const validIds = new Set(next.map(t => t.id));
  const migratedNodes = nodes.map(n => {
    const own = (n.data as any)?.treeId;
    // The root of a tree IS that tree, whatever its data says.
    const owner = next.find(t => t.rootNodeId === n.id)?.id;
    const treeId = owner || (typeof own === 'string' && validIds.has(own) ? own : fallbackId);
    return { ...n, data: { ...n.data, treeId } };
  });

  reserveTreeIds(next.map(t => t.id));
  return { nodes: migratedNodes, trees: next, activeTreeId: next[0]?.id ?? null };
}

/**
 * Auto-layout a reloaded plan design.
 *
 * The saved graph.json stores the design's MEANING (nodes, purposes, wiring),
 * not where the user happened to have dragged things — so a reloaded plan has
 * no positions and would otherwise stack every node on one spot. Depth along
 * the wiring (what feeds what) puts each node one column right of its
 * dependencies, which is how the design reads on the canvas: masters and
 * sources first, dependents after.
 */
function layoutPlanNodes(
  nodes: Array<{ id: string; isMaster?: boolean }>,
  edges: Array<{ source: string; target: string }>,
): Map<string, { x: number; y: number }> {
  const ids = new Set(nodes.map((n) => n.id));
  const depth = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const MAX_DEPTH = 6; // also the cycle guard: a loop stops deepening at the cap

  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false;
    for (const e of edges) {
      if (!ids.has(e.source) || !ids.has(e.target)) continue;
      const d = Math.min((depth.get(e.source) || 0) + 1, MAX_DEPTH);
      if (d > (depth.get(e.target) || 0)) {
        depth.set(e.target, d);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const masters = nodes.filter((n) => n.isMaster);
  const ordered = [...masters, ...nodes.filter((n) => !n.isMaster)];
  const rowInColumn = new Map<number, number>();
  const out = new Map<string, { x: number; y: number }>();

  for (const n of ordered) {
    // The master node is the design's root whatever the wiring says.
    const col = n.isMaster ? 0 : depth.get(n.id) || 0;
    const row = rowInColumn.get(col) || 0;
    rowInColumn.set(col, row + 1);
    out.set(n.id, { x: 120 + col * 280, y: 80 + row * 150 });
  }
  return out;
}

/**
 * Export options carried from a chat request into the build dialog, so a single
 * message ("build me a tic tac toe game and export it to my desktop") can run
 * the whole build → export → open-folder flow without any button clicks.
 */
export interface BlueprintExportRequest {
  /** Destination directory (~/Desktop/x). Undefined → backend default. */
  outputDir?: string;
  /** Folder/app name to export as. */
  folderName?: string;
}

interface ProjectState {
  projectId: string | null;
  projectName: string;
  targetOS: OSType;
  nodes: Node[];
  edges: Edge[];
  selectedNode: string | null;
  /**
   * Tree Mode — the app trees in this project, laid out side by side.
   *
   * A project with one tree behaves exactly as it always has (`nodes` are that
   * tree's nodes). `activeTreeId` is the tree a newly dropped node joins, and
   * the one the tree bar highlights.
   */
  trees: AppTree[];
  activeTreeId: string | null;
  /**
   * Plan Mode — the canvas-first planning flow.
   *
   * Plan Mode used to be a modal notepad that wrote data/plans/<name>.txt and
   * nothing ever read back. As a store flag it instead changes how the canvas
   * behaves: the palette offers a single seed node until that seed is placed,
   * the seed's purpose becomes the plan's goal, and the LLM co-pilot reads the
   * graph from there.
   */
  planMode: boolean;
  /** Id of the plan's seed node; null until the user drops it. */
  planSeedId: string | null;
  /**
   * Questions the co-worker is currently asking, and whether they have been
   * answered. Held in the store (not a panel's local state) so the panel and
   * the terminal cannot disagree about what is still open.
   */
  planQuestions: PlanQuestion[];
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
  /**
   * Export request carried with the build, when the chat asked for the app to
   * be written out to disk ("build X and export it to my desktop"). The build
   * dialog reads this on mount and, once the build succeeds, runs the export
   * itself — no ⚡ Build This Now / Export button clicks.
   */
  blueprintRequestExport: BlueprintExportRequest | null;
  /** Request the blueprint build dialog to open, pre-filled with the goal. */
  requestBlueprintBuild: (goal: string, purpose?: string, exportRequest?: BlueprintExportRequest | null) => void;
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
  /**
   * Edge id to visually emphasise on the canvas right after a Connect & Describe
   * apply, so the user immediately SEES their new 2-node connection take effect.
   * Transient UI state (never persisted); the dialog clears it a few seconds later.
   */
  highlightedEdgeId: string | null;
  highlightEdge: (id: string | null) => void;
  setWizardStep: (step: WizardStep) => void;
  setPlanMode: (on: boolean) => void;
  setPlanSeedId: (id: string | null) => void;
  /** Replace the open questions (the co-worker's latest round). */
  setPlanQuestions: (questions: PlanQuestion[]) => void;
  /**
   * Attach the user's answer to the node the question was about, then close
   * the question. This is the whole point of the wiring: the answer becomes
   * part of that node's design (data.planQa), so it flows into the saved plan
   * and into whatever the node is later built from.
   */
  answerPlanQuestion: (questionId: string, answer: string) => void;
  /** Drop a question without answering it. */
  dismissPlanQuestion: (questionId: string) => void;
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

  // ── Tree Mode ──
  /**
   * Start a NEW app tree: registers it and places its root master node to the
   * right of everything already on the canvas, then makes it active so the
   * next node dropped joins the new tree. Returns the new tree's id.
   */
  addTree: (opts?: { name?: string; goal?: string }) => string;
  /** Delete a tree: its root, every node in it, and every edge touching them. */
  removeTree: (treeId: string) => void;
  renameTree: (treeId: string, name: string) => void;
  setActiveTree: (treeId: string | null) => void;
  /**
   * Wire a node in one app tree to a node in another: records a cross-tree
   * connection (which two apps, and what data crosses between them).
   *
   * Rejects same-tree pairs (that is an ordinary edge — use Connect & Describe)
   * and duplicate pairs, and reports why in `error` so the UI can show it.
   * The debug method is intentionally non-throwing: it is called from a form.
   */
  connectTrees: (opts: {
    sourceNodeId: string;
    targetNodeId: string;
    payloadType: string;
    payloadDetail?: string;
    description?: string;
  }) => { ok: boolean; error?: string; edgeId?: string };
  /**
   * Load a saved Big Plan Mode design (data/plans/<name>/graph.json) back onto
   * the canvas so the user can keep working on it. Replaces the design, keeps
   * the app's own `master-node` blueprint node, and turns Plan Mode on.
   */
  loadPlanDesign: (plan: {
    projectName: string;
    goal: string;
    nodes: Array<{ id: string; type: string; label: string; description?: string; language?: string; isMaster?: boolean; qa?: PlanQA[] }>;
    edges: Array<{ source: string; target: string; label?: string }>;
  }) => void;
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
  trees: [],
  activeTreeId: null,
  planMode: false,
  planSeedId: null,
  planQuestions: [],
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
  highlightedEdgeId: null,
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
        trees: state.trees,
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
  trees: [],
  activeTreeId: null,
  planMode: false,
  planSeedId: null,
  planQuestions: [],
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
  highlightedEdgeId: null,
  codeReviewResult: null,
  sitePreviewUrl: null,
  previewRequestToken: 0,
  previewRequestGoal: null,
  blueprintRequestToken: 0,
  blueprintRequestGoal: null,
  blueprintRequestPurpose: null,
  blueprintRequestExport: null,
  settingsOpenToken: 0,
  sessionHistoryRequestToken: 0,
  wikiRequestToken: 0,
  todoRequestToken: 0,

  setSitePreviewUrl: (url) => set({ sitePreviewUrl: url }),

  requestPreview: (goal) => set(state => ({ previewRequestToken: state.previewRequestToken + 1, previewRequestGoal: goal || null })),

  requestBlueprintBuild: (goal, purpose, exportRequest) => set(state => ({
    blueprintRequestToken: state.blueprintRequestToken + 1,
    blueprintRequestGoal: goal,
    blueprintRequestPurpose: purpose || null,
    blueprintRequestExport: exportRequest || null,
  })),
  clearBlueprintRequest: () => set({ blueprintRequestToken: 0, blueprintRequestGoal: null, blueprintRequestPurpose: null, blueprintRequestExport: null }),

  requestOpenSettings: () => set(state => ({ settingsOpenToken: state.settingsOpenToken + 1 })),

  requestSessionHistory: () => set(state => ({ sessionHistoryRequestToken: state.sessionHistoryRequestToken + 1 })),

  requestWiki: () => set(state => ({ wikiRequestToken: state.wikiRequestToken + 1 })),

  requestTodo: () => set(state => ({ todoRequestToken: state.todoRequestToken + 1 })),

  setWizardStep: (step) => set({ wizardStep: step }),

  setPlanMode: (on) => set({ planMode: on }),

  setPlanSeedId: (id) => set({ planSeedId: id }),

  setPlanQuestions: (questions) => set({ planQuestions: questions }),

  answerPlanQuestion: (questionId, answer) => set((state) => {
    const question = state.planQuestions.find((q) => q.id === questionId);
    const text = answer.trim();
    if (!question || !text) return {};
    const at = new Date().toISOString();
    const prev = snapshotProject(state as ProjectState);
    const stack = [...state._undoStack, prev].slice(-MAX_HISTORY);

    // The question names its node, so the answer is filed there. A question
    // about the design as a whole (`nodeId: null`) falls back to the seed node:
    // that node IS the app, so a decision about the whole design belongs on it
    // rather than being recorded nowhere.
    const targetId = question.nodeId || state.planSeedId;
    const nodes = targetId
      ? state.nodes.map((n) =>
          n.id === targetId
            ? {
                ...n,
                data: {
                  ...n.data,
                  planQa: [
                    ...((n.data as any)?.planQa || []),
                    { q: question.text, a: text, at } as PlanQA,
                  ],
                },
              }
            : n,
        )
      : state.nodes;

    return {
      nodes,
      planQuestions: state.planQuestions.filter((q) => q.id !== questionId),
      _undoStack: stack,
      _redoStack: [],
      canUndo: true,
      canRedo: false,
      saved: false,
    };
  }),

  dismissPlanQuestion: (questionId) =>
    set((state) => ({
      planQuestions: state.planQuestions.filter((q) => q.id !== questionId),
    })),

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
    const trees = snapshot.trees ?? [];
    return {
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      trees,
      // The active tree has to survive the jump: if the tree it pointed at was
      // undone away, new nodes would be stamped with a tree that no longer
      // exists.
      activeTreeId: trees.some((t) => t.id === state.activeTreeId)
        ? state.activeTreeId
        : trees[0]?.id ?? null,
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
    const trees = snapshot.trees ?? [];
    return {
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      trees,
      activeTreeId: trees.some((t) => t.id === state.activeTreeId)
        ? state.activeTreeId
        : trees[0]?.id ?? null,
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
      nodes: [...state.nodes, withTree(node, state.activeTreeId)],
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
      nodes: [...state.nodes, ...newNodes.map((n) => withTree(n, state.activeTreeId))],
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
    const stamped = newNodes.map((n) => withTree(n, state.activeTreeId));
    return {
      nodes: keptMaster ? [keptMaster, ...stamped] : stamped,
      edges: newEdges,
      targetOS: os,
      _undoStack: stack,
      _redoStack: [],
      canUndo: true,
      canRedo: false,
      saved: false,
    };
  }),

  loadPlanDesign: (plan) => set((state) => {
    const prev = snapshotProject(state as ProjectState);
    const stack = [...state._undoStack, prev].slice(-MAX_HISTORY);

    const validTypes = new Set<string>(NODE_TYPE_OPTIONS.map((o) => o.type));
    const validLangs = new Set<string>(LANGUAGE_OPTIONS.map((o) => o.value));
    const positions = layoutPlanNodes(plan.nodes, plan.edges);
    reserveNodeIds(plan.nodes.map((n) => n.id));

    const nodes: Node[] = plan.nodes.map((n) => ({
      id: n.id,
      type: validTypes.has(n.type) ? n.type : 'logic',
      position: positions.get(n.id) || { x: 120, y: 120 },
      data: {
        label: n.label || n.id,
        description: n.description || '',
        type: (validTypes.has(n.type) ? n.type : 'logic') as NodeType,
        status: 'pending' as NodeStatus,
        ...(n.language && validLangs.has(n.language) ? { language: n.language as CodeLanguage } : {}),
        ...(n.isMaster && n.description ? { appGoal: n.description } : {}),
        // The co-worker's questions and the user's answers were saved with the
        // node, so they must come back with it. Dropping them here would lose
        // the design decisions on reopen — and worse, the next autosave would
        // then write the answers out of graph.json for good.
        ...(n.qa && n.qa.length ? { planQa: n.qa as PlanQA[] } : {}),
      },
    }));

    const edges: Edge[] = plan.edges.map((e, i) => ({
      id: `plan_edge_${i}_${e.source}_${e.target}`,
      source: e.source,
      target: e.target,
      label: e.label,
      data: { label: e.label, semantic: Boolean(e.label) },
    }));

    const keptMaster = state.nodes.find((n) => n.id === 'master-node');
    const seedId = plan.nodes.find((p) => p.isMaster)?.id || null;

    // A plan's nodes belong to the tree being planned (the active one), and a
    // root the plan itself declared is adopted by the tree if it has none yet.
    const planMigrated = migrateTrees(keptMaster ? [keptMaster, ...nodes] : nodes, state.trees);

    return {
      nodes: planMigrated.nodes,
      trees: planMigrated.trees,
      activeTreeId: planMigrated.activeTreeId,
      edges,
      projectName: plan.projectName || state.projectName,
      userGoal: plan.goal || state.userGoal,
      planMode: true,
      planSeedId: seedId,
      targetOS: state.targetOS,
      _undoStack: stack,
      _redoStack: [],
      canUndo: true,
      canRedo: false,
      saved: false,
    };
  }),

  // ── Tree Mode ──

  addTree: (opts) => {
    const before = get();
    const treeId = getNextTreeId();
    const rootId = rootNodeIdFor(treeId);
    // Place the new root's tree to the RIGHT of everything on the canvas so the
    // two app trees read as separate columns (the same side-by-side layout the
    // merge flow uses).
    const maxX = before.nodes.reduce((mx, n) => Math.max(mx, n.position?.x ?? 0), 0);
    const tree: AppTree = {
      id: treeId,
      name: opts?.name?.trim() || `App ${before.trees.length + 1}`,
      goal: opts?.goal || '',
      targetOS: before.targetOS,
      rootNodeId: rootId,
    };
    const rootNode: Node = {
      id: rootId,
      type: 'master',
      position: { x: maxX + 420, y: 0 },
      data: {
        label: tree.name,
        description: '',
        type: 'master' as NodeType,
        status: 'pending' as NodeStatus,
        appGoal: '',
        appPurpose: '',
        selectedOS: before.targetOS,
        treeId,
      },
    };
    set((state) => {
      const prev = snapshotProject(state as ProjectState);
      const stack = [...state._undoStack, prev].slice(-MAX_HISTORY);
      return {
        nodes: [...state.nodes, rootNode],
        trees: [...state.trees, tree],
        activeTreeId: treeId,
        _undoStack: stack,
        _redoStack: [],
        canUndo: true,
        canRedo: false,
        saved: false,
      };
    });
    return treeId;
  },

  removeTree: (treeId) => set((state) => {
    const prev = snapshotProject(state as ProjectState);
    const stack = [...state._undoStack, prev].slice(-MAX_HISTORY);
    const doomed = new Set(
      state.nodes.filter((n) => (n.data as any)?.treeId === treeId).map((n) => n.id),
    );
    // Deleting a node already drops the edges that touch it — same rule here,
    // which also removes every cross-tree connection wired to this app.
    const nodes = state.nodes.filter((n) => !doomed.has(n.id));
    const edges = state.edges.filter((e) => !doomed.has(e.source) && !doomed.has(e.target));
    const trees = state.trees.filter((t) => t.id !== treeId);
    return {
      nodes,
      edges,
      trees,
      activeTreeId: state.activeTreeId === treeId ? trees[0]?.id ?? null : state.activeTreeId,
      selectedNode: state.selectedNode && doomed.has(state.selectedNode) ? null : state.selectedNode,
      codeEditorNodeId:
        state.codeEditorNodeId && doomed.has(state.codeEditorNodeId) ? null : state.codeEditorNodeId,
      _undoStack: stack,
      _redoStack: [],
      canUndo: true,
      canRedo: false,
      saved: false,
    };
  }),

  renameTree: (treeId, name) => set((state) => ({
    trees: state.trees.map((t) => (t.id === treeId ? { ...t, name } : t)),
    nodes: state.nodes.map((n) =>
      // The root node shows its tree's name, so keep the two in step.
      n.id === state.trees.find((t) => t.id === treeId)?.rootNodeId
        ? { ...n, data: { ...n.data, label: name } }
        : n,
    ),
    saved: false,
  })),

  setActiveTree: (treeId) => set({ activeTreeId: treeId }),

  connectTrees: ({ sourceNodeId, targetNodeId, payloadType, payloadDetail, description }) => {
    const state = get();
    const source = state.nodes.find((n) => n.id === sourceNodeId);
    const target = state.nodes.find((n) => n.id === targetNodeId);
    if (!source || !target) return { ok: false, error: 'Pick a node on each side of the connection.' };
    if (sourceNodeId === targetNodeId) return { ok: false, error: 'A node cannot connect to itself.' };

    const sourceTreeId = treeIdOfNode(source, state.trees);
    const targetTreeId = treeIdOfNode(target, state.trees);
    if (!sourceTreeId || !targetTreeId) {
      return { ok: false, error: 'Both nodes must belong to an app tree.' };
    }
    if (sourceTreeId === targetTreeId) {
      return {
        ok: false,
        error: 'Both nodes are in the same app tree — use Connect & Describe for wiring inside one app.',
      };
    }
    if (state.edges.some((e) => e.source === sourceNodeId && e.target === targetNodeId)) {
      return { ok: false, error: 'These two nodes are already connected.' };
    }
    const preset = CROSS_TREE_PAYLOAD_OPTIONS.find((o) => o.value === payloadType);
    if (!preset) return { ok: false, error: 'Choose what data you want to share.' };

    const payloadLabel = preset.value === 'custom' ? 'Custom data' : preset.label;
    const detail = (payloadDetail || '').trim();
    const desc = (description || '').trim();
    const sourceTree = state.trees.find((t) => t.id === sourceTreeId);
    const targetTree = state.trees.find((t) => t.id === targetTreeId);
    const data: CrossTreeConnection = {
      kind: 'cross-tree',
      semantic: true,
      label: payloadLabel,
      relation: desc || `${payloadLabel} flows from ${sourceTree?.name || 'app A'} into ${targetTree?.name || 'app B'}`,
      sourceTreeId,
      targetTreeId,
      payloadType,
      payloadLabel,
      ...(detail ? { payloadDetail: detail } : {}),
      description: desc,
    };
    // addEdge pushes the undo snapshot for us — one write path for graph edits.
    state.addEdge({
      id: `edge_xt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      source: sourceNodeId,
      target: targetNodeId,
      label: payloadLabel,
      data,
    });
    return { ok: true };
  },

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
    treeIdCounter = 0;
    set({ ...DEFAULT_PROJECT_STATE, codeReviewResult: null });
  },

  setLogicEditorOpen: (open) => set({ logicEditorOpen: open }),

  setRoadmapDetached: (detached) => set({ roadmapDetached: detached }),
  setShowCanvasRoadmap: (show) => set({ showCanvasRoadmap: show }),
  setReasoningDetached: (detached) => set({ reasoningDetached: detached }),
  setCodeOutputDetached: (detached) => set({ codeOutputDetached: detached }),
  setCodeReviewResult: (result) => set({ codeReviewResult: result }),
  setCodeEditorNodeId: (id) => set({ codeEditorNodeId: id }),
  highlightEdge: (id) => set({ highlightedEdgeId: id }),

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
      trees: state.trees,
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

    // Normalize into Tree Mode shape: a project saved before Tree Mode (no
    // `trees`, no node `treeId`s) comes back as one tree, so every consumer
    // downstream sees the same shape whether or not the project predates it.
    const migrated = migrateTrees(saved.nodes, (saved as any).trees);

    set({
      projectId: saved.id,
      projectName: saved.name,
      targetOS: saved.targetOS,
      nodes: migrated.nodes,
      edges: saved.edges,
      trees: migrated.trees,
      activeTreeId: migrated.activeTreeId,
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

    // Same normalization as loadProject — an imported file (including one
    // exported before Tree Mode existed) becomes a single tree.
    const migrated = migrateTrees(imported.nodes, (imported as any).trees);

    set({
      projectId: imported.id,
      projectName: imported.name,
      targetOS: imported.targetOS,
      nodes: migrated.nodes,
      edges: imported.edges,
      trees: migrated.trees,
      activeTreeId: migrated.activeTreeId,
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
        trees: state.trees,
        targetOS: state.targetOS,
        projectName: state.projectName,
      });
    }
    const maxId = snapshot.nodes.reduce((max, n) => {
      const m = n.id.match(/node_(\d+)/);
      return m ? Math.max(max, parseInt(m[1]) + 1) : max;
    }, 0);
    nodeIdCounter = maxId;
    // Autosaves written before Tree Mode have no `trees` field — re-derive it
    // rather than restoring a canvas whose nodes claim a tree that is gone.
    const restored = migrateTrees(snapshot.nodes, snapshot.trees);
    set({
      nodes: restored.nodes,
      edges: snapshot.edges,
      trees: restored.trees,
      activeTreeId: restored.activeTreeId,
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
