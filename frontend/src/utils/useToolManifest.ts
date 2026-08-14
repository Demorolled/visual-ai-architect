/**
 * useToolManifest — connect to the backend Socket.IO server and listen for
 * the tool_manifest broadcast event. Stores the manifest in the zustand store
 * so UI components can display available tools without polling.
 */

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useToolManifestStore, type ToolManifestEntry } from '../store/toolManifestStore';

const SOCKET_PATH = '/ws';

/**
 * Hook that connects to the backend WebSocket and listens for tool_manifest events.
 * Automatically connects on mount and disconnects on unmount.
 *
 * Usage: call once at the app root or in a top-level component like App.tsx.
 * The manifest is stored in the zustand store and accessible anywhere via
 * useToolManifestStore().
 */
export function useToolManifest(): void {
  const socketRef = useRef<Socket | null>(null);
  const setManifest = useToolManifestStore(s => s.setManifest);
  const received = useToolManifestStore(s => s.received);

  useEffect(() => {
    // Already received, no need to reconnect
    if (received) return;

    // Delay connection slightly to give the backend time to start
    const connectTimeout = setTimeout(() => {
      const socketUrl = window.location.origin;
      const socket = io(socketUrl, {
        path: SOCKET_PATH,
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
      });

      socket.on('connect', () => {
        console.log('[ToolManifest] Socket connected, waiting for tool manifest...');
      });

      socket.on('tool_manifest', (data: {
        formattedText: string;
        manifest: ToolManifestEntry[];
      }) => {
        console.log(`[ToolManifest] Received ${data.manifest?.length || 0} tools`);
        if (data.formattedText && data.manifest) {
          setManifest(data.formattedText, data.manifest);
        }
        // Disconnect after receiving — we don't need a persistent connection
        socket.disconnect();
      });

      socket.on('connect_error', (err) => {
        console.warn('[ToolManifest] Connection error:', err.message);
      });

      socket.on('disconnect', () => {
        console.log('[ToolManifest] Socket disconnected');
      });

      socketRef.current = socket;
    }, 1000); // 1s delay to let backend finish startup

    return () => {
      clearTimeout(connectTimeout);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [received, setManifest]);
}

/**
 * Get a human-readable label for a tool category.
 */
export function getCategoryLabel(category: string): string {
  return category
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Get an emoji icon for a tool category.
 */
export function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    file_system: '📁',
    execution: '⚡',
    web: '🌐',
    ai: '🤖',
    knowledge: '🧠',
    emotion: '💜',
    project: '📋',
    blueprint: '📐',
    sandbox: '🧪',
    speech: '🔊',
    agent: '👤',
    config: '⚙️',
    task: '📌',
    utility: '🔧',
    development: '💻',
    testing: '🧪',
    network: '🔗',
    data: '📊',
    design: '🎨',
    diagram: '📈',
    monitoring: '📡',
    notification: '🔔',
  };
  return icons[category] || '🔧';
}
