export const STATUS_CHANNEL = 'visual-ai-status';

/**
 * Broadcast status to all listening windows (via BroadcastChannel)
 * AND to the backend (which broadcasts via Socket.IO to all connected clients).
 *
 * This enables cross-app status — the terminal window gets real-time
 * thinking/progress from whichever app is generating, regardless of which
 * browser tab or app origin it lives in.
 */
export function broadcastStatus(payload: { thinking: boolean; progress: number }) {
  // 1. Local BroadcastChannel — for same-origin tabs
  try {
    const ch = new BroadcastChannel(STATUS_CHANNEL);
    ch.postMessage({ type: 'status-update', payload });
    ch.close();
  } catch {}

  // 2. Backend via REST — backend broadcasts via Socket.IO to ALL clients
  fetch('/api/remote/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      thinking: payload.thinking,
      progress: payload.progress,
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {
    // Backend may not be running — fire-and-forget
  });
}
