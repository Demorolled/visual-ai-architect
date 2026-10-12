/**
 * scaffoldExperiment — the scaffold self-improvement LOOP.
 *
 * Direction (2026-10-03): VACA builds the scaffold; the LLM fills in the code.
 * So the thing worth improving is the SCAFFOLD (a blueprint's architecture
 * checklist + wiring graph). This module runs ONE experiment:
 *
 *   incumbent = build(blueprint)              ← today's scaffold
 *   for each variant in generateVariants(bp):  ← mutated scaffolds
 *       score = build(variant)                 ← generate + gate + score
 *   winner = best variant that beats incumbent by a margin
 *
 * The LLM is NOT the scaffolder here — it only FILLS the files, so scoring a
 * variant measures the scaffold, not the model. (The model's own contribution
 * shows up as adherence/noise, which the margin absorbs.)
 *
 * `build` is injected so the whole search is testable without a compiler, a
 * browser, or a model: the idle service passes the real blueprint→FileGenerator
 * pipeline, tests pass a stub. No LLM, no disk in this module.
 */

import type { Blueprint } from '../blueprint/bible.js';
import {
  generateVariants,
  scoreVariant,
  scoreFilesAdherence,
  isImprovement,
  describeScoredVariant,
  type ScaffoldVariant,
  type ScoredVariant,
  type VariantMetrics,
} from './scaffoldVariation.js';

/** The three-valued smoke status shared with buildVerification (kept local so
 *  this module has no runtime dependency on the sandbox). */
export type SmokeStatusLite = 'passed' | 'failed' | 'skipped' | 'unavailable';

/** What a build of one scaffold produced, in the terms the scorer needs. */
export interface ScaffoldBuildOutcome {
  /** The generated files for this scaffold (label + code). */
  files: Array<{ path: string; content: string; nodeLabel?: string }>;
  /** The whole-project verdict (tsc + language gates + smoke + no stubs). */
  tsCompileClean: boolean;
  renderSmoke: SmokeStatusLite;
  cliSmoke: SmokeStatusLite;
  contractViolations: number;
  /** Planned modules that produced no file. */
  driftMissing: number;
  /** Generated files matching no planned module. */
  driftUnexpected: number;
}

/** Generate + gate a scaffold. Injected: real pipeline in the service, stub in tests. */
export type ScaffoldBuilder = (bp: Blueprint) => Promise<ScaffoldBuildOutcome>;

export interface ScaffoldExperimentResult {
  ok: boolean;
  appType: string;
  /** The unmutated scaffold, measured. */
  incumbent: ScoredVariant;
  /** Every proposed variant, measured (only valid, buildable ones are `ok`). */
  variants: ScoredVariant[];
  /** The best variant that beat the incumbent by the margin — else null. */
  winner: ScoredVariant | null;
  /** True when `winner` is set (the scaffold should be adopted). */
  adopted: boolean;
  error?: string;
}

export interface RunScaffoldExperimentOptions {
  blueprint: Blueprint;
  build: ScaffoldBuilder;
  /** Improvement margin (score units). Guards against the build noise band. */
  margin?: number;
  /** Cap on proposed variants (default 6). */
  maxVariants?: number;
  /** Domain names proposed for split/leaf variants (from a name table or the LLM). */
  proposedNames?: string[];
  /** Optional progress logger. */
  log?: (msg: string) => void;
}

/** Turn a build outcome into the scorer's metric shape. */
export function metricsFromOutcome(outcome: ScaffoldBuildOutcome | null): VariantMetrics | null {
  if (!outcome) return null;
  const adherence = scoreFilesAdherence(outcome.files);
  return {
    tscClean: !!outcome.tsCompileClean,
    smokePassed: outcome.renderSmoke !== 'failed' && outcome.cliSmoke !== 'failed',
    adherence: adherence.score,
    fullyAdherent: adherence.fullyAdherent,
    driftMissing: outcome.driftMissing,
    driftUnexpected: outcome.driftUnexpected,
    contractViolations: outcome.contractViolations,
    fileCount: outcome.files.length,
  };
}

function measureVariant(variant: ScaffoldVariant, outcome: ScaffoldBuildOutcome | null): ScoredVariant {
  const metrics = metricsFromOutcome(outcome);
  const ok = !!metrics && metrics.fileCount > 0;
  return { ...variant, metrics, score: ok ? scoreVariant(metrics) : 0, ok };
}

/**
 * Run one scaffold experiment. Builds the incumbent, then every variant, and
 * returns the best variant ONLY if it beats the incumbent by `margin` (default
 * 0.25). Everything is bounded and best-effort: a variant whose build throws is
 * recorded as `ok:false` and cannot win.
 */
export async function runScaffoldExperiment(
  opts: RunScaffoldExperimentOptions,
): Promise<ScaffoldExperimentResult> {
  const { blueprint, build } = opts;
  const margin = opts.margin ?? 0.25;
  const log = opts.log ?? (() => {});
  const result: ScaffoldExperimentResult = {
    ok: false, appType: blueprint.app_type, incumbent: null as unknown as ScoredVariant,
    variants: [], winner: null, adopted: false,
  };

  const safeBuild = async (bp: Blueprint): Promise<ScaffoldBuildOutcome | null> => {
    try {
      return await build(bp);
    } catch (err: any) {
      log(`[scaffold-experiment] build threw: ${err?.message || err}`);
      return null;
    }
  };

  const incumbentOutcome = await safeBuild(blueprint);
  const incumbent = measureVariant(
    { id: 'incumbent', op: 'add_wiring', rationale: 'unchanged scaffold', blueprint },
    incumbentOutcome,
  );
  result.incumbent = incumbent;
  log(`[scaffold-experiment] ${blueprint.app_type} incumbent: ${describeScoredVariant(incumbent)}`);

  const proposed = generateVariants(blueprint, {
    max: opts.maxVariants ?? 6,
    proposedNames: opts.proposedNames,
  });
  log(`[scaffold-experiment] ${proposed.length} variant(s) proposed`);

  for (const variant of proposed) {
    const outcome = await safeBuild(variant.blueprint);
    const scored = measureVariant(variant, outcome);
    result.variants.push(scored);
    log(`[scaffold-experiment]   ${variant.op}: ${describeScoredVariant(scored)}`);
  }

  // Winner = best scoring variant that beats the incumbent by the margin.
  const buildable = result.variants.filter((v) => v.ok);
  const best = buildable.sort((a, b) => b.score - a.score)[0] || null;
  if (best && isImprovement(best, incumbent, margin)) {
    result.winner = best;
    result.adopted = true;
    result.ok = true;
    log(`[scaffold-experiment] ADOPT ${best.id} (${best.score} vs ${incumbent.score})`);
  } else {
    result.ok = true; // the experiment ran; it just found no improvement
    log(`[scaffold-experiment] keep incumbent (best variant ${best ? best.score : 'n/a'} vs ${incumbent.score})`);
  }
  return result;
}

// Re-export the pieces callers usually need alongside the loop.
export { generateVariants, scoreVariant, isImprovement, describeScoredVariant } from './scaffoldVariation.js';
export type { ScaffoldVariant, ScoredVariant, VariantMetrics } from './scaffoldVariation.js';
