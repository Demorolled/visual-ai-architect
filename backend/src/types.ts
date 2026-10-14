export type OSType = 'windows' | 'mac' | 'ios' | 'linux' | 'android';
export type LinuxDistro = 'ubuntu' | 'debian' | 'fedora' | 'rhel' | 'arch' | 'alpine';
export type NativeLanguage = 'go' | 'csharp' | 'swift' | 'kotlin' | 'rust' | 'cpp';

/**
 * Full OS target details including distro variants for Linux.
 */
export interface OSDetails {
  os: OSType;
  linuxDistro?: LinuxDistro;
  version?: string;
  /** CPU architecture for native compilation */
  arch?: 'x64' | 'arm64' | 'x86';
}

/**
 * Map an OSType to its recommended native language for code generation.
 */
export function getNativeLanguage(os: OSType, linuxDistro?: LinuxDistro): NativeLanguage {
  switch (os) {
    case 'linux': return 'go';
    case 'windows': return 'csharp';
    case 'mac': return 'swift';
    case 'ios': return 'swift';
    case 'android': return 'kotlin';
  }
}

export type NodeType = 'input' | 'output' | 'logic' | 'api' | 'database' | 'ui' | 'master' | 'ui-functions' | 'gui-layout';

/**
 * Canonical list of FILE node types a plan/scan may assign to a generated
 * file. Excludes the project-root `master` node (not a file). Single source of
 * truth for the planner (`routes/architect.ts`) and the scanner
 * (`routes/scanner.ts`) — previously each redeclared its own list and drifted
 * (scanner silently dropped `gui-layout`).
 */
export const PLAN_NODE_TYPES = ['input', 'output', 'logic', 'api', 'database', 'ui', 'ui-functions', 'gui-layout'] as const;
export type PlanNodeType = (typeof PLAN_NODE_TYPES)[number];

export type NodeStatus = 'pending' | 'generating' | 'valid' | 'error';

/**
 * Program scale tiers (mirrors frontend AppScale and the scale sections in
 * ai/prompts.ts). Stored on the master node's data so per-node code generation
 * can tailor each file to the target program size.
 */
export type AppScale = 'small' | 'medium' | 'large' | 'enterprise';

export interface Node {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: NodeData;
}

export interface NodeData {
  label: string;
  description: string;
  status: NodeStatus;
  language?: string;
  generatedCode?: string;
  error?: string;
  appGoal?: string;
  appPurpose?: string;
  selectedOS?: OSType;
  selectedDistro?: LinuxDistro;
  scale?: AppScale;
  /** Files and resources this node placeholder expands into (e.g. schema.sql, routes.ts, styles.css) */
  resourceFiles?: string[];
  /** Fused blueprint-constraints section (from the blueprint bible) injected into this project's generation prompts */
  blueprintContext?: string;
  /** Per-module contract stub (required exports + legal imports, derived
   *  deterministically from the blueprint wiring graph). Injected into this
   *  module's generation AND repair prompts so the model knows who imports it
   *  and that state must flow through parameters — the fix for the ladder's
   *  #1 failure mode (single-file-mode leakage). */
  contractContext?: string;
  /** When true, FileGenerator skips its internal verified-generation capture —
   *  the blueprint-driven build path captures its own (blueprint-enriched) rows. */
  skipVerifiedCapture?: boolean;
  /** Tree Mode: which app tree this node belongs to (`AppTree.id`). Absent on
   *  projects built before Tree Mode — see utils/treeScope.ts, which derives
   *  membership for those. */
  treeId?: string;
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  /** Optional semantic metadata for user-described connections (merged apps).
   *  Populated by POST /api/merge/connect and consumed by codegen prompts
   *  (fileGenerator) and the export scaffold's dependency-graph.json. */
  data?: {
    label?: string;
    relation?: string;
    codeHint?: string;
    sourceHint?: string;
    targetHint?: string;
    description?: string;
    semantic?: boolean;
    /**
     * Tree Mode: 'cross-tree' marks an edge that crosses an APP boundary — the
     * two endpoints are in different app trees, so it is a data handoff
     * between two separate programs, NOT a file import inside one. See
     * utils/treeScope.ts.
     */
    kind?: 'cross-tree' | string;
    sourceTreeId?: string;
    targetTreeId?: string;
    /** Payload key from the frontend's CROSS_TREE_PAYLOAD_OPTIONS. */
    payloadType?: string;
    /** Human label for `payloadType` (kept so a removed preset still renders). */
    payloadLabel?: string;
    /** Free-text detail the user added about what crosses the boundary. */
    payloadDetail?: string;
  };
}

/**
 * One app tree inside a project (Tree Mode). Mirrors the frontend `AppTree`.
 */
export interface AppTree {
  id: string;
  name: string;
  goal: string;
  purpose?: string;
  targetOS: OSType;
  scale?: AppScale;
  /** Node id of this tree's root (`type: 'master'`), if it has one yet. */
  rootNodeId: string | null;
}

export interface DbNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: NodeData & { subNodes?: SubNodeData[]; subNodeEdges?: Array<{ id: string; source: string; target: string }> };
}

export interface SubNodeData {
  id: string;
  label: string;
  description: string;
  type: NodeType;
  status: NodeStatus;
  language?: string;
  position: { x: number; y: number };
  generatedCode?: string;
  error?: string;
  /** Files and resources this sub-node placeholder expands into */
  resourceFiles?: string[];
}

export interface Project {
  id: string;
  name: string;
  targetOS: OSType;
  nodes: DbNode[];
  edges: Edge[];
  /** Tree Mode: the project's app trees. Absent on pre-Tree-Mode projects,
   *  which are treated as a single tree (one app, as they always were). */
  trees?: AppTree[];
  createdAt: Date;
  updatedAt: Date;
}
