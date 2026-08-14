import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadDismissedPreviewKeys, persistDismissedPreviewKey } from '../utils/previewToastPrefs';

const KEY = 'vaia-preview-toast-dismissed';

// localStorage is not available in the node test env — provide a tiny stub.
const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => { storage.set(k, v); },
    removeItem: (k: string) => { storage.delete(k); },
    clear: () => storage.clear(),
    key: (i: number) => [...storage.keys()][i] ?? null,
    get length() { return storage.size; },
  });
});

describe('previewToastPrefs', () => {
  it('returns an empty set when nothing has been dismissed', () => {
    expect(loadDismissedPreviewKeys().size).toBe(0);
  });

  it('loads persisted dismissed keys', () => {
    storage.set(KEY, JSON.stringify(['pomodoro_timer_3', 'chess_game']));
    const keys = loadDismissedPreviewKeys();
    expect(keys.has('pomodoro_timer_3')).toBe(true);
    expect(keys.has('chess_game')).toBe(true);
    expect(keys.has('other')).toBe(false);
  });

  it('persists a key and round-trips it', () => {
    const dismissed = loadDismissedPreviewKeys();
    persistDismissedPreviewKey('pomodoro_timer_3', dismissed);
    const reloaded = loadDismissedPreviewKeys();
    expect(reloaded.has('pomodoro_timer_3')).toBe(true);
  });

  it('persist is idempotent for the same key', () => {
    const dismissed = loadDismissedPreviewKeys();
    persistDismissedPreviewKey('chess_game', dismissed);
    persistDismissedPreviewKey('chess_game', dismissed);
    expect(JSON.parse(storage.get(KEY) || '[]')).toEqual(['chess_game']);
  });

  it('ignores corrupt storage and starts empty', () => {
    storage.set(KEY, '{not-json');
    expect(loadDismissedPreviewKeys().size).toBe(0);
  });
});
