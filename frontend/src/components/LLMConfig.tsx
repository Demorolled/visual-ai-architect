import { useState, useEffect, useCallback } from 'react';

const OLLAMA_URL = 'http://127.0.0.1:11434/v1';
const OLLAMA_MODEL = 'deepseek-r1:7b';

const LLMConfig: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'testing' | 'connected' | 'failed'>('idle');
  const [testResult, setTestResult] = useState<{ latencyMs: number; error?: string; fixHint?: string } | null>(null);
  const [ollamaRunning, setOllamaRunning] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      setChecking(true);
      try {
        const res = await fetch(`${OLLAMA_URL}/health`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          setOllamaRunning(true);
        }
      } catch {}
      setChecking(false);
    })();
  }, []);

  const handleTestConnection = useCallback(async () => {
    setStatus('testing');
    setTestResult(null);
    try {
      const start = Date.now();
      const res = await fetch(`${OLLAMA_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: [{ role: 'user', content: 'Reply with one word: OK' }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(10000),
      });
      const latencyMs = Date.now() - start;
      if (res.ok) {
        setStatus('connected');
        setTestResult({ latencyMs });
      } else {
        setStatus('failed');
        setTestResult({ latencyMs: 0, error: `Server returned ${res.status}`, fixHint: 'Check Ollama logs.' });
      }
    } catch {
      setStatus('failed');
      setTestResult({ latencyMs: 0, error: 'Connection failed', fixHint: 'Make sure Ollama is running (ollama serve).' });
    }
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>
        {checking ? 'Checking Ollama...' : ollamaRunning ? (
          <span>Connected to <strong>Ollama</strong> — <strong>{OLLAMA_MODEL}</strong></span>
        ) : (
          <span style={{ color: '#f87171' }}>Ollama not running — start with: ollama serve</span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button onClick={handleTestConnection} disabled={status === 'testing'}
          style={{
            fontSize: 10, padding: '3px 8px', border: `1px solid ${status === 'connected' ? '#4ade80' : status === 'failed' ? '#f87171' : '#4a4a6a'}`,
            background: status === 'testing' ? 'rgba(255,255,255,0.05)' : 'transparent',
            color: status === 'testing' ? '#888' : '#ccc', cursor: 'pointer',
          }}>
          {status === 'testing' ? 'Testing...' : status === 'connected' ? 'Connected' : status === 'failed' ? 'Retry Test' : 'Test Connection'}
        </button>
        {status === 'connected' && testResult && (
          <span style={{ fontSize: 10, color: '#4ade80' }}>{testResult.latencyMs}ms</span>
        )}
      </div>

      {!ollamaRunning && !checking && (
        <div style={{ fontSize: 10, color: '#fbbf24', padding: '4px 6px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
          Start Ollama with: <code>ollama serve</code>
          Then the DeepSeek R1 7B model will be available.
        </div>
      )}

      {status === 'failed' && testResult?.error && (
        <div style={{ fontSize: 10, color: '#f87171', padding: '4px 6px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
          <div>{testResult.error}</div>
          {testResult.fixHint && <div style={{ marginTop: 2, color: '#fbbf24' }}>{testResult.fixHint}</div>}
        </div>
      )}
    </div>
  );
};

export default LLMConfig;
