/**
 * Blueprint Bible — the embedded "code bible" from the blueprint-constrained
 * app-building architecture (see the design doc: app_type / target_stack /
 * architecture_checklist / wiring_graph JSON files).
 *
 * Responsibilities:
 *   1. Load the bible JSON files from backend/blueprints/*.json (cached, TTL).
 *   2. Match a user's natural-language goal to the closest blueprint using the
 *      SAME deterministic hashing-trick embeddings as ai/semanticRetrieval.ts
 *      (reused: embed() + cosineSimilarity()), so ranking is stable and needs
 *      no LLM call.
 *   3. Translate a blueprint into a VACA Project (master node + one node per
 *      checklist module + edges from the wiring graph) that the existing
 *      FileGenerator can run, and build the fused "blueprint constraints"
 *      prompt section that gets injected into every per-node generation prompt.
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { embed, cosineSimilarity, EMBED_DIM } from '../ai/semanticRetrieval.js';
import { AppScale, DbNode, Edge, NodeType, OSType, Project } from '../types.js';

// backend/src/blueprint → backend/blueprints
const BLUEPRINTS_DIR = path.resolve(import.meta.dirname, '..', '..', 'blueprints');

// ─── Types ─────────────────────────────────────────────────────────────────

export interface BlueprintTargetStack {
  frontend: string;
  backend: string;
  database: string;
}

export interface BlueprintWiring {
  source_module: string;
  destination_module: string;
  data_passed: string;
}

export interface Blueprint {
  app_type: string;
  description: string;
  keywords: string[];
  target_stack: BlueprintTargetStack;
  architecture_checklist: string[];
  wiring_graph: BlueprintWiring[];
}

export interface BlueprintMatch {
  blueprint: Blueprint;
  score: number;
  /** Raw embedding similarity before the lexical bonus (used for tie-breaking). */
  cosine?: number;
}

export interface BlueprintBuildOptions {
  goal: string;
  purpose?: string;
  targetOS?: OSType;
  language?: string;
  scale?: AppScale;
}

// ─── Loading (cached, TTL) ────────────────────────────────────────────────

let cachedBlueprints: Blueprint[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000;

/** Load every bible JSON file. Never throws — empty array when missing. */
export function loadBlueprints(): Blueprint[] {
  const now = Date.now();
  if (cachedBlueprints !== null && now - cachedAt < CACHE_TTL_MS) return cachedBlueprints;

  if (!fs.existsSync(BLUEPRINTS_DIR)) {
    console.warn('[bible] Blueprint directory not found:', BLUEPRINTS_DIR);
    cachedBlueprints = [];
    cachedAt = now;
    return cachedBlueprints;
  }

  const blueprints: Blueprint[] = [];
  // Recursive scan: curated blueprints live at the top level, script-generated
  // ones (scripts/build-blueprint-bible.py) live in subdirectories like
  // generated/. Node's { recursive: true } returns paths relative to the dir.
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(BLUEPRINTS_DIR, { recursive: true }) as string[];
  } catch (err) {
    console.warn('[bible] Failed to scan blueprint directory:', err);
  }
  for (const entry of entries.sort()) {
    if (typeof entry !== 'string' || !entry.endsWith('.json')) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(BLUEPRINTS_DIR, entry), 'utf-8'));
      if (raw && typeof raw.app_type === 'string' && Array.isArray(raw.architecture_checklist)) {
        // Duplicate module labels would collide into the same node label / file
        // name via labelToFileName — dedupe defensively so bad bible files
        // cannot silently produce overlapping files.
        const seen = new Set<string>();
        raw.architecture_checklist = raw.architecture_checklist.filter((m: unknown) => {
          if (typeof m !== 'string' || seen.has(m)) {
            console.warn(`[bible] ${raw.app_type}: dropping duplicate/invalid checklist entry`, m);
            return false;
          }
          seen.add(m);
          return true;
        });
        blueprints.push(raw as Blueprint);
      } else {
        console.warn(`[bible] Skipping malformed blueprint ${entry}`);
      }
    } catch (err) {
      console.warn(`[bible] Failed to parse ${entry}:`, err);
    }
  }

  cachedBlueprints = blueprints;
  cachedAt = now;
  return blueprints;
}

