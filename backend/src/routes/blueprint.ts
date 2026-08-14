import { Router, Request, Response } from "express";
import {
  suggestForBlueprint,
  suggestForNode,
} from "../blueprint/suggester.js";
import { getSearchService } from "../search/webSearch.js";
import {
  getBlueprintByType,
  matchBlueprint,
  blueprintToProject,
  loadBlueprints,
  type BlueprintMatch,
} from "../blueprint/bible.js";
import { projects } from "../db/projects.js";
import { FileGenerator, type GenerationProgressCallback } from "../layers/fileGenerator.js";
import { broadcastGenerationProgress } from "../socket/socketManager.js";
import { captureVerifiedGeneration, type CaptureResult } from "../training/verifiedGenerationCapture.js";
import { buildGuiMockupHtml, renderGuiMockupToPng, compareModulesToFiles } from "../blueprint/mockup.js";

const router = Router();
const fileGenerator = new FileGenerator();

/**
 * Shared blueprint-resolution used by BOTH /build and /mockup so the two
 * routes can never drift apart on which blueprint a goal matches. Mirrors the
 * exact semantics of /build's inline matching: explicit appType wins, then
 * semantic (with the 0.30 floor), then the generic fallback.
 */
function resolveBlueprint(body: any): {
  matched?: BlueprintMatch;
  matchedBy?: "explicit" | "semantic" | "fallback";
  candidates?: BlueprintMatch[];
  error?: { status: number; body: any };
} {
  const { goal, appType } = body || {};
  const LOW_SCORE_THRESHOLD = 0.30;
  const candidates = matchBlueprint(goal.trim(), 5, LOW_SCORE_THRESHOLD);
  let matched: BlueprintMatch | undefined;
  let matchedBy: "explicit" | "semantic" | "fallback" = "semantic";

  if (typeof appType === "string" && appType.trim()) {
    const bp = getBlueprintByType(appType.trim());
    if (bp) {
      matched = { blueprint: bp, score: 1 };
      matchedBy = "explicit";
    } else {
      return {
        error: { status: 404, body: { error: `No blueprint of type '${appType}'`, available: loadBlueprints().map(b => b.app_type) } },
      };
    }
  } else {
    const best = candidates[0];
    if (best) {
      matched = best;
      matchedBy = "semantic";
    } else {
      const fallback = getBlueprintByType("generic_fullstack_app");
      if (fallback) {
        matched = { blueprint: fallback, score: 0 };
        matchedBy = "fallback";
      }
    }
  }

  if (!matched) {
    return {
      error: { status: 422, body: { error: "No matching blueprint available.", available: loadBlueprints().map(b => b.app_type) } },
    };
  }
  return { matched, matchedBy, candidates };
}

