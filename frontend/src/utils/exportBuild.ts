/**
 * exportBuild.ts — write an ALREADY-GENERATED project out to a real folder.
 *
 * Extracted from ExportDialog's "scaffold" step so the chat-driven flow and
 * the export dialog can never drift apart: both re-register the graph with the
 * backend (its project registry is in-memory and a restart wipes it) and then
 * call the per-file scaffold endpoint.
 *
 * This helper NEVER generates code. Callers must pass a project whose nodes
 * already carry generated code. The blueprint build does, and it also caches
 * its generation server-side (see routes/blueprint.ts), so the scaffold call
 * reuses that build instead of re-running the LLM for 5+ minutes.
 */

import { api, ensureServerProject } from '../api/client';

export interface ExportBuildParams {
  /** Server project id (a stale one is transparently recreated). */
  projectId: string | null;
  appName: string;
  targetOS: string;
  /** Destination directory (~/Desktop/x). Undefined → backend default. */
  outputDir?: string;
  nodes: any[];
  edges: any[];
  /** Tree Mode: the app trees, so the export can build them as separate apps. */
  trees?: any[];
}

export interface ExportBuildResult {
  success: boolean;
  outputPath?: string;
  files?: string[];
  /** Set when the requested path was unwritable and the default was used. */
  warning?: string;
  error?: string;
}

/** Runs the export step. Never throws — failures come back as { success:false }. */
export async function exportBuild(params: ExportBuildParams): Promise<ExportBuildResult> {
  try {
    const freshId = await ensureServerProject({
      projectId: params.projectId,
      name: params.appName,
      targetOS: params.targetOS,
      nodes: params.nodes,
      edges: params.edges,
      trees: params.trees,
    });

    const res = await api.exportPerFileScaffold(freshId, {
      projectName: params.appName,
      targetOS: params.targetOS,
      outputDir: params.outputDir || undefined,
    });

    const data = res.data || {};
    if (!data.success) {
      return { success: false, error: data.error || data.message || 'Export failed' };
    }
    return {
      success: true,
      outputPath: data.outputPath,
      files: data.files || [],
      warning: data.warning,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.response?.data?.error || err?.message || String(err),
    };
  }
}

/** Open an exported folder in the OS file manager. Best-effort — never throws. */
export async function openExportedFolder(outputPath: string): Promise<boolean> {
  try {
    const res = await api.openExportFolder(outputPath);
    return res.data?.success === true;
  } catch {
    return false;
  }
}
