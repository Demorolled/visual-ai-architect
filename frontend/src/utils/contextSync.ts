/**
 * contextSync.ts — Shared Context Sync
 * =====================================
 *
 * Dual broadcast utility for the Shared State Store, mirroring the pattern
 * used in statusSync.ts.
 *
 * When a component sets a context value, this utility:
 * 1. Broadcasts via BroadcastChannel to same-origin tabs
 * 2. POSTs to the backend which persists shared context
 *
 * This enables the "telepathy" method — type /set theme neon-sunset in the
 * terminal and watch the GUI update instantly.
 */

export const CONTEXT_CHANNEL = 'visual-ai-context';

/**
 * Broadcast a context update to all listening windows AND the backend.
 *
 * @param updates — Key/value pairs to update in the shared context
 * @param source — Identifier of the caller (e.g. 'terminal', 'gui').
 *                 Used by context watchers to skip showing notifications for
 *                 their own changes.
 */
export function broadcastContextUpdate(updates: Record<string, any>, source?: string) {
  // 1. Local BroadcastChannel — for same-origin tabs
  try {
    const ch = new BroadcastChannel(CONTEXT_CHANNEL);
    ch.postMessage({ type: 'context-update', context: updates, source: source || 'unknown' });
    ch.close();
  } catch { /* BroadcastChannel not available */ }

  // 2. Backend via REST — persists shared context
  fetch('/api/context', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {
    // Backend may not be running — fire-and-forget
  });
}

/**
 * Subscribe to context updates from the BroadcastChannel.
 * Returns an unsubscribe function.
 *
 * The callback receives { context, source } where source is the identifier
 * of the component that initiated the update.
 */
export function subscribeContext(
  onUpdate: (context: Record<string, any>, source: string) => void
): () => void {
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(CONTEXT_CHANNEL);
    channel.onmessage = (e: MessageEvent) => {
      if (e.data?.type === 'context-update' && e.data?.context) {
        onUpdate(e.data.context, e.data.source || 'unknown');
      }
    };
  } catch { /* BroadcastChannel not available */ }

  return () => {
    if (channel) channel.close();
  };
}

/**
 * Fetch the full context from the backend.
 */
export async function fetchSharedContext(): Promise<Record<string, any>> {
  try {
    const res = await fetch('/api/context', { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.context) return data.context;
    }
  } catch { /* Backend not reachable */ }
  return {};
}
