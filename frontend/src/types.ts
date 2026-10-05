export type OSType = 'windows' | 'mac' | 'ios' | 'linux' | 'android';
export type LinuxDistro = 'ubuntu' | 'debian' | 'fedora' | 'rhel' | 'arch' | 'alpine';

/**
 * Full OS target details including distro variants for Linux.
 */
export interface OSDetails {
  os: OSType;
  linuxDistro?: LinuxDistro;
  version?: string;
  arch?: 'x64' | 'arm64' | 'x86';
}

/**
 * Human-readable labels for Linux distros.
 */
export const LINUX_DISTRO_OPTIONS: { value: LinuxDistro | ''; label: string; pkgManager: string; pkgFormat: string }[] = [
  { value: '', label: 'Generic Linux (AppImage/tar.gz)', pkgManager: 'apt', pkgFormat: 'AppImage' },
  { value: 'ubuntu', label: 'Ubuntu', pkgManager: 'apt', pkgFormat: 'deb' },
  { value: 'debian', label: 'Debian', pkgManager: 'apt', pkgFormat: 'deb' },
  { value: 'fedora', label: 'Fedora', pkgManager: 'dnf', pkgFormat: 'rpm' },
  { value: 'rhel', label: 'RHEL / CentOS', pkgManager: 'dnf', pkgFormat: 'rpm' },
  { value: 'arch', label: 'Arch Linux', pkgManager: 'pacman', pkgFormat: 'pkg.tar.zst' },
  { value: 'alpine', label: 'Alpine Linux', pkgManager: 'apk', pkgFormat: 'apk' },
];

/**
 * Map from OS type to its recommended native language for code generation.
 */
export function getNativeLanguage(os: OSType, _linuxDistro?: LinuxDistro): string {
  switch (os) {
    case 'linux': return 'go';
    case 'windows': return 'csharp';
    case 'mac':
    case 'ios': return 'swift';
    case 'android': return 'kotlin';
  }
}

/**
 * Human-readable OS label helper.
 */
export function getOSLabel(os: OSType): string {
  switch (os) {
    case 'windows': return 'Windows';
    case 'mac': return 'macOS';
    case 'ios': return 'iOS';
    case 'linux': return 'Linux';
    case 'android': return 'Android';
  }
}

export type NodeType = 'input' | 'output' | 'logic' | 'api' | 'database' | 'ui' | 'master' | 'ui-functions' | 'gui-layout';

/**
 * Node-type registry: label, icon and one-line description for every type the
 * user can place.
 *
 * This list used to live only inside NodePalette.tsx as a local array, which is
 * why nothing else could offer a type choice — the per-node setup window opened
 * on drop had no way to list types, so the dragged type was simply final. One
 * registry, shared by the palette and NodeSetupDialog.
 *
 * `master` is deliberately absent: it is the protected blueprint node, not a
 * type the user places by hand.
 */
export const NODE_TYPE_OPTIONS: {
  type: NodeType;
  label: string;
  icon: string;
  description: string;
}[] = [
  { type: 'input', label: 'Input', icon: '⬅', description: 'Data entry point' },
  { type: 'output', label: 'Output', icon: '➡', description: 'Result display' },
  { type: 'logic', label: 'Logic', icon: '⚙', description: 'Processing/conditions' },
  { type: 'api', label: 'API', icon: '🌐', description: 'External service call' },
  { type: 'database', label: 'Database', icon: '📦', description: 'Data storage' },
  { type: 'ui', label: 'UI', icon: '🖥', description: 'User interface element' },
  { type: 'ui-functions', label: 'UI Functions', icon: '🎛', description: 'Generates button/control list for the UI canvas' },
  { type: 'gui-layout', label: 'GUI Layout', icon: '⛭', description: 'Imported GUI widget layout' },
];

export type NodeStatus = 'pending' | 'generating' | 'valid' | 'error';

export type CodeLanguage = 'javascript' | 'typescript' | 'python' | 'rust' | 'go' | 'java' | 'csharp' | 'cpp' | 'c' | 'swift' | 'kotlin' | 'php' | 'ruby';

