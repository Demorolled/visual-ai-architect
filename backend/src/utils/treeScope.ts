/**
 * Tree Scope — the app boundary inside one project.
 *
 * Tree Mode lets a project hold several app trees side by side, each one a
 * complete app with its own root, wired to the others by cross-tree connections
 * ("app B consumes app A's login session"). Generation still runs over ONE
 * project graph, so this module is what tells it where one app ends and the
 * next begins:
 *
 *   - which nodes belong to which tree             (resolveTreeScopes)
 *   - which edges are INSIDE a tree vs BETWEEN two (intraEdges / crossTreeLinks)
 *   - what each side must know about the boundary  (buildCrossTreeBoundarySection)
 *   - what the bridge module has to do             (planBridges, buildBridgePrompt)
 *
 * WHY THE BOUNDARY MATTERS: an intra-tree edge is a file import — B.ts imports
 * A.ts. A cross-tree edge is NOT. The two apps are separate programs, so app
 * B's source must never `import` app A's source. Feeding both edge kinds into
 * the dependency graph produced exactly that wrong import; the two apps must
 * talk through the generated bridge module instead.
 *
 * Pure (no I/O, no LLM) and unit-tested; fileGenerator wires it up.
 */

import type { Edge, Project } from '../types.js';

/** One app tree, with the ids of the module nodes that belong to it. */
export interface TreeScope {
  id: string;
  name: string;
  goal: string;
  rootNodeId: string | null;
  /** Ids of this tree's non-root nodes, in project order. */
  nodeIds: string[];
}

/**
 * A data handoff from one app tree to another.
 *
 * `sourceTreeId`/`targetTreeId` are DERIVED from node membership rather than
 * trusted from the edge payload — a stored id can go stale when a node is
 * re-homed, and the membership is what actually decides which app is which.
 */
export interface CrossTreeLink {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceTreeId: string;
  targetTreeId: string;
  /** Payload key ('auth-session', 'records', …) or 'custom'. */
  payloadType: string;
  /** Display label for the payload. */
  payloadLabel: string;
  payloadDetail?: string;
  /** The user's free-text description of the connection. */
  description: string;
  relation: string;
}

export interface ResolvedTrees {
  trees: TreeScope[];
  /** Edges whose endpoints are in the SAME tree — ordinary file imports. */
  intraEdges: Edge[];
  /** Edges whose endpoints are in DIFFERENT trees — app-to-app handoffs. */
  links: CrossTreeLink[];
  /** nodeId → tree id. Roots are included so a root's own tree is resolvable. */
  treeIdByNode: Map<string, string>;
}

/**
 * One bridge module: the integration layer that realizes every handoff sharing
 * a (source app → target app, payload) contract.
 *
 * Grouped rather than one-per-edge on purpose — two modules in app A that both
 * feed app B's "login session" are ONE contract, and generating two bridges for
 * it would give the two apps two competing integration points.
 */
export interface BridgeModule {
  /** Stable group key: `<sourceTree>-><targetTree>:<payloadType>`. */
  key: string;
  /** File base name, e.g. `bridge-auth-session`. */
  name: string;
  sourceTreeId: string;
  targetTreeId: string;
  sourceTreeName: string;
  targetTreeName: string;
  payloadType: string;
  payloadLabel: string;
  /** Every handoff this one module implements. */
  links: CrossTreeLink[];
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() ? v : fallback;
}

/** Slug a label into a safe file-name segment (matches the other generators). */
export function slugify(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'app';
}

/**
 * Resolve a project into its app trees, the edges inside each tree, and the
 * handoffs between trees.
 *
 * A project with no `trees` (everything built before Tree Mode) resolves to a
 * single tree whose root is the master node, and every edge is intra-tree — so
 * callers can use this unconditionally and the single-app path is unchanged.
 */