export function getBlueprintByType(appType: string): Blueprint | undefined {
  return loadBlueprints().find(b => b.app_type === appType);
}

// ─── Semantic matching (reuses semanticRetrieval embeddings) ──────────────

/** Deterministic bag-of-words text for a blueprint, fed to the shared embed(). */
function blueprintText(bp: Blueprint): string {
  return [
    bp.app_type,
    bp.description,
    ...(bp.keywords || []),
    ...(bp.architecture_checklist || []),
  ].join(' ');
}

/** Score bonus per exact lexical hit (goal token ∈ blueprint app_type/keywords). */
const LEXICAL_HIT_BONUS = 0.35;
/** Cap the lexical bonus at two hits so more hits never saturate the score. */
const MAX_LEXICAL_HITS = 2;

/**
 * Count how many of the goal's tokens hit a blueprint's EXACT vocabulary
 * (app_type + keywords), prefix-matched so "recipes" hits "recipe" and
 * "searching" hits "search". A hit means the goal is explicitly about this
 * blueprint's domain — worth preferring over weak embedding noise. Short
 * tokens (< 4 chars, e.g. "app") are ignored so common words never pollute.
 */
export function lexicalHitCount(goal: string, bp: Blueprint): number {
  const goalTokens = (goal || '').toLowerCase().match(/[a-z][a-z0-9]{3,}/g) || [];
  const vocab = new Set(
    [bp.app_type, ...(bp.keywords || [])]
      .join(' ')
      .toLowerCase()
      .match(/[a-z][a-z0-9]*/g) || []
  );
  let hits = 0;
  for (const t of goalTokens) {
    for (const v of vocab) {
      if (v.length >= 4 && (v.startsWith(t) || t.startsWith(v))) {
        hits++;
        break;
      }
    }
  }
  return hits;
}

/**
 * Rank blueprints against a natural-language goal: cosine similarity (the SAME
 * primitives as ai/semanticRetrieval.ts) PLUS an exact-vocabulary bonus.
 *
 * The hashing-trick embeddings under-score some domains badly — a "recipe
 * manager" goal ranks recipe_manager BELOW unrelated playgrounds (its cosine
 * never enters the top-6). A blueprint whose own app_type/keywords name the
 * goal's topic therefore gets a lexical bonus that lifts it above embedding
 * noise, so an exact hit like "recipes" → recipe_manager wins the ranking.
 *
 * The floor (minScore) applies to the BOOSTED score — callers (e.g. the
 * /api/blueprint/build route) pass their threshold here so weak embedding
 * noise is rejected entirely and falls back to the generic blueprint.
 * Known trade-off: a goal token shared by many blueprints ("search",
 * "data") lifts several of them into the lower candidate slots — they never
 * win over a domain hit, but the candidate list gets noisier.
 * Returns [] when nothing clears the floor.
 */
export function matchBlueprint(goal: string, k: number = 3, minScore: number = 0.01): BlueprintMatch[] {
  const blueprints = loadBlueprints();
  if (blueprints.length === 0) return [];

  const qv = embed(goal || '', EMBED_DIM);
  // Rank by the RAW cosine + lexical-bonus sum; the exposed score is clamped
  // at 1.0 only for display. Clamping BEFORE sorting would erase sum
  // differences at saturation and could invert two strong matches (e.g.
  // cosine 0.9+1 hit vs cosine 0.7+2 hits would wrongly tie at 1.0).
  const ranked = blueprints
    .map(bp => {
      const cosine = cosineSimilarity(qv, embed(blueprintText(bp), EMBED_DIM));
      const raw = cosine + Math.min(lexicalHitCount(goal || '', bp), MAX_LEXICAL_HITS) * LEXICAL_HIT_BONUS;
      return { blueprint: bp, cosine, raw };
    })
    .filter(m => m.raw >= minScore)
    .sort((a, b) => b.raw - a.raw || (b.cosine ?? 0) - (a.cosine ?? 0))
    .slice(0, k);
  return ranked.map(m => ({ blueprint: m.blueprint, score: Math.min(1, m.raw), cosine: m.cosine }));
}