export interface SubNodeData {
  id: string;
  label: string;
  description: string;
  type: NodeType;
  status: NodeStatus;
  language?: CodeLanguage;
  position: { x: number; y: number };
  generatedCode?: string;
  error?: string;
  idTag?: string;
  resourceFiles?: string[];
}

export interface NodeData {
  label: string;
  description: string;
  type: NodeType;
  status: NodeStatus;
  language?: CodeLanguage;
  generatedCode?: string;
  error?: string;
  expanded?: boolean;
  subNodes?: SubNodeData[];
  subNodeEdges?: Array<{ id: string; source: string; target: string }>;
  appGoal?: string;
  appPurpose?: string;
  selectedOS?: OSType;
  selectedDistro?: LinuxDistro;
  scale?: AppScale;
  suggestion?: string;
  suggestionLoading?: boolean;
  idTag?: string;
  resourceFiles?: string[];
  /** File paths this node represents (deep-scan module nodes + file nodes). */
  files?: string[];
  /** True for the small per-file nodes created by a deep scan. */
  isFileNode?: boolean;
  /** True for external dependency/service/sibling-app nodes from a deep scan. */
  external?: boolean;
  /** 'package' | 'service' | 'app' — kind of external node. */
  externalKind?: string;
  /**
   * Big Plan Mode: questions the co-worker asked about THIS node, with the
   * user's answer once they give one. Kept separate from `description` so the
   * user's own words are never overwritten by the co-worker's — the answers
   * are structured data that still reaches the saved plan and the build.
   */
  planQa?: PlanQA[];
  /**
   * Tree Mode: which app tree this node belongs to (`AppTree.id`).
   *
   * A project used to be exactly one app, so membership was implicit — every
   * non-master node belonged to the one master. Tree Mode lets a project hold
   * several app trees side by side, so each node has to say which one it is
   * part of. Absent on legacy nodes; the store's migration stamps it on load.
   */
  treeId?: string;
}

/** One answered question inside Big Plan Mode. */
export interface PlanQA {
  q: string;
  a: string;
  at: string;
}

/**
 * A question the plan co-worker is currently asking.
 *
 * `nodeId` is what makes answers attach: the co-worker names the node it is
 * asking about, and the panel files the user's answer under that node. Null
 * means the question is about the design as a whole.
 */
export interface PlanQuestion {
  id: string;
  text: string;
  nodeId: string | null;
  nodeLabel: string | null;
  at: string;
}

export interface Project {
  id: string;
  name: string;
  targetOS: OSType;
  nodes: NodeData[];
  edges: Array<{ source: string; target: string }>;
  /** Tree Mode: the app trees in this project (see AppTree). */
  trees?: AppTree[];
  createdAt: Date;
  updatedAt: Date;
}

// ── Tree Mode ───────────────────────────────────────────────────────────

/**
 * One app tree inside a project.
 *
 * A tree is a complete app: its own root node (`type: 'master'`), its own goal
 * and target OS, and its own cluster of nodes on the canvas. Several trees can
 * live in one project, laid out side by side, and be wired to each other with
 * cross-tree connections (see CrossTreeConnection).
 *
 * The root is a normal `master`-typed node with a per-tree id rather than the
 * single legacy `'master-node'` literal — that keeps every existing
 * `n.type !== 'master'` filter working unchanged. The first tree keeps the
 * `'master-node'` id so projects saved before Tree Mode still line up.
 */
export interface AppTree {
  id: string;
  name: string;
  /** What this app does — its own statement of intent. */
  goal: string;
  purpose?: string;
  targetOS: OSType;
  scale?: AppScale;
  /** Node id of this tree's root node (`type: 'master'`), if it has one yet. */
  rootNodeId: string | null;
}

/**
 * Preset "what type of data do you want to share" choices offered when wiring
 * two app trees together. `custom` lets the user describe anything else.
 */
