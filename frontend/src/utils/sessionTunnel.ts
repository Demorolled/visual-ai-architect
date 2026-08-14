/**
 * sessionTunnel.ts — Session ID Tunnel (Frontend)
 * ================================================
 *
 * Short-code session transfer between apps.
 *
 * Flow:
 *   1. User types `/session-save` in the terminal
 *   2. Current workspace state is serialized and POSTed to /api/session/save
 *   3. Backend returns a short code like "sess-x92a"
 *   4. Terminal shows: "✅ Session saved as sess-x92a"
 *   5. User types `/session-load sess-x92a` in another app (or the GUI)
 *   6. Backend returns the full session data
 *   7. The target app restores the state
 */

/** The full session payload */
export interface SessionData {
  label: string;
  projectName: string;
  projectId: string | null;
  goal: string;
  purpose: string;
  targetOS: string;
  nodes: any[];
  edges: any[];
  sharedContext: Record<string, any>;
  uiFunctions: any[];
  placedWidgets: any[];
  createdAt: string;
  updatedAt: string;
}

/** Session listing item */
export interface SessionListItem {
  code: string;
  label: string;
  createdAt: string;
}

/** Validate a session code format */
export function isValidSessionCode(code: string): boolean {
  return /^sess-[a-z0-9]{4}$/.test(code);
}

/**
 * Save the current workspace state to the backend and get a session code.
 *
 * @param data — serialized workspace state
 * @returns the session code, or null on failure
 */
export async function saveSession(data: {
  label?: string;
  projectName?: string;
  projectId?: string | null;
  goal?: string;
  purpose?: string;
  targetOS?: string;
  nodes?: any[];
  edges?: any[];
  sharedContext?: Record<string, any>;
  uiFunctions?: any[];
  placedWidgets?: any[];
}): Promise<{ code: string; label: string } | null> {
  try {
    const res = await fetch('/api/session/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const result = await res.json();
    if (result.success) {
      return { code: result.code, label: result.label };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Load a session by code from the backend.
 *
 * @param code — e.g. "sess-x92a"
 * @returns the full session data, or null on failure
 */
export async function loadSession(code: string): Promise<SessionData | null> {
  if (!isValidSessionCode(code)) return null;
  try {
    const res = await fetch('/api/session/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const result = await res.json();
    if (result.success && result.session) {
      return result.session;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * List all saved sessions.
 */
export async function listSessions(): Promise<SessionListItem[]> {
  try {
    const res = await fetch('/api/session/list', {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const result = await res.json();
    if (result.success && Array.isArray(result.sessions)) {
      return result.sessions;
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Delete a session by code.
 */
export async function deleteSession(code: string): Promise<boolean> {
  if (!isValidSessionCode(code)) return false;
  try {
    const res = await fetch(`/api/session/${encodeURIComponent(code)}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
