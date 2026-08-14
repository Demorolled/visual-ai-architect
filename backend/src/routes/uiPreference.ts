/**
 * UI Preference Routes — Global preference for CLI vs GUI app generation
 * ======================================================================
 *
 * Stores a simple three-state preference that tells the system whether to:
 *   - 'cli'  — Always generate CLI/terminal apps, never ask
 *   - 'gui'  — Always generate graphical/web apps, never ask
 *   - 'ask'  — Ask the user each time (default)
 *
 * Config is persisted to data/ui-preference.json
 */

import { Router, Request, Response } from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export type UiPreference = 'cli' | 'gui' | 'ask';

interface UiPreferenceFile {
  preference: UiPreference;
  updatedAt: string;
}

// ─── Persistence ──────────────────────────────────────────────────────────

function getConfigPath(): string {
  const projectRoot = resolve(__dirname, '..', '..', '..');
  return resolve(projectRoot, 'data', 'ui-preference.json');
}

const DEFAULT_PREFERENCE: UiPreferenceFile = {
  preference: 'ask',
  updatedAt: new Date().toISOString(),
};

export function loadPreference(): UiPreferenceFile {
  const path = getConfigPath();
  try {
    if (existsSync(path)) {
      const raw = readFileSync(path, 'utf-8');
      const parsed = JSON.parse(raw);
      const pref = parsed.preference || 'ask';
      if (pref === 'cli' || pref === 'gui' || pref === 'ask') {
        return { preference: pref as UiPreference, updatedAt: parsed.updatedAt || new Date().toISOString() };
      }
    }
  } catch (e) {
    console.warn('[uiPreference] Failed to load, using default:', e);
  }
  return { ...DEFAULT_PREFERENCE };
}

function savePreference(pref: UiPreference): UiPreferenceFile {
  const data: UiPreferenceFile = { preference: pref, updatedAt: new Date().toISOString() };
  try {
    writeFileSync(getConfigPath(), JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('[uiPreference] Failed to save:', e);
  }
  return data;
}

// ─── Validator ────────────────────────────────────────────────────────────

export function validatePreference(value: unknown): UiPreference | null {
  if (value === 'cli' || value === 'gui' || value === 'ask') return value;
  return null;
}

// ─── Routes ───────────────────────────────────────────────────────────────

export const uiPreferenceRoutes = Router();

/**
 * GET /api/ui-preference
 * Returns the current global UI preference.
 */
uiPreferenceRoutes.get('/', (_req: Request, res: Response) => {
  const config = loadPreference();
  res.json({
    success: true,
    preference: config.preference,
    updatedAt: config.updatedAt,
  });
});

/**
 * POST /api/ui-preference
 * Body: { preference: 'cli' | 'gui' | 'ask' }
 * Sets the global UI preference.
 */
uiPreferenceRoutes.post('/', (req: Request, res: Response) => {
  try {
    const { preference } = req.body;
    const valid = validatePreference(preference);
    if (!valid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid preference. Must be one of: cli, gui, ask',
      });
    }

    const config = savePreference(valid);
    console.log(`[uiPreference] Set global UI preference to: ${valid}`);
    res.json({
      success: true,
      preference: config.preference,
      updatedAt: config.updatedAt,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to set preference';
    res.status(500).json({ success: false, error: msg });
  }
});