export const CROSS_TREE_PAYLOAD_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: 'auth-session', label: 'Authentication / login session', hint: 'The signed-in user and their token' },
  { value: 'user-profile', label: 'User profile', hint: 'Name, avatar, preferences' },
  { value: 'records', label: 'Database records', hint: 'Rows/entities the other app reads' },
  { value: 'api-token', label: 'API key / credentials', hint: 'Lets the other app call this one' },
  { value: 'files', label: 'Files / uploads', hint: 'Documents, images, exports' },
  { value: 'events', label: 'Events / notifications', hint: '"Something happened" signals' },
  { value: 'settings', label: 'Shared settings', hint: 'Theme, locale, feature flags' },
  { value: 'money', label: 'Money / transactions', hint: 'Payments, balances, ledgers' },
  { value: 'custom', label: 'Something else…', hint: 'Describe it in your own words' },
];

/**
 * The `data` payload of an edge that leaves its own app tree.
 *
 * Cross-tree edges are semantic edges (`semantic: true`), so they already get
 * the green wiring-cable rendering, the import dependency in codegen, and the
 * "what to export / what to consume" injection into generation prompts. The
 * extra fields here record WHICH two apps are joined and WHAT data crosses the
 * boundary, which is what the eventual per-tree build needs to generate the
 * bridge module between the two apps.
 */
export interface CrossTreeConnection {
  kind: 'cross-tree';
  semantic: true;
  /** Short display name (the payload label by default). */
  label: string;
  /** One line describing what crosses the boundary. */
  relation: string;
  /** `AppTree.id` the data flows OUT of (the edge's source). */
  sourceTreeId: string;
  /** `AppTree.id` the data flows INTO (the edge's target). */
  targetTreeId: string;
  /** Payload key — one of CROSS_TREE_PAYLOAD_OPTIONS' `value`s. */
  payloadType: string;
  /** Human label for `payloadType` (so a removed preset still renders). */
  payloadLabel: string;
  /** Free-text detail the user added about the payload. */
  payloadDetail?: string;
  /** The raw description the user gave, kept verbatim. */
  description: string;
}

export const LANGUAGE_OPTIONS: { value: CodeLanguage; label: string }[] = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'rust', label: 'Rust' },
  { value: 'go', label: 'Go' },
  { value: 'java', label: 'Java' },
  { value: 'csharp', label: 'C#' },
  { value: 'cpp', label: 'C++' },
  { value: 'c', label: 'C' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
];

export const OS_OPTIONS: { value: OSType; label: string; nativeLang: string; icon: string }[] = [
  { value: 'windows', label: 'Windows', nativeLang: 'C# (.NET)', icon: '🪟' },
  { value: 'mac', label: 'macOS', nativeLang: 'Swift (SwiftUI)', icon: '🍎' },
  { value: 'linux', label: 'Linux', nativeLang: 'Go (native)', icon: '🐧' },
  { value: 'ios', label: 'iOS', nativeLang: 'Swift (SwiftUI)', icon: '📱' },
  { value: 'android', label: 'Android', nativeLang: 'Kotlin (Jetpack)', icon: '🤖' },
];

// ── Program scale (small → enterprise) ──────────────────────────────
// Matches the backend's scale tiers in backend/src/ai/prompts.ts.
// The selected scale is sent as { scale } on architect/plan, plan-code,
// and write-code so the planner plans the right number of files/nodes and
// the writer auto-chunks large builds.
export type AppScale = 'small' | 'medium' | 'large' | 'enterprise';

export const SCALE_OPTIONS: {
  value: AppScale;
  label: string;
  short: string;
  nodes: string;
  hint: string;
  icon: string;
}[] = [
  { value: 'small', label: 'Small', short: 'S', nodes: '4–8 nodes', hint: 'Simple single-purpose app', icon: '🌱' },
  { value: 'medium', label: 'Medium', short: 'M', nodes: '8–14 nodes', hint: 'Standard app with a few features', icon: '⚙️' },
  { value: 'large', label: 'Large', short: 'L', nodes: '25+ nodes', hint: 'Multi-feature program — auto-chunked build', icon: '🏗️' },
  { value: 'enterprise', label: 'Enterprise', short: 'XL', nodes: '50+ nodes', hint: 'Full platform with many services', icon: '🏢' },
];

