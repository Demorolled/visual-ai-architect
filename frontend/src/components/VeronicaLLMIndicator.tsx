import { useEffect, useRef } from 'react';
import { useLlmStore } from '../store/llmStore';

export default function VeronicaLLMIndicator() {
  const { connectionStatus, latency, selectedModel, startHeartbeat } = useLlmStore();
  const heartbeatRef = useRef<(() => void) | null>(null);

  // Start persistent heartbeat on mount
  useEffect(() => {
    heartbeatRef.current = startHeartbeat();
    return () => {
      heartbeatRef.current?.();
    };
  }, [startHeartbeat]);

  const color = connectionStatus === 'connected' ? '#4ade80' :
                connectionStatus === 'testing' ? '#f59e0b' :
                connectionStatus === 'disconnected' ? '#ef4444' : '#64748b';

  const label = connectionStatus === 'connected'
    ? `LLM ${latency || ''}ms`
    : connectionStatus === 'testing'
      ? 'LLM…'
      : 'LLM Off';

  const title = connectionStatus === 'connected'
    ? `LLM connected (${latency}ms) — ${selectedModel}`
    : connectionStatus === 'testing'
      ? 'Testing LLM connection...'
      : 'LLM disconnected — check Ollama';

  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        fontSize: 11,
        fontWeight: 600,
        color,
        border: `1px solid ${color}44`,
        background: `${color}11`,
        cursor: 'default',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        transition: 'all 0.3s',
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: color,
          boxShadow: connectionStatus === 'connected' ? `0 0 6px ${color}` : 'none',
          animation: connectionStatus === 'testing' ? 'pulse 1s ease-in-out infinite' : 'none',
          transition: 'background 0.3s, box-shadow 0.3s',
        }}
      />
      {label}
    </span>
  );
}
