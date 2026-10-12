import { useState, useEffect, useRef, useCallback } from 'react';
import { useProjectStore } from '../store/projectStore';
import { callLlmChat } from '../utils/llmClient';
import './CodeOutputPopout.css';

interface CodeEntry {
  id: string;
  label: string;
  language: string;
  code: string;
  timestamp: string;
  source: 'node' | 'message' | 'file';
}

interface CodeOutputPopoutProps {
  entry: CodeEntry;
  onClose: () => void;
}

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

function getLanguageLabel(lang: string): string {
  const labels: Record<string, string> = {
    javascript: 'JavaScript', js: 'JavaScript',
    typescript: 'TypeScript', ts: 'TypeScript',
    python: 'Python', py: 'Python',
    go: 'Go', rust: 'Rust', java: 'Java', csharp: 'C#', 'c#': 'C#',
    cpp: 'C++', 'c++': 'C++', swift: 'Swift', kotlin: 'Kotlin',
    php: 'PHP', ruby: 'Ruby', html: 'HTML', css: 'CSS', sql: 'SQL',
    json: 'JSON', yaml: 'YAML', yml: 'YAML', bash: 'Bash', sh: 'Bash',
    markdown: 'Markdown', md: 'Markdown',
  };
  return labels[lang.toLowerCase()] || lang || 'Unknown';
}

function storageKey(id: string, kind: 'notes' | 'chat'): string {
  return `cop-popout:${kind}:${id}`;
}

function loadNotes(id: string): string {
  try { return localStorage.getItem(storageKey(id, 'notes')) || ''; } catch { return ''; }
}

