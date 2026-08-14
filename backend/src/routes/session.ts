/**
 * Session ID Tunnel
 * =================
 *
 * Short-code session storage for offline context transfer between apps.
 *
 * When the terminal generates a session code, it saves
 * the current workspace state (nodes, edges, context, metadata) to the
 * backend. The user can then enter that code in another app
 * and have the full state restored.
 *
 * Sessions are stored as JSON files in `.session_cache/sessions/<code>.json`.
 * Each session has a configurable TTL (default 24 hours) for auto-cleanup.
 */

import { Router, Request, Response } from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { sessionMemory } from '../database/sessionMemory.js';

// ─── Configuration ─────────────────────────────────────────────────────────

const CACHE_DIR = join(import.meta.dirname, '..', '..', '.session_cache');
const SESSIONS_DIR = join(CACHE_DIR, 'sessions');

const MAX_CODE_LENGTH = 4; // Number of alphanumeric characters in the code

// ─── Types ─────────────────────────────────────────────────────────────────

/** The full session payload that gets serialized */
export interface SessionData {
  /** Short human-readable label for this session */
  label: string;
  /** Project metadata */
  projectName: string;
  projectId: string | null;
  goal: string;
  purpose: string;
  targetOS: string;
  /** Canvas state */
  nodes: any[];
  edges: any[];
  /** Shared context snapshot */
  sharedContext: Record<string, any>;
  /** UI function suggestions */
  uiFunctions: any[];
  placedWidgets: any[];
  /** Timestamps */
  createdAt: string;
  updatedAt: string;
}

/** On-disk session envelope */
interface SessionEnvelope {
  code: string;
  data: SessionData;
}

// ─── Session Code Generation ────────────────────────────────────────────────

/**
 * Generate a short human-readable session code.
 * The code is derived from a hash of the session data + a random element,
 * producing a 4-character alphanumeric string like "x92a" or "3f8k".
 *
 * The full code is `sess-<hash>`, e.g. "sess-x92a".
 */
export function generateSessionCode(data: Partial<SessionData>): string {
  const content = JSON.stringify(data);
  const hash = createHash('sha256').update(content).digest('hex');
  // Take first 4 hex chars, convert to base36 for compactness
  const raw = parseInt(hash.substring(0, 6), 16);
  const code = raw.toString(36).substring(0, MAX_CODE_LENGTH).padStart(MAX_CODE_LENGTH, '0');
  return `sess-${code}`;
}

/**
 * Generate a unique session code that doesn't collide with existing sessions.
 */
function generateUniqueCode(data: Partial<SessionData>): string {
  let code = generateSessionCode(data);
  let attempts = 0;
  while (existsSync(sessionFilePath(code)) && attempts < 10) {
    // Add a random suffix to break the collision
    code = generateSessionCode({ ...data, _salt: Math.random().toString(36).slice(2, 6) } as Partial<SessionData>);
    attempts++;
  }
  return code;
}

// ─── File Helpers ───────────────────────────────────────────────────────────

function ensureSessionsDir(): void {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

function sessionFilePath(code: string): string {
  return join(SESSIONS_DIR, `${code}.json`);
}

function isValidCode(code: string): boolean {
  return /^sess-[a-z0-9]{4}$/.test(code);
}

// ─── Session CRUD ──────────────────────────────────────────────────────────

export function saveSession(code: string, data: SessionData): void {
  ensureSessionsDir();
  const envelope: SessionEnvelope = { code, data };
  writeFileSync(sessionFilePath(code), JSON.stringify(envelope, null, 2), 'utf-8');
}

export function loadSession(code: string): SessionData | null {
  const filePath = sessionFilePath(code);
  if (!existsSync(filePath)) return null;
  try {
    const envelope: SessionEnvelope = JSON.parse(readFileSync(filePath, 'utf-8'));
    return envelope.data;
  } catch {
    return null;
  }
}

export function deleteSessionFile(code: string): boolean {
  const filePath = sessionFilePath(code);
  if (!existsSync(filePath)) return false;
  unlinkSync(filePath);
  return true;
}

export function listSessions(): Array<{ code: string; label: string; createdAt: string }> {
  ensureSessionsDir();
  const files = readdirSync(SESSIONS_DIR);
  const sessions: Array<{ code: string; label: string; createdAt: string }> = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const envelope: SessionEnvelope = JSON.parse(
        readFileSync(join(SESSIONS_DIR, file), 'utf-8')
      );
      sessions.push({
        code: envelope.code,
        label: envelope.data.label || 'Untitled',
        createdAt: envelope.data.createdAt,
      });
    } catch {
      // Skip corrupted files
    }
  }

  // Sort newest first
  sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return sessions;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

