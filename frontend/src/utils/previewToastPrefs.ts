/**
 * previewToastPrefs.ts — persistence for the preview toast dismissals.
 *
 * The toast (explaining the planned-interface mockup window) is keyed by the
 * mockup's blueprint appType (e.g. "pomodoro_timer_3"). Within a session it
 * shows at most once per key (App.tsx keeps an in-memory seen-set); when the
 * user explicitly dismisses it with ✕, the key is persisted here so it never
 * nags again in future sessions either.
 */

const STORAGE_KEY = 'vaia-preview-toast-dismissed';

/** Load the set of preview keys the user has explicitly dismissed. */
export function loadDismissedPreviewKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr.filter((k): k is string => typeof k === 'string'));
      }
    }
  } catch {
    // localStorage unavailable or corrupt — start empty
  }
  return new Set();
}

/** Persist a dismissed preview key (idempotent, best-effort). */
export function persistDismissedPreviewKey(key: string, dismissed: Set<string>): void {
  dismissed.add(key);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...dismissed]));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}
