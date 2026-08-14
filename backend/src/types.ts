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
  /** When true, FileGenerator skips its internal verified-generation capture —
   *  the blueprint-driven build path captures its own (blueprint-enriched) rows. */
  skipVerifiedCapture?: boolean;
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
  };
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
  createdAt: Date;
  updatedAt: Date;
}