// ─── Blueprint → Project translation ──────────────────────────────────────

/** Derive a single source language from the blueprint's target stack. */
export function detectLanguage(stack: BlueprintTargetStack, override?: string): string {
  if (override) return override;
  const s = `${stack.frontend} ${stack.backend} ${stack.database}`.toLowerCase();
  if (/\bgo\b|golang/.test(s)) return 'go';
  if (/\bpython\b|django|flask/.test(s)) return 'python';
  if (/\bc#\b|csharp|\.net/.test(s)) return 'csharp';
  if (/\brust\b/.test(s)) return 'rust';
  if (/\bkotlin\b/.test(s)) return 'kotlin';
  if (/\bswift\b/.test(s)) return 'swift';
  return 'typescript'; // React + Node + friends
}

/**
 * Guess the VACA node type for a checklist module from its name, so the
 * generated node lands in the right FileGenerator lane (ui/database/api/...).
 */
export function moduleNodeType(moduleName: string): NodeType {
  const n = moduleName.toLowerCase();
  if (/(ui|screen|view|page|frontend|layout|component|widget|interface|renderer)/.test(n)) return 'ui';
  if (/(database|db|storage|store|sql|repository|model|schema|persistence|cache|indexer)/.test(n)) return 'database';
  if (/(api|server|endpoint|service|gateway|auth|session|sync|backend|websocket|webhook|notification|email|payment|streaming)/.test(n)) return 'api';
  if (/(input|controller|command|parser|handler|queue|worker|processor|listener)/.test(n)) return 'input';
  if (/(output|export|report|display|publish|notify|broadcast)/.test(n)) return 'output';
  return 'logic';
}

/** Human description for a checklist module, informed by its wiring contracts. */
function moduleDescription(moduleName: string, blueprint: Blueprint, wiring: BlueprintWiring[]): string {
  const contracts = wiring
    .filter(w => w.source_module === moduleName || w.destination_module === moduleName)
    .map(w => `${w.source_module} → ${w.destination_module} (${w.data_passed})`);
  const contractLine = contracts.length
    ? ` Data contracts: ${contracts.join('; ')}.`
    : '';
  return `Module "${moduleName}" of a ${blueprint.app_type} app. Implement this module's responsibility end-to-end — the rest of the app's modules are separate files.${contractLine}`;
}

/**
 * Repair architecturally-impossible wiring before it becomes project edges.
 *
 * Edge semantics in VACA are "A → B means B depends on A". Script-generated
 * bible wiring is sometimes a REVERSED linear chain (e.g. `ui_screens →
 * core_engine → input_handler → …`), which would make the database depend on
 * the input handler and the engine depend on the UI — the exact cross-file
 * nonsense observed in live builds. This pass:
 *   - reverses edges whose SOURCE is a UI module and whose DESTINATION is not
 *     (UI modules consume from logic/data/api; the reverse order is a bug)
 *   - drops edges that would create a cycle (generation requires a DAG so
 *     nodes can be topologically ordered)
 * Warnings are logged so bad bible data stays visible during development.
 */
export interface DanglingEdgeReport {
  /** Edge entries whose source or target module is not a known node */
  dangling: Array<{ source_module: string; destination_module: string; data_passed?: string }>;
  /** The edges that survived (both endpoints resolve to known nodes) */
  kept: BlueprintWiring[];
}

/**
 * Referential-integrity gate for wiring/edges: every edge's source AND target
 * must resolve to a known module (node label). Dangling edges — an edge whose
 * endpoint names a module that does not exist — are the blueprint analog of a
 * TS2307 import: they reference a node that will never be created. Returns the
 * dangling entries plus the kept set, so callers can drop-and-warn (build path)
 * or score the probe against the count (claims audit).
 */
export function validateEdgesReferentialIntegrity(
  wiring: BlueprintWiring[],
  knownModules: string[]
): DanglingEdgeReport {
  // Drop empty/blank entries: an empty string in the checklist must never make
  // an edge with a missing source/destination module look "known".
  const known = new Set(knownModules.map(m => m.trim()).filter(Boolean));
  const dangling: DanglingEdgeReport['dangling'] = [];
  const kept: BlueprintWiring[] = [];
  for (const w of wiring || []) {
    const src = (w.source_module || '').trim();
    const dst = (w.destination_module || '').trim();
    if (!known.has(src) || !known.has(dst)) {
      dangling.push({ source_module: src, destination_module: dst, data_passed: w.data_passed });
    } else {
      kept.push(w);
    }
  }
  return { dangling, kept };
}

export function sanitizeWiring(wiring: BlueprintWiring[], appType: string): BlueprintWiring[] {
  const out: BlueprintWiring[] = [];
  // dependents[m] = modules that depend on m (edge m→d means d depends on m).
  const dependents = new Map<string, Set<string>>();
  const pathExists = (from: string, to: string): boolean => {
    const stack = [from];
    const seen = new Set<string>();
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === to) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const dep of dependents.get(cur) || []) stack.push(dep);
    }
    return false;
  };

  for (const w of wiring) {
    let src = w.source_module;
    let dst = w.destination_module;
    if (src === dst) continue;
    // 1) Drop raw cycles FIRST (mutual/duplicate edges like A→B and B→A).
    if (pathExists(dst, src)) {
      console.warn(`[bible] ${appType}: dropping cycle-forming wiring ${src} → ${dst}`);
      continue;
    }
    // 2) Fix UI direction: a UI module must consume from logic/data/api, never
    //    be an upstream dependency of it.
    const srcType = moduleNodeType(src);
    const dstType = moduleNodeType(dst);
    if (srcType === 'ui' && dstType !== 'ui') {
      console.warn(
        `[bible] ${appType}: reversing UI-backwards wiring ${src} → ${dst} (UI modules consume from logic/data, never the reverse)`
      );
      [src, dst] = [dst, src];
    }
    if (src === dst) continue;
    // 3) Re-check after reversal (rare: a ui→backend path already exists).
    if (pathExists(dst, src)) {
      console.warn(`[bible] ${appType}: dropping cycle-forming wiring ${src} → ${dst}`);
      continue;
    }
    if (!dependents.has(src)) dependents.set(src, new Set());
    dependents.get(src)!.add(dst);
    out.push({ source_module: src, destination_module: dst, data_passed: w.data_passed });
  }
  return out;
}