export function resolveTreeScopes(project: Pick<Project, 'nodes' | 'edges'> & {
  trees?: Project['trees'];
  name?: string;
}): ResolvedTrees {
  const nodes = project.nodes || [];
  const edges = project.edges || [];
  const declared = Array.isArray(project.trees) ? project.trees : [];

  const trees: TreeScope[] = declared.map((t, i) => ({
    id: str((t as any)?.id, `tree_${i + 1}`),
    name: str((t as any)?.name, `App ${i + 1}`),
    goal: str((t as any)?.goal),
    rootNodeId: typeof (t as any)?.rootNodeId === 'string' ? (t as any).rootNodeId : null,
    nodeIds: [],
  }));

  if (trees.length === 0) {
    // Pre-Tree-Mode project: it IS one app. Root it at the master node so the
    // tree has an identity, and hand every module node to it.
    const master = nodes.find((n: any) => n?.type === 'master');
    trees.push({
      id: 'tree_1',
      name: str(project.name, 'App'),
      goal: str((master?.data as any)?.appGoal),
      rootNodeId: (master?.id as string) ?? null,
      nodeIds: [],
    });
  }

  const byId = new Map(trees.map((t) => [t.id, t]));
  const fallbackTreeId = trees[0].id;
  const treeIdByNode = new Map<string, string>();

  // Roots first: a root belongs to the tree that claims it as its root,
  // whatever its own `data.treeId` says (the root IS the tree).
  for (const t of trees) {
    if (t.rootNodeId) treeIdByNode.set(t.rootNodeId, t.id);
  }

  for (const n of nodes) {
    const id = (n as any)?.id;
    if (!id) continue;
    if (treeIdByNode.has(id)) continue; // already claimed as a root
    if ((n as any)?.type === 'master') {
      // An unclaimed second root (e.g. a tree that lost its registration):
      // give it to the first tree with no root rather than dropping it.
      const free = trees.find((t) => !t.rootNodeId);
      if (free) {
        free.rootNodeId = id;
        treeIdByNode.set(id, free.id);
      } else {
        treeIdByNode.set(id, fallbackTreeId);
      }
      continue;
    }
    const own = (n as any)?.data?.treeId;
    const treeId = typeof own === 'string' && byId.has(own) ? own : fallbackTreeId;
    treeIdByNode.set(id, treeId);
    byId.get(treeId)!.nodeIds.push(id);
  }

  const intraEdges: Edge[] = [];
  const links: CrossTreeLink[] = [];
  for (const e of edges) {
    const st = treeIdByNode.get((e as any)?.source);
    const tt = treeIdByNode.get((e as any)?.target);
    // An edge that does not resolve to two DIFFERENT trees is ordinary wiring
    // (or dangling metadata) — leave it exactly as it was.
    if (!st || !tt || st === tt) {
      intraEdges.push(e);
      continue;
    }
    const d: any = (e as any)?.data || {};
    links.push({
      edgeId: str((e as any)?.id, `${(e as any)?.source}->${(e as any)?.target}`),
      sourceNodeId: (e as any).source,
      targetNodeId: (e as any).target,
      sourceTreeId: st,
      targetTreeId: tt,
      payloadType: str(d.payloadType, 'custom'),
      payloadLabel: str(d.payloadLabel, str(d.label, 'Custom data')),
      ...(str(d.payloadDetail) ? { payloadDetail: str(d.payloadDetail) } : {}),
      description: str(d.description),
      relation: str(d.relation),
    });
  }

  return { trees, intraEdges, links, treeIdByNode };
}

/**
 * Group the cross-tree links into the bridge modules that will realize them.
 * Order is stable (first appearance) so a regenerated build produces the same
 * bridge file names.
 */
export function planBridges(resolved: ResolvedTrees): BridgeModule[] {
  const byKey = new Map<string, BridgeModule>();
  const usedNames = new Set<string>();

  for (const link of resolved.links) {
    const key = `${link.sourceTreeId}->${link.targetTreeId}:${link.payloadType}`;
    let bridge = byKey.get(key);
    if (!bridge) {
      const source = resolved.trees.find((t) => t.id === link.sourceTreeId);
      const target = resolved.trees.find((t) => t.id === link.targetTreeId);
      // Name from the payload, not the tree ids: `bridge-auth-session` says
      // what crosses the boundary, `bridge-tree-1-tree-2` does not.
      let name = `bridge-${slugify(link.payloadType === 'custom' ? link.payloadLabel : link.payloadType)}`;
      if (usedNames.has(name)) {
        let i = 2;
        while (usedNames.has(`${name}-${i}`)) i += 1;
        name = `${name}-${i}`;
      }
      usedNames.add(name);
      bridge = {
        key,
        name,
        sourceTreeId: link.sourceTreeId,
        targetTreeId: link.targetTreeId,
        sourceTreeName: source?.name || link.sourceTreeId,
        targetTreeName: target?.name || link.targetTreeId,
        payloadType: link.payloadType,
        payloadLabel: link.payloadLabel,
        links: [],
      };
      byKey.set(key, bridge);
    }
    bridge.links.push(link);
  }

  return [...byKey.values()];
}

