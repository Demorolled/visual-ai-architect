import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import CodeOutputPanel from './components/CodeOutputPanel';
import './index.css';
import './App.css';

const CODE_CHANNEL = 'visual-ai-code-output';

interface CodeSyncMessage {
  type: 'sync-request' | 'sync-response';
  payload?: any;
}

function CodeOutputApp() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Request sync from the main window
    const ch = new BroadcastChannel(CODE_CHANNEL);
    ch.postMessage({ type: 'sync-request' } as CodeSyncMessage);

    ch.onmessage = (event: MessageEvent<CodeSyncMessage>) => {
      if (event.data.type === 'sync-response') {
        setConnected(true);
      }
    };

    // Periodically check connection
    const interval = setInterval(() => {
      try {
        ch.postMessage({ type: 'sync-request' } as CodeSyncMessage);
      } catch {}
    }, 5000);

    return () => {
      ch.close();
      clearInterval(interval);
    };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--color-bg)' }}>
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 14px',
        background: 'var(--color-bg-raised)',
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
      }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>
          📄 Generated Code
        </h2>
        <span style={{
          fontSize: 11,
          color: connected ? 'var(--color-success)' : 'var(--color-text-dim)',
          fontWeight: 500,
        }}>
          {connected ? '● Connected' : '○ Waiting for project'}
        </span>
      </header>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <CodeOutputPanel />
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<CodeOutputApp />);