/**
 * Auto-detect a scale from explicit size words in the request.
 * e.g. "build me a large e-commerce app" → 'large'.
 * Returns null when no size word is present (caller keeps its current pick).
 * For requests that describe many features without a size word, use
 * estimateScaleFromFeatures() as a fallback.
 */
export function detectScaleFromText(text: string): AppScale | null {
  const lower = ` ${text.toLowerCase()} `;
  const has = (words: string[]) => words.some(w => lower.includes(w));
  // Whole-word match so "larger"/"bigger" don't accidentally pick a scale.
  const hasWord = (word: string) => new RegExp(`\\b${word}\\b`, 'i').test(lower);
  if (hasWord('enterprise') || has(['corporate', 'platform-scale', 'platform scale', 'massive'])) return 'enterprise';
  if (hasWord('large') || hasWord('big') || has(['full-scale', 'full scale', 'fullstack'])) return 'large';
  if (hasWord('small') || hasWord('simple') || hasWord('mini') || hasWord('tiny') || hasWord('quick') || hasWord('basic') || hasWord('lite')) return 'small';
  return null;
}

// Feature terms that signal distinct capabilities. The more that appear in a
// request, the larger the program is assumed to be:
//   1 feature → small · 2–4 → medium · 5–9 → large · 10+ → enterprise
// Terms are matched as whole tokens (with simple plural/ing handling) or as
// phrases, so "payments" counts as "payment" but "bloglist" never counts as
// "list" and "I'd like" never counts as a feature.
const FEATURE_TERMS = [
  // users, auth, admin
  'login', 'signup', 'register', 'logout', 'oauth', 'auth', 'profile', 'avatar',
  'role', 'permission', 'admin', 'moderation', 'session',
  // commerce
  'payment', 'checkout', 'cart', 'billing', 'subscription', 'invoice', 'refund',
  'shipping', 'order', 'inventory', 'coupon', 'discount', 'wishlist', 'marketplace',
  'tax', 'pricing', 'wallet', 'transaction', 'ledger', 'transfer', 'deposit', 'withdraw',
  'product', 'review', 'shop', 'shopping', 'store',
  // social ('messaging' and 'direct message' cover the message family — the
  // bare 'message' token is intentionally absent so it never double-counts)
  'feed', 'post', 'comment', 'follow', 'friend', 'group', 'messaging',
  'chat', 'dm', 'notification', 'mention', 'share', 'sharing', 'reaction', 'story',
  'hashtag', 'trend', 'direct message',
  // content & media
  'search', 'searching', 'filter', 'sort', 'recommendation', 'category', 'tag', 'gallery',
  'upload', 'uploading', 'download', 'downloading', 'player', 'playlist', 'stream', 'video', 'audio',
  'thumbnail', 'editor',
  // productivity
  'list', 'todo', 'calendar', 'reminder', 'timer', 'stopwatch', 'deadline', 'priority',
  'drag and drop', 'kanban', 'chart', 'graph', 'report', 'dashboard',
  'analytics', 'export', 'import', 'backup', 'sync', 'autosave', 'undo',
  'redo', 'template', 'plugin', 'extension', 'shortcut', 'task',
  'due date', 'notes',
  // realtime / platform
  'real time', 'websocket', 'socket', 'push', 'queue', 'webhook', 'api',
  'graphql', 'multiplayer', 'leaderboard', 'achievement', 'matchmaking',
  'tournament', 'ranking', 'streaming',
  // misc
  'map', 'location', 'weather', 'localization', 'dark mode', 'theme',
  'widget', 'offline', 'collaboration', 'multi user', 'voice', 'camera',
];

/**
 * Estimate a scale from how many features the request describes.
 * Returns null when the text mentions no recognizable features, so callers
 * can fall back to the user's current manual pick.
 */
