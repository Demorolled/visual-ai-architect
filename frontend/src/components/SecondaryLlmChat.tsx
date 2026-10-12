import { useState, useRef, useEffect, useCallback } from 'react';
import { useLlmStore } from '../store/llmStore';
import { callLlmChat } from '../utils/llmClient';

/**
 * Secondary chat pane — the "2nd LLM" side of the dual chat.
 *
 * When a reasoning role is assigned in Settings → LLM Connect (a 2nd LLM
 * connected to VACA), the main chat window splits vertically and this pane
 * takes the right half. Every message here goes out with `provider: 'reasoning'`
 * so it is ALWAYS answered by the connected 2nd LLM — never by the primary
 * VACA model (which owns the left pane) and never by the fast-chat worker.
 *
 * It is deliberately self-contained: its own conversation history (persisted
 * to localStorage) and its own input, so the user can chat with either LLM
 * while both are connected.
 */

interface SecondaryMessage {
  role: 'user' | 'ai';
  text: string;
  timestamp: string;
}

const SECONDARY_STORAGE_KEY = 'secondary-llm-messages';

function loadMessages(): SecondaryMessage[] {
  try {
    const stored = localStorage.getItem(SECONDARY_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].role && parsed[0].text !== undefined) {
        return parsed;
      }
    }
  } catch {}
  return [];
}

export default function SecondaryLlmChat() {
  const [messages, setMessages] = useState<SecondaryMessage[]>(loadMessages);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Label the connected 2nd LLM (best effort from the role assignment).
  const reasoning = useLlmStore((s) => s.roleAssignments?.reasoning);
  const secondaryLabel = secondaryLabelFor(reasoning);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    try {
      localStorage.setItem(SECONDARY_STORAGE_KEY, JSON.stringify(messages));
    } catch {}
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || isProcessing) return;
    const userMsg: SecondaryMessage = { role: 'user', text, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsProcessing(true);
    setError('');
    try {
      const reply = await callLlmChat([{ role: 'user', content: text }], undefined, {
        maxTokens: 1024,
        provider: 'reasoning',
      });
      const aiMsg: SecondaryMessage = { role: 'ai', text: reply || '(no reply)', timestamp: new Date().toISOString() };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      setError(err?.message || 'The 2nd LLM did not respond. Check its connection in Settings → LLM Connect.');
    } finally {
      setIsProcessing(false);
    }
  }, [input, isProcessing]);

  return (
    <div className="secondary-chat">
      <div className="secondary-chat-header">
        <span className="secondary-chat-title">🎸 LLM 2 — Connected 2nd LLM</span>
        {secondaryLabel && <span className="secondary-chat-model">{secondaryLabel}</span>}
      </div>
      <div className="terminal-messages secondary-chat-messages">
        {messages.length === 0 && !isProcessing && (
          <div className="secondary-chat-empty">
            This pane is bound to your connected 2nd LLM. Chat with it here — the left pane stays with VACA.
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`terminal-message ${msg.role}`}>
            <div className="message-row">
              <span className="message-role">{msg.role === 'user' ? '👤 You' : '🎸 LLM 2'}</span>
            </div>
            <span className="message-text">{msg.text}</span>
          </div>
        ))}
        {isProcessing && (
          <div className="secondary-chat-typing">⏳ LLM 2 is thinking…</div>
        )}
        {error && <div className="secondary-chat-error">⚠️ {error}</div>}
        <div ref={bottomRef} />
      </div>
      <div className="terminal-input-row secondary-chat-input-row">
        <textarea
          className="terminal-input"
          placeholder="Ask the 2nd LLM anything…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
        />
        <button className="terminal-send-btn" onClick={send} disabled={!input.trim() || isProcessing}>
          {isProcessing ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );
}

function secondaryLabelFor(reasoning: unknown): string {
  if (reasoning && typeof reasoning === 'object' && 'baseUrl' in (reasoning as any)) {
    const base = (reasoning as any).baseUrl as string;
    const model = (reasoning as any).model as string;
    const host = base?.replace(/^https?:\/\//, '').replace(/\/.*$/, '') || '';
    return model ? `${model} · ${host}` : host;
  }
  if (typeof reasoning === 'string') return reasoning;
  return '';
}