// ---------------------------------------------------------------------------
// POST /api/blueprint/mockup  –  pre-build GUI mockup (fast preview image)
// ---------------------------------------------------------------------------
// The "GUI before code" flow: match the user's goal to the blueprint bible
// (same matching as /build), then render a DETERMINISTIC mockup image of how
// the app's GUI should look — module sidebar, palette, data-flow cards — with
// NO LLM call and NO file generation. The frontend shows this image to the
// user BEFORE generating code, so they can sanity-check the design and then
// approve the full build (POST /api/blueprint/build) with the real files.
//
// Body: { goal, purpose?, targetOS?, language?, appType? }
// Returns: { success, mockup: { available, imageBase64?, html, appType, matchScore, matchedBy }, timingMs }
router.post("/mockup", async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    const { goal, purpose, targetOS, language, appType, theme, layout } = req.body || {};

    if (!goal || typeof goal !== "string" || goal.trim().length === 0) {
      res.status(400).json({ error: "A non-empty 'goal' string is required." });
      return;
    }

    const resolved = resolveBlueprint(req.body);
    if (resolved.error) {
      res.status(resolved.error.status).json(resolved.error.body);
      return;
    }
    const { matched, matchedBy } = resolved as { matched: BlueprintMatch; matchedBy: "explicit" | "semantic" | "fallback" };

    const html = buildGuiMockupHtml(matched.blueprint, goal.trim(), { purpose, targetOS, language, theme, layout });

    // Render to a real PNG when Chromium is available; the HTML is always
    // returned so the frontend can display it in an iframe as a fallback.
    const render = await renderGuiMockupToPng(html);

    res.json({
      success: true,
      mockup: {
        available: render.available,
        reason: render.reason,
        imageBase64: render.imageBase64,
        html: render.html,
        appType: matched.blueprint.app_type,
        description: matched.blueprint.description,
        modules: matched.blueprint.architecture_checklist,
        wiring: matched.blueprint.wiring_graph,
        matchScore: matched.score,
        matchedBy,
        theme: theme || null,
        layout: layout || null,
      },
      timingMs: {
        total: Date.now() - startTime,
        render: render.durationMs,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[blueprint] Mockup error:", message);
    res.status(500).json({ error: "GUI mockup failed.", details: message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/blueprint/suggest  –  high-level suggestions for the whole app idea
// ---------------------------------------------------------------------------
router.post("/suggest", async (req: Request, res: Response) => {
  try {
    const { goal, purpose, targetOS } = req.body;

    if (!goal || typeof goal !== "string" || goal.trim().length === 0) {
      res.status(400).json({ error: "A non-empty 'goal' string is required." });
      return;
    }

    const searchService = getSearchService();
    const suggestions = await suggestForBlueprint(
      { goal: goal.trim(), purpose, targetOS },
      searchService
    );

    res.json({ suggestions });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[blueprint] Suggestion error:", message);
    res.status(500).json({ error: "Failed to generate suggestions.", details: message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/blueprint/suggest-node  –  node-specific implementation suggestions
// ---------------------------------------------------------------------------
router.post("/suggest-node", async (req: Request, res: Response) => {
  try {
    const { nodeType, nodeLabel, nodeDescription, language, goal, purpose, targetOS } = req.body;

    if (!goal || typeof goal !== "string") {
      res.status(400).json({ error: "A 'goal' string is required." });
      return;
    }
    if (!nodeType || typeof nodeType !== "string") {
      res.status(400).json({ error: "A 'nodeType' string is required." });
      return;
    }

    const result = await suggestForNode({
      nodeType,
      nodeLabel: nodeLabel || nodeType,
      nodeDescription: nodeDescription || "",
      language,
      goal,
      purpose,
      targetOS,
    });

    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[blueprint] Node suggestion error:", message);
    res.status(500).json({ error: "Failed to generate node suggestions.", details: message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/blueprint/build  –  blueprint-driven end-to-end app build
// ---------------------------------------------------------------------------
// The doc's Step 1–4 flow: match the user's goal to the closest blueprint in
// the embedded bible, translate it into a VACA project (one node per checklist
// module, edges from the wiring graph), fuse the blueprint constraints into
// the generation prompt, then run the existing FileGenerator over the project.
//
// Body: { goal, purpose?, targetOS?, language?, scale?, appType?, skipValidation? }
//   - goal        : natural-language description of the app to build (required)
//   - appType     : force a specific blueprint (e.g. "home_media_server");
//                   otherwise the closest match is chosen semantically
//   - language    : override the language derived from the blueprint stack
//   - scale       : small | medium | large | enterprise
//   - skipValidation: fast preview build (skips sandbox + live tsc loop)
router.post("/build", async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    const {
      goal,
      purpose,
      targetOS,
      language,
      scale,
      appType,
      skipValidation,
    } = req.body || {};

    if (!goal || typeof goal !== "string" || goal.trim().length === 0) {
      res.status(400).json({ error: "A non-empty 'goal' string is required." });
      return;
    }

    // ── Step 1+3: match the request to a bible blueprint ──
    // Scores below this floor are embedding noise — prefer the safe generic
    // blueprint so a weakly-matched goal doesn't get misrouted into an
    // unrelated architecture. Exact lexical hits (a goal token matching a
    // blueprint's app_type/keywords) are boosted inside matchBlueprint, so a
    // genuine domain match ("recipes" → recipe_manager) clears the floor while
    // weak unrelated noise (e.g. code_playground at ~0.27) does not.
    const resolved = resolveBlueprint(req.body);
    if (resolved.error) {
      res.status(resolved.error.status).json(resolved.error.body);
      return;
    }
    const { matched, matchedBy, candidates } = resolved as { matched: BlueprintMatch; matchedBy: "explicit" | "semantic" | "fallback"; candidates?: BlueprintMatch[] };

    // ── Translate blueprint → VACA project ──
    const project = blueprintToProject(matched.blueprint, {
      goal: goal.trim(),
      purpose,
      targetOS,
      language,
      scale,
    });
    projects.create(project);

    // ── Step 4: run the existing FileGenerator over the project ──
    // The blueprint constraints are already fused into every node prompt via
    // the master node's blueprintContext (see layers/fileGenerator.ts).
    const onProgress: GenerationProgressCallback = (progress) => {
      broadcastGenerationProgress({
        batch: progress.batch,
        totalBatches: progress.totalBatches,
        batchSize: progress.batchSize,
        generatingNodes: progress.generatingNodes,
        percent: progress.percent,
        phase: progress.phase,
      });
    };

    const generation = await fileGenerator.generateFiles(project, skipValidation === true, onProgress);

    // The skipVerifiedCapture flag exists only for the duration of this build:
    // FileGenerator consumed it (skipping its generic capture) and this route
    // performs the blueprint-enriched capture below. Clear it so a later
    // regeneration of this project via the normal canvas path captures normally.
    const master = project.nodes.find(n => n.type === 'master');
    if (master?.data?.skipVerifiedCapture) delete master.data.skipVerifiedCapture;

    // ── Close the learning loop (the doc's Step 5): capture VERIFIED
    // blueprint-driven files into training/dataset/verified-generations.jsonl,
    // a priority source for the fine-tune pipeline (build-vaca-knowledge-dataset
    // and merge-campaign50-into-dataset both guarantee it into train). The
    // instruction embeds the blueprint constraints so the model learns
    // blueprint-constrained generation; FileGenerator's generic capture is
    // disabled for blueprint builds (master data flag) so each build yields
    // exactly one set of rows. Only real (non-preview) builds — broken output
    // never enters the dataset.
    let verifiedCapture: CaptureResult | null = null;
    if (skipValidation !== true) {
      try {
        verifiedCapture = captureVerifiedGeneration(project, generation.files, {
          // Use FileGenerator's authoritative verdict: rows are only captured
          // when the live tsc loop really passed every TS/JS file.
          tsCompileClean: generation.tsCompileClean,
          blueprintContext: master?.data?.blueprintContext,
          sourceTag: `blueprint-verified:${matched.blueprint.app_type}`,
        });
        if (verifiedCapture.captured > 0) {
          console.log(`[blueprint] Captured ${verifiedCapture.captured} verified file(s) for blueprint '${matched.blueprint.app_type}' (${verifiedCapture.filePath})`);
        } else if (verifiedCapture.skipped > 0) {
          console.log(`[blueprint] Verified capture skipped ${verifiedCapture.skipped} file(s): ${JSON.stringify(verifiedCapture.reasons)}`);
        }
      } catch (err) {
        console.warn('[blueprint] Verified-generation capture failed (non-fatal):', err);
      }
    }

    const blueprintOut = {
      app_type: matched.blueprint.app_type,
      description: matched.blueprint.description,
      target_stack: matched.blueprint.target_stack,
      architecture_checklist: matched.blueprint.architecture_checklist,
      wiring_graph: matched.blueprint.wiring_graph,
    };

    // ── Blueprint-drift report ──
    // Compare the modules the mockup promised (the blueprint checklist the
    // user saw in the pre-build preview) against the files the build actually
    // produced. A promised module with no file — or a file matching no
    // promised module — is drift the user should see, not a silent surprise.
    const drift = compareModulesToFiles(matched.blueprint.architecture_checklist, generation.files);

    res.json({
      success: true,
      projectId: project.id,
      matchedBy,
      matchScore: matched.score,
      blueprint: blueprintOut,
      candidates: (candidates || []).map(c => ({ app_type: c.blueprint.app_type, score: c.score })),
      project: {
        id: project.id,
        name: project.name,
        targetOS: project.targetOS,
        nodeCount: project.nodes.length,
        edgeCount: project.edges.length,
        nodes: project.nodes.map(n => ({ id: n.id, type: n.type, label: n.data.label })),
        edges: project.edges,
      },
      verifiedCapture,
      drift,
      ...generation,
      summary: {
        totalFiles: generation.files.length,
        totalChars: generation.totalChars,
        totalErrors: generation.totalErrors,
        validated: generation.validatedCount,
        failed: generation.failedCount,
        isAllValidated: generation.failedCount === 0,
      },
      timingMs: {
        total: Date.now() - startTime,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[blueprint] Build error:", message);
    res.status(500).json({ error: "Blueprint build failed.", details: message });
  }
});

export default router;
