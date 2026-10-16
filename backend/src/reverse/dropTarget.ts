/**
 * dropTarget — turn a *drop* into something REA can analyze.
 *
 * REA analyses a PATH (`rea analyze <directory>`), and a drop can supply one of
 * two things:
 *
 *   1. **The real path** — Electron's `webUtils.getPathForFile` hands back where
 *      the file actually lives, so REA reads the artifact itself and nothing is
 *      copied. This is the only way a dropped APK/EXE/DLL/`.wasm` can be scanned
 *      at all, because those bytes never reach the browser.
 *   2. **The dropped text** — a browser drop delivers file CONTENTS through
 *      `FileReader`, and the frontend substitutes a `[binary file: name]`
 *      placeholder for anything it cannot read as text. Those files are staged
 *      into a temp directory here, producing a real but reduced target.
 *
 * The honesty rule for (2): a placeholder is NOT a file. Writing `[binary file:
 * app.js]` into a staged tree and then "scanning" it would fill the canvas with
 * the architecture of a text file that does not exist, so placeholders are
 * skipped and reported instead. The caller tells the user what was left out.
 */

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { sanitizeRelPath } from '../review/ocrReviewer.js';

export interface DroppedFileInput {
  path: string;
  content: string;
}

/** The placeholder the frontend writes for a file it could not read as text. */
const PLACEHOLDER_RE = /^\[(?:binary(?:\/large)?) file: [^\]]*\]$/;

export function isDropPlaceholder(content: string): boolean {
  return PLACEHOLDER_RE.test((content || '').trim());
}

/** Why a dropped file is not in the staged tree. */
export type SkipReason = 'not-text' | 'unsafe-path' | 'duplicate' | 'over-limit';

export interface StagedDrop {
  /** The temp directory handed to REA. */
  dir: string;
  /** Number of files actually written. */
  written: number;
  /** Total bytes written. */
  bytes: number;
  /** Files left out, each with the reason — reported to the user, never silent. */
  skipped: Array<{ path: string; reason: SkipReason }>;
  /** Remove the staged tree. Safe to call more than once. */
  cleanup: () => Promise<void>;
}

export interface StagingLimits {
  /** Files to stage before giving up on the rest. */
  maxFiles?: number;
  /** Total bytes to stage before giving up on the rest. */
  maxBytes?: number;
}

export const STAGING_DEFAULTS: Required<StagingLimits> = { maxFiles: 4000, maxBytes: 64 * 1024 * 1024 };

/**
 * Write the dropped files to an isolated temp directory, preserving relative
 * paths, and return the directory plus an honest account of what was left out.
 *
 * Follows the same staging contract as the OCR reviewer: every path is validated
 * with `sanitizeRelPath` before it is joined to the temp root, so a dropped
 * `../../etc/passwd` cannot escape it.
 */
export async function stageDroppedFiles(
  files: DroppedFileInput[],
  limits: StagingLimits = {},
): Promise<StagedDrop> {
  const { maxFiles, maxBytes } = { ...STAGING_DEFAULTS, ...limits };
  const dir = await mkdtemp(join(tmpdir(), 'vaca-deep-scan-'));
  const skipped: StagedDrop['skipped'] = [];
  const seen = new Set<string>();
  let written = 0;
  let bytes = 0;

  for (const file of Array.isArray(files) ? files : []) {
    const rawPath = typeof file?.path === 'string' ? file.path : '';
    const content = typeof file?.content === 'string' ? file.content : '';
    if (!rawPath) continue;

    const rel = sanitizeRelPath(rawPath);
    if (!rel) {
      skipped.push({ path: rawPath, reason: 'unsafe-path' });
      continue;
    }
    if (isDropPlaceholder(content)) {
      skipped.push({ path: rel, reason: 'not-text' });
      continue;
    }
    if (seen.has(rel)) {
      skipped.push({ path: rel, reason: 'duplicate' });
      continue;
    }
    if (written >= maxFiles || bytes + content.length > maxBytes) {
      skipped.push({ path: rel, reason: 'over-limit' });
      continue;
    }

    const target = join(dir, rel);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
    seen.add(rel);
    written += 1;
    bytes += content.length;
  }

  let cleaned = false;
  return {
    dir,
    written,
    bytes,
    skipped,
    cleanup: async () => {
      if (cleaned) return;
      cleaned = true;
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/** One line per reason, for the response the drop dialog shows. */
export function describeStagedSkips(skipped: StagedDrop['skipped']): string[] {
  const byReason = new Map<SkipReason, string[]>();
  for (const s of skipped) byReason.set(s.reason, [...(byReason.get(s.reason) ?? []), s.path]);

  const lines: string[] = [];
  const label: Record<SkipReason, string> = {
    'not-text': 'not readable as text (the browser drop only carries text)',
    'unsafe-path': 'rejected — the path would escape the staged folder',
    duplicate: 'duplicate path',
    'over-limit': 'left out — the staged copy hit its size limit',
  };
  for (const [reason, paths] of byReason) {
    const shown = paths.slice(0, 5).join(', ');
    lines.push(`${paths.length} file(s) ${label[reason]}: ${shown}${paths.length > 5 ? ', …' : ''}`);
  }
  return lines;
}
