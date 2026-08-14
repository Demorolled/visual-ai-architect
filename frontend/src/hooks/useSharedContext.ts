/**
 * useSharedContext — React hook for the Shared State Store
 * =========================================================
 *
 * Polls the backend's shared context at a configurable interval
 * AND listens for instant BroadcastChannel updates from same-origin tabs.
 *
 * Provides updateContext() and updateMultiple() for setting values.
 *
 * Usage:
 *   const { context, updateContext } = useSharedContext();
 *   console.log(context.theme); // "neon-sunset"
 *   updateContext('theme', 'dark'); // instantly updates local + persists via backend
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { subscribeContext, fetchSharedContext, broadcastContextUpdate } from '../utils/contextSync';

const POLL_INTERVAL_MS = 3000; // 3 seconds

export interface SharedContext {
  [key: string]: any;
}

export function useSharedContext(pollInterval?: number) {
  const [context, setContext] = useState<SharedContext>({});
  const [loading, setLoading] = useState(true);
  const contextRef = useRef(context);
  contextRef.current = context;
  const interval = pollInterval ?? POLL_INTERVAL_MS;

  // ── Track last local update to avoid stale poll data overwriting ──
  const lastUpdateRef = useRef(0);

  // ── Poll the backend periodically ──
  useEffect(() => {
    let mounted = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      // Record the time we start this fetch
      const fetchTime = Date.now();
      try {
        const data = await fetchSharedContext();
        // Only apply poll data if no local update happened after we started the fetch
        if (mounted && fetchTime > lastUpdateRef.current) {
          setContext(data);
          setLoading(false);
        }
      } catch {
        if (mounted) setLoading(false);
      }
    };

    // Initial fetch
    poll();

    // Poll at interval
    const schedulePoll = () => {
      timeoutId = setTimeout(async () => {
        await poll();
        if (mounted) schedulePoll();
      }, interval);
    };
    if (interval > 0) schedulePoll();

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, [interval]);

  // ── Listen for instant BroadcastChannel updates ──
  useEffect(() => {
    const unsub = subscribeContext((updates) => {
      setContext((prev) => ({ ...prev, ...updates }));
    });
    return unsub;
  }, []);

  // ── Set a single key ──
  const updateContext = useCallback((key: string, value: any) => {
    // Mark this timestamp so poll ignores stale responses
    lastUpdateRef.current = Date.now();
    // Optimistic local update
    setContext((prev) => ({ ...prev, [key]: value }));
    // Broadcast to all listeners + persist to backend
    broadcastContextUpdate({ [key]: value }, 'gui');
  }, []);

  // ── Set multiple keys at once ──
  const updateMultiple = useCallback((updates: Record<string, any>) => {
    lastUpdateRef.current = Date.now();
    setContext((prev) => ({ ...prev, ...updates }));
    broadcastContextUpdate(updates, 'gui');
  }, []);

  // ── Delete a key ──
  const deleteKey = useCallback(async (key: string) => {
    lastUpdateRef.current = Date.now();
    setContext((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    try {
      await fetch(`/api/context/${encodeURIComponent(key)}`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(5000),
      });
    } catch { /* Fire-and-forget */ }
  }, []);

  return {
    context,
    loading,
    updateContext,
    updateMultiple,
    deleteKey,
  };
}