/**
 * The section injected into a participating node's generation prompt, telling
 * it about the APP BOUNDARY it sits on.
 *
 * This is deliberately separate from `buildSemanticSection` (which describes
 * wiring inside one app and invites an import): here the other side is a
 * different program, so the instruction is "talk through the bridge", never
 * "import the other file". Returns '' for a node on no boundary, so ordinary
 * builds are unaffected.
 */
export function buildCrossTreeBoundarySection(
  nodeId: string,
  resolved: ResolvedTrees,
  bridges: BridgeModule[] = planBridges(resolved),
): string {
  const lines: string[] = [];

  for (const bridge of bridges) {
    for (const link of bridge.links) {
      const isSource = link.sourceNodeId === nodeId;
      const isTarget = link.targetNodeId === nodeId;
      if (!isSource && !isTarget) continue;
      const detail = link.payloadDetail ? ` — ${link.payloadDetail}` : '';
      if (isSource) {
        lines.push(
          `  • This module SUPPLIES "${bridge.payloadLabel}"${detail} to the app "${bridge.targetTreeName}" (a SEPARATE application in this project).`,
        );
        lines.push(
          `    Export a plain, serializable way to hand that data out, and leave the transport to the bridge module "${bridge.name}".`,
        );
      } else {
        lines.push(
          `  • This module RECEIVES "${bridge.payloadLabel}"${detail} from the app "${bridge.sourceTreeName}" (a SEPARATE application in this project).`,
        );
        lines.push(
          `    Consume it through the bridge module "${bridge.name}" — expect the value as a parameter or a plain data object.`,
        );
      }
      if (link.relation) lines.push(`    Intent: ${link.relation}`);
    }
  }

  if (lines.length === 0) return '';

  return (
    '\n\n━━━ CROSS-APP BOUNDARY (Tree Mode) ━━━\n' +
    'This module sits on the boundary between two SEPARATE applications that are built from this one project. ' +
    'They are different programs: never import the other app\'s source files, and never assume its modules exist in your own tree. ' +
    'Data crosses only through the named bridge module.\n' +
    lines.join('\n') +
    '\nExport/consume PLAIN data (primitives, arrays, plain objects) so the bridge can move it between apps. Do not invent other cross-app connections.'
  );
}

export interface BridgePromptContext {
  bridge: BridgeModule;
  projectName: string;
  targetOS?: string;
  /** The nodes on the giving side, with their purposes. */
  sourceNodes: Array<{ label: string; type?: string; description?: string; language?: string }>;
  /** The nodes on the receiving side, with their purposes. */
  targetNodes: Array<{ label: string; type?: string; description?: string; language?: string }>;
}

/**
 * Build the prompt that generates ONE bridge module — the integration layer for
 * a whole (source app → target app, payload) contract.
 */
export function buildBridgePrompt(ctx: BridgePromptContext): string {
  const { bridge } = ctx;
  const describe = (n: BridgePromptContext['sourceNodes'][number]): string => {
    const bits = [`    - "${n.label}"`];
    if (n.type) bits.push(`(${n.type})`);
    if (n.description) bits.push(`— ${n.description}`);
    return bits.join(' ');
  };

  const handoffs = bridge.links
    .map((l) => `  • ${l.description || l.relation || `${bridge.payloadLabel} handoff`}`)
    .join('\n');

  return `Write ONE small integration module that moves "${bridge.payloadLabel}" from the app "${bridge.sourceTreeName}" into the app "${bridge.targetTreeName}".

PROJECT: ${ctx.projectName}${ctx.targetOS ? ` · TARGET OS: ${ctx.targetOS}` : ''}

The two apps are SEPARATE programs built from one project. They do NOT share source files and cannot import each other. This module is the only integration point between them for this payload.

WHAT CROSSES THE BOUNDARY: ${bridge.payloadLabel}${bridge.links.some((l) => l.payloadDetail) ? ` (${bridge.links.map((l) => l.payloadDetail).filter(Boolean).join('; ')})` : ''}

THE USER DESCRIBED THE CONNECTION AS:
${handoffs || '  (no description given — implement the most sensible handoff for this payload)'}

GIVING SIDE — "${bridge.sourceTreeName}":
${ctx.sourceNodes.length ? ctx.sourceNodes.map(describe).join('\n') : '  (no modules listed)'}

RECEIVING SIDE — "${bridge.targetTreeName}":
${ctx.targetNodes.length ? ctx.targetNodes.map(describe).join('\n') : '  (no modules listed)'}

REQUIREMENTS:
- Define the SHARED DATA SHAPE for "${bridge.payloadLabel}" as an explicit type/interface, and export it — both apps need one agreed shape.
- Export a small, dependency-free API for both directions (e.g. provide/publish on the giving side, read/consume on the receiving side).
- Do NOT import the other app's files. Do NOT import the source app from here.
- Prefer plain data (JSON-serializable) over live object references — the apps may not share an address space.
- Keep it to a single file. No external npm packages.
- If a transport is required, make it injectable (accept a store/transport as a parameter) rather than hardcoding a network call.

Return ONLY the module's raw source code — no markdown fences, no JSON wrapper, no commentary.`;
}