/**
 * Build the fused "blueprint constraints" section (the doc's Step 4 prompt
 * template) that is stored on the master node and injected into every
 * per-node generation prompt by FileGenerator. `wiring` defaults to the raw
 * blueprint wiring; blueprintToProject passes the sanitized version so the
 * model sees the corrected data contracts.
 */
export function buildBlueprintContext(blueprint: Blueprint, language: string, wiring?: BlueprintWiring[]): string {
  const wire = wiring ?? blueprint.wiring_graph;
  const lines: string[] = [];
  lines.push(`APP TYPE: ${blueprint.app_type}`);
  lines.push(`APP DESCRIPTION: ${blueprint.description}`);
  lines.push(
    `TARGET STACK: frontend=${blueprint.target_stack.frontend}, backend=${blueprint.target_stack.backend}, database=${blueprint.target_stack.database}`
  );
  lines.push(`SOURCE LANGUAGE: ${language}`);
  lines.push('');
  lines.push('ARCHITECTURE CHECKLIST (the whole app is exactly these modules, each implemented in its own file):');
  for (const mod of blueprint.architecture_checklist) lines.push(`  - ${mod}`);
  lines.push('');
  lines.push('WIRING GRAPH (data contracts between sibling modules — use these names verbatim so files connect):');
  for (const w of wire) {
    lines.push(`  - ${w.source_module} → ${w.destination_module} : ${w.data_passed}`);
  }
  lines.push('');
  lines.push('RULE: You are generating ONE module of this app. Implement exactly the module named in THIS FILE\'S MODULE below.');
  lines.push('Do NOT implement other checklist modules — they are separate files. Do NOT invent new modules.');
  return lines.join('\n');
}