function loadChat(id: string): ChatMsg[] {
  try {
    const raw = localStorage.getItem(storageKey(id, 'chat'));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [{ role: 'assistant', content: 'I can help with this file — its code, why it exists, and how it fits the project. Ask anything, or press 🎤 to talk.' }];
}

export default function CodeOutputPopout({ entry, onClose }: CodeOutputPopoutProps) {
  const nodes = useProjectStore((s) => s.nodes);
  const updateNode = useProjectStore((s) => s.updateNode);

  const [notes, setNotes] = useState(() => loadNotes(entry.id));
  const [messages, setMessages] = useState<ChatMsg[]>(() => loadChat(entry.id));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [notesCopied, setNotesCopied] = useState(false);
  const [paused, setPaused] = useState(false);
  const [size, setSize] = useState(() => {
    const w = Math.min(660, Math.floor((window.innerWidth || 1300) * 0.92));
    const h = Math.min(640, Math.floor((window.innerHeight || 900) * 0.88));
    return { width: w, height: h };
  });
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Pause / Continue for this file's LLM chat — stops an in-flight response so
  // the user can add what they forgot, then resume.
  const pausedRef = useRef(false);
  const activeAbortRef = useRef<AbortController | null>(null);
  const lastSentRef = useRef('');
  // When resizing, the pointer leaves the panel so the mouse-up becomes a
  // click on the overlay — that must not close the pop-out.
  const suppressCloseRef = useRef(false);

  // Seed the notes box from the node's basis field when this entry is a node-backed file.
  const nodeEntry = entry.source === 'node' ? nodes.find((n) => n.id === entry.id.replace(/^node_/, '')) : undefined;

  useEffect(() => {
    if (nodeEntry && nodeEntry.data?.basis && !loadNotes(entry.id)) {
      setNotes(nodeEntry.data.basis);
    }
  }, [nodeEntry, entry.id]);

  useEffect(() => {
    try { localStorage.setItem(storageKey(entry.id, 'notes'), notes); } catch {}
  }, [entry.id, notes]);

  useEffect(() => {
    try { localStorage.setItem(storageKey(entry.id, 'chat'), JSON.stringify(messages)); } catch {}
  }, [entry.id, messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleNotesChange = useCallback((value: string) => {
    setNotes(value);
    if (nodeEntry) updateNode(nodeEntry.id, { basis: value });
  }, [nodeEntry, updateNode]);

  const copyNotes = useCallback(() => {
    navigator.clipboard?.writeText(notes).then(() => {
      setNotesCopied(true);
      setTimeout(() => setNotesCopied(false), 1200);
    }).catch(() => {});
  }, [notes]);

  const clearChat = useCallback(() => {
    const seed: ChatMsg[] = [{ role: 'assistant', content: 'I can help with this file — its code, why it exists, and how it fits the project. Ask anything, or press 🎤 to talk.' }];
    setMessages(seed);
  }, []);

  const send = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    pausedRef.current = false;
    setPaused(false);
    lastSentRef.current = t;
    const userMsg: ChatMsg = { role: 'user', content: t };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setBusy(true);
    const controller = new AbortController();
    activeAbortRef.current = controller;
    try {
      const context = [
        `You are helping the user debug and refine a single generated file in their app project.`,
        ``,
        `File: ${entry.label} (${entry.language}, ${entry.code.split('\n').length} lines)`,
        `User's notes on this file (its basis): ${notes || '(none yet)'}`,
        ``,
        `Code:`,
        `\`\`\``,
        entry.code,
        `\`\`\``,
        ``,
        `Answer questions about this file's code, purpose, and how it fits the project. Be concise and concrete. You may suggest edits (paste revised snippets when helpful) but do not claim you wrote them to disk.`,
      ].join('\n');
      const reply = await callLlmChat(history.map((m) => ({ role: m.role, content: m.content })), context, { maxTokens: 1024, ...(controller.signal ? { signal: controller.signal } : {}) });
      setMessages([...history, { role: 'assistant', content: reply }]);
    } catch (err: any) {
      setMessages([...history, { role: 'assistant', content: controller.signal.aborted ? '⏸ Paused — nothing was finished. Edit your message and press ▶ Continue.' : `⚠️ ${err?.message || 'LLM request failed'}` }]);
    } finally {
      if (activeAbortRef.current === controller) activeAbortRef.current = null;
      setBusy(false);
    }
  }, [busy, messages, entry, notes]);

  const handlePause = useCallback(() => {
    activeAbortRef.current?.abort();
    activeAbortRef.current = null;
    pausedRef.current = true;
    setPaused(true);
    // Bring back the last sent message so the user can add whatever they forgot.
    if (lastSentRef.current) setInput(lastSentRef.current);
  }, []);

  const handleContinue = useCallback(() => {
    pausedRef.current = false;
    setPaused(false);
    if (input.trim()) send(input);
  }, [input, send]);

  const toggleMic = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setListening(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (ev: SpeechRecognitionEvent) => {
      let transcript = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) transcript += ev.results[i][0].transcript;
      setInput(transcript);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    try { rec.start(); setListening(true); } catch { setListening(false); }
  }, [listening]);

  const speechAvailable = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const lineCount = entry.code.split('\n').length;

  // ── Resize via the bottom-right corner handle ──
  const handleResizeStart = useCallback((e: React.PointerEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    suppressCloseRef.current = true;
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startW: size.width, startH: size.height };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const vw = window.innerWidth || 1300;
      const vh = window.innerHeight || 900;
      const width = Math.max(420, Math.min(vw - 32, resizeRef.current.startW + (ev.clientX - resizeRef.current.startX)));
      const height = Math.max(400, Math.min(vh - 32, resizeRef.current.startH + (ev.clientY - resizeRef.current.startY)));
      setSize({ width, height });
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      // Release the suppress flag a tick later so the mouse-up's click event
      // (delivered on the overlay) doesn't close the pop-out.
      window.setTimeout(() => { suppressCloseRef.current = false; }, 60);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [size.width, size.height]);

  return (
    <div
      className="cop-popout-overlay"
      onClick={() => { if (suppressCloseRef.current) return; onClose(); }}
    >
      <div
        className="cop-popout"
        style={{ width: size.width, height: size.height }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      >
        {/* Header */}
        <div className="cop-popout-header">
          <span className="cop-popout-title">⤢ {entry.label}</span>
          <span className="cop-popout-lang">{getLanguageLabel(entry.language)}</span>
          <span className="cop-popout-lines">{lineCount} lines</span>
          <button
            className={`cop-popout-pr pause ${(busy && !paused) ? 'live' : ''} ${paused ? 'active' : ''}`}
            onClick={handlePause}
            disabled={!busy}
            title="Pause this file's LLM response so you can fix your message"
          >⏸</button>
          <button
            className={`cop-popout-pr resume ${paused ? 'active' : ''}`}
            onClick={handleContinue}
            disabled={busy && !paused}
            title="Continue — send your (possibly edited) message again"
          >▶</button>
          <button className="cop-popout-close" onClick={onClose} title="Close (Esc)">✕</button>
        </div>

        {/* Code */}
        <div className="cop-popout-code">
          <pre><code>{entry.code}</code></pre>
        </div>

        {/* Notes box */}
        <div className="cop-popout-notes">
          <div className="cop-popout-notes-head">
            <span className="cop-popout-label">📝 Notes — this file's basis</span>
            <button className="cop-popout-mini" onClick={copyNotes} title="Copy notes">
              {notesCopied ? '✅' : '📋'}
            </button>
          </div>
          <textarea
            className="cop-popout-notes-input"
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="Why does this file exist? What is it built on, what should it do?"
            spellCheck={false}
            rows={2}
          />
        </div>

        {/* Chat with the LLM */}
        <div className="cop-popout-chat">
          <div className="cop-popout-chat-head">
            <span className="cop-popout-label">💬 Talk to the LLM about this file</span>
            <button className="cop-popout-mini" onClick={clearChat} title="Clear chat history">
              ✕ Clear
            </button>
          </div>
          {paused && (
            <div className="cop-popout-paused-note">
              ⏸ <strong>Paused</strong> — nothing was finished. Edit your message, then press <strong>▶ Continue</strong>.
            </div>
          )}
          <div className="cop-popout-messages">
            {messages.map((m, i) => (
              <div key={i} className={`cop-popout-msg ${m.role}`}>
                <span className="cop-popout-role">{m.role === 'user' ? 'You' : 'LLM'}</span>
                <div className="cop-popout-bubble">{m.content}</div>
              </div>
            ))}
            {busy && <div className="cop-popout-msg assistant"><span className="cop-popout-role">LLM</span><div className="cop-popout-bubble typing">⏳ thinking…</div></div>}
            <div ref={messagesEndRef} />
          </div>
          <div className="cop-popout-inputrow">
            {speechAvailable && (
              <button
                className={`cop-popout-mic ${listening ? 'listening' : ''}`}
                onClick={toggleMic}
                title={listening ? 'Stop voice input' : 'Talk to the LLM with your voice'}
              >
                {listening ? '🛑' : '🎤'}
              </button>
            )}
            <textarea
              className="cop-popout-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (input.trim()) send(input); } }}
              placeholder="Ask the LLM about this file…"
              rows={1}
              spellCheck={false}
            />
            <button className="cop-popout-send" onClick={() => send(input)} disabled={busy || !input.trim()} title="Send (Enter)">➤</button>
          </div>
        </div>

        {/* Resize handle — bottom-right corner */}
        <div
          className="cop-popout-resize"
          onMouseDown={handleResizeStart}
          title="Drag to resize"
        >
          <span>╲</span>
        </div>
      </div>
    </div>
  );
}