export const sessionRoutes = Router();

/**
 * POST /api/session/save
 * Save a session with provided data. Returns the session code.
 *
 * Body: { label, projectName, goal, purpose, targetOS, nodes, edges, sharedContext, uiFunctions, placedWidgets }
 */
sessionRoutes.post('/save', (req: Request, res: Response) => {
  try {
    const {
      label,
      projectName,
      projectId,
      goal,
      purpose,
      targetOS,
      nodes,
      edges,
      sharedContext,
      uiFunctions,
      placedWidgets,
    } = req.body;

    const now = new Date().toISOString();

    const sessionData: SessionData = {
      label: label || 'Untitled Session',
      projectName: projectName || 'Untitled Project',
      projectId: projectId || null,
      goal: goal || '',
      purpose: purpose || '',
      targetOS: targetOS || 'linux',
      nodes: nodes || [],
      edges: edges || [],
      sharedContext: sharedContext || {},
      uiFunctions: uiFunctions || [],
      placedWidgets: placedWidgets || [],
      createdAt: now,
      updatedAt: now,
    };

    const code = generateUniqueCode(sessionData);
    saveSession(code, sessionData);

    console.log(`[session] Saved session ${code}: "${sessionData.label}"`);

    res.json({
      success: true,
      code,
      label: sessionData.label,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/session/load
 * Load a session by code.
 *
 * Body: { code: "sess-x92a" }
 */
sessionRoutes.post('/load', (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    if (!code || !isValidCode(code)) {
      res.status(400).json({ success: false, error: 'Invalid session code format. Expected sess-xxxx' });
      return;
    }

    const data = loadSession(code);
    if (!data) {
      res.status(404).json({ success: false, error: `Session "${code}" not found` });
      return;
    }

    res.json({
      success: true,
      code,
      session: data,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/session/:code
 * Delete a session by code.
 */
sessionRoutes.delete('/:code', (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    if (!isValidCode(code)) {
      res.status(400).json({ success: false, error: 'Invalid session code format' });
      return;
    }

    const deleted = deleteSessionFile(code);
    res.json({
      success: deleted,
      message: deleted ? `Session "${code}" deleted` : `Session "${code}" not found`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/session/list
 * List all saved sessions (code + label + createdAt only).
 */
sessionRoutes.get('/list', (_req: Request, res: Response) => {
  try {
    const sessions = listSessions();
    res.json({ success: true, sessions });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/session/builds
 * Returns the full build history with rich per-node status details.
 */
sessionRoutes.get('/builds', (_req: Request, res: Response) => {
  try {
    const memory = sessionMemory.getMemory();
    res.json({
      success: true,
      lastBuild: memory.lastBuild,
      buildHistory: memory.buildHistory,
      totalBuilds: memory.buildHistory.length,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/session/builds/:index
 * Returns a specific build record by index (0 = most recent).
 */
sessionRoutes.get('/builds/:index', (req: Request, res: Response) => {
  try {
    const memory = sessionMemory.getMemory();
    const idx = parseInt(req.params.index, 10);
    if (isNaN(idx) || idx < 0 || idx >= memory.buildHistory.length) {
      res.status(404).json({ success: false, error: 'Build not found at index ' + req.params.index });
      return;
    }
    res.json({
      success: true,
      build: memory.buildHistory[idx],
      index: idx,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/session/builds
 * Clear all build history.
 */
sessionRoutes.delete('/builds', (_req: Request, res: Response) => {
  try {
    sessionMemory.clear();
    res.json({ success: true, message: 'Build history cleared' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
