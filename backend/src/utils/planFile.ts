/**
 * Plan Mode — file helpers.
 *
 * Plan Mode captures the user's app ideas and writes them to a text file
 * (data/plans/<project-name>.txt) so they can be built later. The user names
 * the project; if they don't, the UI/API asks for one before saving.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import path from 'path';

export const PLANS_DIR =
  process.env.VACA_PLANS_DIR ||
  path.resolve(import.meta.dirname, '..', '..', '..', 'data', 'plans');

/** Make a filesystem-safe plan filename from a project name. */
export function safePlanName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
  return cleaned || 'untitled-plan';
}

/** Format a complete plan text file body. */
export function formatPlanFile(opts: {
  projectName: string;
  ideas: string;
  guidance: string;
  questions: string;
  updatedAt: string;
}): string {
  const { projectName, ideas, guidance, questions, updatedAt } = opts;
  const rule = '='.repeat(60);
  const lines = [
    rule,
    `PLAN: ${projectName}`,
    rule,
    `Status: PLANNED`,
    `Last updated: ${updatedAt}`,
    '',
    '## Ideas / Notes',
    '--------------------',
    ideas.trim() || '(no ideas captured yet)',
    '',
    '## AI Guidance / Assistance',
    '--------------------',
    guidance.trim() || '(no guidance yet — click "✨ Help me plan" in Plan Mode)',
    '',
    '## Open Questions',
    '--------------------',
    questions.trim() || '(none)',
    '',
    '---',
    'Auto-saved by VACA Plan Mode — ready to build when you are.',
    '',
  ];
  return lines.join('\n');
}

export interface PlanRecord {
  projectName: string;
  fileName: string;
  filePath: string;
  updatedAt: string;
}

/** Save a plan to data/plans/<name>.txt. Returns the record. */
export function savePlanFile(data: {
  projectName: string;
  ideas: string;
  guidance?: string;
  questions?: string;
}): PlanRecord {
  const projectName = data.projectName.trim();
  const fileName = `${safePlanName(projectName)}.txt`;
  if (!existsSync(PLANS_DIR)) mkdirSync(PLANS_DIR, { recursive: true });
  const filePath = path.join(PLANS_DIR, fileName);
  const updatedAt = new Date().toISOString();
  const body = formatPlanFile({
    projectName,
    ideas: data.ideas,
    guidance: data.guidance || '',
    questions: data.questions || '',
    updatedAt,
  });
  writeFileSync(filePath, body, 'utf-8');
  return { projectName, fileName, filePath, updatedAt };
}

/** List saved plan files. */
export function listPlanFiles(): PlanRecord[] {
  if (!existsSync(PLANS_DIR)) return [];
  return readdirSync(PLANS_DIR)
    .filter(f => f.endsWith('.txt'))
    .sort()
    .map(f => {
      const filePath = path.join(PLANS_DIR, f);
      const stat = existsSync(filePath)
        ? (() => { try { return statSync(filePath); } catch { return null; } })()
        : null;
      return {
        projectName: f.replace(/\.txt$/, '').replace(/_/g, ' '),
        fileName: f,
        filePath,
        updatedAt: stat ? stat.mtime.toISOString() : '',
      };
    });
}

/**
 * Read a plan file's text content by project name (or file name).
 * Always sanitizes through safePlanName — never join a raw user string into
 * the path (guards against path traversal via encoded '/' or '..').
 */
export function readPlanFile(name: string): { content: string; filePath: string } | null {
  const base = name.endsWith('.txt') ? name.slice(0, -4) : name;
  const fileName = `${safePlanName(base)}.txt`;
  const filePath = path.join(PLANS_DIR, fileName);
  if (!existsSync(filePath)) return null;
  return { content: readFileSync(filePath, 'utf-8'), filePath };
}