/**
 * Translate a blueprint + user request into a VACA Project:
 *   - one master node (holds goal/purpose/OS/scale/language + blueprintContext)
 *   - one node per architecture_checklist module
 *   - one edge per wiring_graph entry (source_module → destination_module)
 */
export function blueprintToProject(
  blueprint: Blueprint,
  opts: BlueprintBuildOptions
): Project {
  const language = detectLanguage(blueprint.target_stack, opts.language);
  const targetOS: OSType = opts.targetOS || 'linux';
  const scale: AppScale = opts.scale || 'medium';
  // Sanitize the wiring FIRST so node descriptions, the fused prompt text and
  // the edges all agree on the corrected data contracts.
  const wiring = sanitizeWiring(blueprint.wiring_graph, blueprint.app_type);
  const blueprintContext = buildBlueprintContext(blueprint, language, wiring);

  const nodes: DbNode[] = [];
  const edges: Edge[] = [];

  // Master node — the FileGenerator reads goal/purpose/OS/scale from here.
  nodes.push({
    id: 'master',
    type: 'master',
    position: { x: 0, y: 0 },
    data: {
      label: `${blueprint.app_type} blueprint`,
      description: opts.goal,
      status: 'pending',
      language,
      appGoal: opts.goal,
      appPurpose: opts.purpose || blueprint.description,
      selectedOS: targetOS,
      scale,
      blueprintContext,
      // Blueprint builds capture their own blueprint-enriched verified rows in
      // the /api/blueprint/build route (see verifiedGenerationCapture.ts); the
      // generic FileGenerator capture is skipped so each build yields exactly
      // one set of rows.
      skipVerifiedCapture: true,
    },
  });

  // One node per checklist module, laid out on a grid.
  blueprint.architecture_checklist.forEach((moduleName, i) => {
    const id = `mod_${i}`;
    nodes.push({
      id,
      type: moduleNodeType(moduleName),
      position: { x: 60 + (i % 3) * 320, y: 120 + Math.floor(i / 3) * 220 },
      data: {
        label: moduleName,
        description: moduleDescription(moduleName, blueprint, wiring),
        status: 'pending',
        language,
      },
    });
  });

  // One edge per (sanitized) wiring contract — referential-integrity gate:
  // an edge whose source/target names a module that is not in the checklist is
  // a dangling edge and is dropped (with a warning) instead of silently
  // producing a project edge pointing at a node that does not exist.
  const knownModules = blueprint.architecture_checklist.map(m => m.trim());
  const edgeReport = validateEdgesReferentialIntegrity(wiring, knownModules);
  for (const w of edgeReport.dangling) {
    console.warn(
      `[bible] ${blueprint.app_type}: dangling wiring ${w.source_module} → ${w.destination_module} references an unknown module — edge dropped`
    );
  }
  edgeReport.kept.forEach((w, i) => {
    const src = nodes.find(n => n.data.label === w.source_module);
    const dst = nodes.find(n => n.data.label === w.destination_module);
    if (src && dst) {
      edges.push({ id: `edge_${i}`, source: src.id, target: dst.id });
    }
  });

  return {
    id: uuidv4(),
    name: opts.goal.slice(0, 60) || blueprint.app_type,
    targetOS,
    nodes,
    edges,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