export const BRIDGE_SYSTEM_PROMPT =
  'You are an integration engineer. You write small, dependency-free bridge modules that move data between two separate applications that cannot import each other. ' +
  'The shared data shape must be an explicit exported type. You NEVER import either application\'s source into the bridge. ' +
  'Return ONLY raw code — no markdown fences, no explanations.';

/**
 * Strip whatever wrapper a small model put around the module source: markdown
 * fences, or a JSON object with a `code`/`content` field. Mirrors the raw-code
 * contract the other write paths use.
 */
/** Strip a single surrounding markdown fence, if present. */
function stripFence(s: string): string {
  return s.replace(/^```(?:[a-zA-Z0-9+#-]+)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
}

export function parseBridgeResponse(raw: string): string {
  // Fences come off FIRST: the wrapper may be a fenced JSON object
  // ("```json\n{\"code\": ...}\n```"), and checking for `{` before stripping
  // left the fence in place, so the module shipped wrapped in markdown.
  let text = stripFence(String(raw || '').trim());
  if (!text) return '';

  // JSON wrapper: {"code": "..."} / {"content": "..."}
  if (text.startsWith('{')) {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first !== -1 && last > first) {
      try {
        const obj = JSON.parse(text.slice(first, last + 1));
        const inner = obj?.code ?? obj?.content ?? obj?.source;
        if (typeof inner === 'string' && inner.trim()) text = stripFence(inner.trim());
      } catch {
        // Not JSON after all — keep the (unfenced) text as the module source.
      }
    }
  }

  return text.trim();
}