export function estimateScaleFromFeatures(text: string): AppScale | null {
  const lower = ` ${text.toLowerCase().replace(/-/g, ' ')} `;
  const words = new Set(lower.split(/[^a-z0-9]+/).filter(Boolean));
  let hits = 0;
  for (const term of FEATURE_TERMS) {
    if (term.includes(' ')) {
      if (lower.includes(term)) hits++;
    } else if (
      // Simple plural handling; -ing forms (messaging, sharing, streaming) are
      // listed as explicit terms since concatenation can't drop the 'e'.
      words.has(term) || words.has(term + 's') || words.has(term + 'es')
    ) {
      hits++;
    }
  }
  if (hits === 0) return null;
  if (hits <= 1) return 'small';
  if (hits <= 4) return 'medium';
  if (hits <= 9) return 'large';
  return 'enterprise';
}

// ── Workflow state types ─────────────────────────────────────────────
export type WizardStep =
  | 'welcome'        // Ask user what they want to build
  | 'searching'      // Searching local designs + open-source
  | 'select-design'  // Show search results to pick from
  | 'building-nodes' // Nodes being created on canvas from design
  | 'filling-nodes'  // User fills in node details / AI fills them
  | 'code-gen'       // Writing code to each node
  | 'sandbox'        // 🧪 Sandbox tester — preview, test, iterate
  | 'review'         // User reviews the generated app
  | 'saving'         // Saving design + generating datasheet
  | 'complete';      // Done

export interface DesignNode {
  id: string;
  type: string;
  label: string;
  description: string;
  language: string;
  position: { x: number; y: number };
}

export interface StoredDesign {
  id: string;
  name: string;
  goal: string;
  purpose: string;
  targetOS: string;
  nodes: DesignNode[];
  edges: Array<{ source: string; target: string }>;
  roadmap: string;
  createdAt: string;
  updatedAt: string;
  source: 'local' | 'imported';
  sourceUrl?: string;
  tags: string[];
}

export interface OpenSourceRepo {
  id: string;
  name: string;
  full_name: string;
  description: string;
  stars: number;
  url: string;
  language: string;
  topics: string[];
  license: string;
}

// ── Language extension conflict detection ──

/**
 * Map from language name to its expected file extension.
 * Must match getFileExtension() in the backend (fileGenerator.ts).
 */
const LANGUAGE_EXTENSIONS: Record<string, string> = {
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  rust: 'rs',
  go: 'go',
  java: 'java',
  csharp: 'cs',
  cpp: 'cpp',
  c: 'c',
  swift: 'swift',
  kotlin: 'kt',
  php: 'php',
  ruby: 'rb',
};

/**
 * Known file extensions that might appear in node labels.
 * Must match KNOWN_EXTENSIONS in the backend (fileGenerator.ts).
 */
const KNOWN_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.rb', '.php',
  '.java', '.kt', '.swift', '.cpp', '.c', '.h', '.cs', '.css',
  '.html', '.scss', '.less', '.sql', '.json', '.xml', '.yaml', '.yml',
  '.md', '.sh', '.bash', '.dockerfile', '.toml', '.cfg', '.ini',
];

/**
 * Get the expected file extension for a given language.
 * Falls back to 'ts' for unknown languages.
 */
export function getLanguageExtension(language: string): string {
  return LANGUAGE_EXTENSIONS[language?.toLowerCase()] || 'ts';
}

/**
 * Check whether a label contains a known file extension at the end.
 * Returns the extension (without dot) if found, or null if no extension detected.
 */
export function extractLabelExtension(label: string): string | null {
  const lower = label.toLowerCase();
  for (const ext of KNOWN_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      return ext.slice(1); // Remove the leading dot
    }
  }
  return null;
}

/**
 * Check if a node's label extension conflicts with its selected language.
 * E.g., label "main.go" with language "rust" returns true (label says .go, language expects .rs).
 * Returns false if the label has no recognizable extension or if they match.
 */
export function hasExtensionConflict(label: string, language: string): boolean {
  const labelExt = extractLabelExtension(label);
  if (!labelExt) return false;
  const langExt = getLanguageExtension(language);
  return labelExt !== langExt;
}