/** File name for a bridge module, e.g. `bridge-auth-session.ts`. */
export function bridgeFileName(bridge: BridgeModule, language: string): string {
  const ext = language === 'typescript' ? 'ts'
    : language === 'javascript' ? 'js'
      : language === 'python' ? 'py'
        : language === 'go' ? 'go'
          : language === 'rust' ? 'rs'
            : 'ts';
  return `${bridge.name}.${ext}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Export layout
// ═══════════════════════════════════════════════════════════════════════════

/**
 * How a build's files are laid out on disk.
 *
 * A single-app project keeps the flat `src/<module>/<file>` layout it always
 * had (byte-identical exports). A Tree Mode project with several app trees is
 * laid out as SEPARATE APPS — each tree gets its own `apps/<app>/` directory
 * with its own `src/`, entry point and project config — plus one shared
 * `bridge/` directory for the cross-app integration modules. That is the point
 * of Tree Mode: app 2 is a different program, not another module of app 1.
 */
export interface ExportLayoutPlan {
  /** True when each app tree gets its own app directory. */
  separateApps: boolean;
  /** treeId → app directory name under `apps/` (e.g. 'app-1'). */
  appDirByTree: Record<string, string>;
}

/**
 * Plan the on-disk layout for a project's app trees. Pure; the caller supplies
 * the trees (so the layout is derivable from a project, a resolved scope, or a
 * set of generated files).
 */
export function planExportLayout(trees: Array<{ id?: string; name?: string }> = []): ExportLayoutPlan {
  const list = Array.isArray(trees) ? trees : [];
  const appDirByTree: Record<string, string> = {};
  const used = new Set<string>();
  list.forEach((t, i) => {
    const id = str(t?.id, `tree_${i + 1}`);
    // Name the directory after the app ("App 1" → app-1) so the export reads
    // like the canvas; ids are opaque (`tree_1`) and mean nothing to the user.
    let dir = slugify(str(t?.name, `app-${i + 1}`));
    if (used.has(dir)) {
      let n = 2;
      while (used.has(`${dir}-${n}`)) n += 1;
      dir = `${dir}-${n}`;
    }
    used.add(dir);
    appDirByTree[id] = dir;
  });
  return { separateApps: list.length > 1, appDirByTree };
}

/**
 * Project-relative POSIX directory a generated file belongs in.
 *
 * Bridges always live in the shared `bridge/` dir; every other file lives under
 * its app tree's `src/<safeName>/` (or the flat `src/<safeName>/` when the
 * project is a single app). The module directory leaf is computed by the
 * caller because Python uses underscored directory names.
 */
export function exportDirFor(
  file: { isBridge?: boolean; appDir?: string } | null | undefined,
  safeName: string,
): string {
  if (file?.isBridge) return 'bridge';
  const appDir = str(file?.appDir).replace(/^\/+|\/+$/g, '');
  return appDir ? `${appDir}/src/${safeName}` : `src/${safeName}`;
}

/**
 * One "app" as the CHAT plan path sees it: an app tree plus the ids of the
 * PLANNED files that belong to it.
 *
 * The chat path plans from the request text, not the canvas graph, so it has no
 * node→file mapping to inherit. Tree membership is inferred from the planned
 * file PATHS instead (a file under `apps/<dir>/…` belongs to the tree whose
 * app directory is `<dir>`), which keeps the two pipelines' on-disk layouts
 * identical (both use planExportLayout/exportDirFor).
 */
export interface PlannedTree {
  id: string;
  name: string;
  goal: string;
  /** App directory under `apps/` (matches planExportLayout). */
  appDir: string;
  /** Planned file paths assigned to this tree (path membership, not node ids). */
  filePaths: string[];
}

export interface PlannedScope {
  trees: PlannedTree[];
  /** Plan file paths with no tree (flat, single-app). */
  flatFilePaths: string[];
  links: CrossTreeLink[];
  bridges: BridgeModule[];
  /** True when the project is genuinely multi-app (2+ trees). */
  separateApps: boolean;
}

/** Path of the Nth app's directory, e.g. `apps/app-1/…`. */
function appsDirPrefix(appDir: string): string {
  return `apps/${appDir}/`;
}

/**
 * Partition a chat PLAN's files across a project's app trees.
 *
 * The chat path plans ONE flat file list; Tree Mode needs that list split per
 * app so each app exports as its own program (and so cross-app handoffs become
 * bridge modules instead of imports). Assignment is deterministic and reuses
 * the plan's own app directories:
 *   1. a path already under `apps/<dir>/` stays with the tree whose appDir is
 *      `<dir>` (the plan put it there on purpose);
 *   2. otherwise, when the plan has a file matching a tree's ROOT NODE id or a
 *      `<rootId>/` directory prefix, the file joins that tree;
 *   3. any file still unassigned joins the tree matching the plan's root file
 *      (`index.*`/`main.*`/`app.*` at the root) when it is unambiguous, else
 *      the first tree — a flat plan stays flat when there is only one tree.
 *
 * Single-tree projects resolve to one tree and every file is assigned to it,
 * with `separateApps` false — the ordinary flat build is unchanged.
 */
export function partitionPlanByTrees(
  project: Pick<Project, 'nodes' | 'edges'> & { trees?: Project['trees']; name?: string },
  filePaths: string[],
): PlannedScope {
  const resolved = resolveTreeScopes(project);
  const layout = planExportLayout(resolved.trees);
  const dirByTree = layout.appDirByTree;

  const trees: PlannedTree[] = resolved.trees.map((t) => ({
    id: t.id,
    name: t.name,
    goal: t.goal,
    appDir: dirByTree[t.id] ?? slugify(t.name),
    filePaths: [],
  }));
  const byId = new Map(trees.map((t) => [t.id, t]));
  // Reverse lookup: app directory (lowercased) → tree, for path-prefix matching.
  const treeByDir = new Map<string, PlannedTree>();
  for (const t of trees) treeByDir.set(t.appDir.toLowerCase(), t);

  const nodeById = new Map((project.nodes || []).map((n: any) => [n?.id, n]));
  const treeIdOfNode = resolved.treeIdByNode;
  // A file whose top segment is a tree ROOT node id belongs to that tree.
  const rootIdByTree = new Map<string, string>();
  for (const t of resolved.trees) {
    if (t.rootNodeId) rootIdByTree.set(t.id, t.rootNodeId);
  }
  const rootIdToTree = new Map<string, PlannedTree>();
  for (const t of trees) {
    const rid = rootIdByTree.get(t.id);
    if (rid) rootIdToTree.set(rid, t);
    // The tree's own node ids are also usable as directory segments.
    for (const nid of resolved.trees.find((x) => x.id === t.id)?.nodeIds || []) {
      rootIdToTree.set(nid, t);
    }
  }

  const flatFilePaths: string[] = [];
  for (const raw of filePaths) {
    const p = (raw || '').replace(/^\/+/, '');
    if (!p) continue;
    const segs = p.split('/');

    // (1) Already under an app directory the plan itself chose.
    if (segs[0] === 'apps' && segs.length > 2) {
      const t = treeByDir.get(segs[1].toLowerCase());
      if (t) { t.filePaths.push(p); continue; }
    }

    // (2) Rooted at a tree's root node id (`<rootId>/...`) or named after it.
    const owner = rootIdToTree.get(segs[0]) || rootIdToTree.get(segs[0].replace(/\.[a-z0-9]+$/i, ''));
    if (owner) { owner.filePaths.push(p); continue; }

    flatFilePaths.push(p);
  }

  // (3) Unassigned files: a single tree absorbs everything (flat build is
  // unchanged). With several trees, split them evenly so no app is empty — the
  // plan's own ordering already groups related files, and a bridge/root file
  // stays in the first app.
  if (trees.length === 1) {
    trees[0].filePaths.push(...flatFilePaths);
    flatFilePaths.length = 0;
  } else if (flatFilePaths.length > 0) {
    flatFilePaths.forEach((p, i) => {
      trees[i % trees.length].filePaths.push(p);
    });
    flatFilePaths.length = 0;
  }

  const links = resolved.links;
  const bridges = planBridges(resolved);
  return {
    trees,
    flatFilePaths,
    links,
    bridges,
    separateApps: trees.length > 1,
  };
}

/**
 * The section injected into the PLAN prompt when the project is multi-app
 * (Tree Mode). It tells the planner to organise files under per-app `apps/`
 * directories — one program per app — instead of emitting one flat file list,
 * so a chat build matches what the canvas already produces.
 *
 * Empty for a single-tree project, so ordinary plans are unchanged.
 */
export function buildPlanTreeSection(
  project: Pick<Project, 'nodes' | 'edges'> & { trees?: Project['trees']; name?: string },
): string {
  const resolved = resolveTreeScopes(project);
  if (resolved.trees.length <= 1) return '';
  const layout = planExportLayout(resolved.trees);
  const lines: string[] = [];
  for (const t of resolved.trees) {
    const dir = layout.appDirByTree[t.id] ?? slugify(t.name);
    lines.push(`  • App "${t.name}"${t.goal ? ` (${t.goal})` : ''} → put ALL of its files under \`apps/${dir}/\``);
  }
  let bridges = '';
  if (resolved.links.length > 0) {
    const plan = planBridges(resolved);
    bridges = `\nThe project has ${resolved.links.length} cross-app connection(s) → ${plan.length} bridge module(s) (data handoffs, NOT imports):\n` +
      plan.map((b) => `  • "${b.payloadLabel}": ${b.sourceTreeName} → ${b.targetTreeName} (file \`bridge/${b.name}.*\`)`).join('\n') +
      `\nThe two apps are SEPARATE programs and must never import each other's source. Data crosses only through the bridge module.`;
  }
  return `\n\n━━━ TREE MODE — THIS PROJECT HAS ${resolved.trees.length} SEPARATE APPS (MANDATORY) ━━━\n` +
    `This project holds several app trees. Plan ONE program per app, each under its own \`apps/<app-dir>/\` folder, instead of one flat file list:\n` +
    lines.join('\n') +
    bridges;
}
