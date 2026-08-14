import { useState, useRef, useEffect, useCallback } from 'react';
import { useProjectStore, getNextNodeId } from '../store/projectStore';
import { useLlmStore } from '../store/llmStore';
import { SCALE_OPTIONS, detectScaleFromText, estimateScaleFromFeatures } from '../types';
import type { OSType, AppScale } from '../types';
import { ReasoningMessage, subscribeReasoning, requestReasoningSync, broadcastReasoningMessage } from '../utils/reasoningSync';
import { speak, stopSpeaking, warmupAudio, wantsCodeToWords } from '../utils/tts';
import { io } from 'socket.io-client';
import { callLlmChat } from '../utils/llmClient';
import { pushReasoningMessage } from '../utils/sharedTerminalContext';
import { analyzeEmotion, clientSideAnalyze, EmotionResult, EMOTION_ICONS, getUserStateLabel, setSharedEmotion } from '../utils/emotionEngine';
import { getPersonality, buildPersonalityPrompt, syncPersonalityFromSoul } from '../utils/emotionConfig';
import { getSystemContextPrompt, getVisionContext, getModelFactsPrompt } from '../utils/systemAwareness';
import { autoLearn } from '../utils/autoLearn';
import { isNodeQuery, buildNodeContext } from '../utils/nodeContext';
import { detectSessionHistoryIntent } from '../utils/sessionHistory';
import { detectWikiIntent } from '../utils/wikiIntent';
import { detectTodoIntent } from '../utils/todoIntent';
import VeronicaPrism from './VeronicaPrism';
import MessageReactions from './MessageReactions';
import './TerminalSection.css';

/**
 * Injected into the full chat system prompt so the LLM naturally mentions the
 * GUI preview capability when it senses a build request. Worded to stay
 * truthful: the mockup window opens automatically only before any code exists
 * (the frontend fires it), and the 🖥 Show Preview button always works.
 */
const PREVIEW_MENTION_RULE = `
[GUI PREVIEW — PLATFORM CAPABILITY — mention this naturally]
When the user asks you to build, create, design, or preview an app:
• If the app has NOT been generated yet, a GUI preview window opens automatically showing how the app's interface should look (layout, modules, colors). Mention it in ONE short sentence in your reply, e.g. "I've opened a GUI preview of how it will look."
• Tell them they can click ⚡ Build This Now to generate the actual code from that preview.
• If the app is already generated, instead mention the 🖥 Show Preview button to reopen the live preview anytime.
• Never claim a preview opened when the user is just chatting — only when they asked to build/show/preview an app. Keep it to one sentence, don't over-explain.`;

/**
 * Injected into the full chat system prompt so the LLM knows a real session
 * history window opens when the user asks about past sessions — and can say so
 * truthfully (the exact bug this fixes: it claimed a GUI preview opened when
 * the user asked about session history, and nothing actually happened). The
 * frontend fires the window itself; the model just mentions it.
 */
const SESSION_HISTORY_RULE = `
[SESSION HISTORY — PLATFORM CAPABILITY — mention this naturally]
When the user asks to see their session history, past sessions, saved sessions, or "what we did before":
• A session history window opens automatically (the frontend fires it) showing three tabs: the recent conversation, build history, and saved sessions.
• Mention it in ONE short sentence in your reply, e.g. "I've opened your session history — here's what we've been working on."
• NEVER claim the GUI preview / planned-interface mockup opened for a session-history question. That preview is only for app build/preview requests. Stay truthful.`;

/**
 * Injected into the full chat system prompt so the LLM knows a real wiki
 * window (modelVeronice.txt) opens when the user asks to see the wiki — and
 * says so truthfully instead of claiming a GUI preview opened.
 */
const WIKI_RULE = `
[WIKI — PLATFORM CAPABILITY — mention this naturally]
When the user asks to see your wiki / the wiki / your knowledge base file ("show your wiki", "open the wiki"):
• A wiki window opens automatically (the frontend fires it) showing modelVeronice.txt with a searchable section list.
• Mention it in ONE short sentence in your reply, e.g. "I've opened my wiki — it has 55 sections. Here's the latest."
• NEVER claim the GUI preview / planned-interface mockup opened for a wiki question. That preview is only for app build/preview requests. Stay truthful.
• If the user asks to WRITE to the wiki ("write this into your wiki"), that is the memory-write feature — a window does NOT open; the platform appends a section for you.`;

/**
 * Injected into the full chat system prompt so the LLM knows a real todo
 * window (TODO fixes.txt) opens when the user asks to see the todo list — and
 * says so truthfully instead of claiming a GUI preview opened.
 */
const TODO_RULE = `
[TODO LIST — PLATFORM CAPABILITY — mention this naturally]
When the user asks to see the todo list / your todo list / the deep-scan tasks ("open the todo list", "show me what's on your todo list"):
• A todo window opens automatically (the frontend fires it) showing the deep-scan TODO fixes.txt: 8 sections with checkbox items, priorities, and a search box.
• Mention it in ONE short sentence in your reply, e.g. "I've opened the todo list — 32 items open, including X P0 items."
• NEVER claim the GUI preview / planned-interface mockup opened for a todo-list question. That preview is only for app build/preview requests. Stay truthful.
• If the user asks to WRITE to the todo list ("add X to the todo list", "mark 2.1 done"), that is an update request — the window does NOT open; handle it conversationally.`;

const NEUTRAL_EMOTION: EmotionResult = {
  probabilities: {
    joy: 0, sadness: 0, anger: 0, fear: 0, surprise: 0,
    disgust: 0, trust: 0, anticipation: 0, neutral: 1,
  },
  dominant: 'neutral',
  confidence: 1,
  rawScores: { neutral: 1 },
  valence: 0,
  arousal: 0,
  dominance: 0.5,
};

/** Shared input style for the editable UNDERSTOOD INTENT card (Part 4). */
const intentInputStyle = { width: '100%', background: 'rgba(0,0,0,0.35)', color: '#eee', border: '1px solid #333', borderRadius: 0, padding: '4px 8px', fontSize: 12, marginTop: 2 } as const;

/**
 * Render the per-file write results from a /write-code (or /interactive)
 * response. Consumes the canonical `files` array (P0 API fix, Aug 7 2026) —
 * every entry is a successfully-written file, so each gets ✅ — and surfaces
 * any non-written entries from the legacy `written` array (skipped/error) as
 * explicit ❌ lines so failures stay visible.
 */
function formatWriteResults(writeData: any): string {
  const okLines = (writeData.files || []).map((f: any) => `  ✅ \`${f.path}\``).join('\n');
  const failLines = (writeData.written || [])
    .filter((w: any) => w.status !== 'written')
    .map((w: any) => `  ❌ \`${w.path}\` — ${w.status}`)
    .join('\n');
  return [okLines, failLines].filter(Boolean).join('\n');
}

/**
 * Render the behavioral-gate verdicts (renderSmoke + cliSmoke) that the
 * backend returns on /write-code — the "compiles but doesn't work" checks that
 * tsc cannot see. Surfaces a PASSED gate as a green ✅ line and a FAILED gate
 * as an explicit ❌ with the runtime error(s) the probe saw, mirroring the
 * tsc compileWarning pattern. `skipped` / `unavailable` verdicts are omitted
 * (nothing actionable — the gate didn't apply or couldn't run).
 */
function formatSmokeVerdicts(writeData: any): string {
  const lines: string[] = [];
  const gates: Array<{ key: string; label: string }> = [
    { key: 'renderSmoke', label: 'UI render' },
    { key: 'cliSmoke', label: 'CLI run' },
  ];
  for (const gate of gates) {
    const v = writeData?.[gate.key];
    if (!v || typeof v.status !== 'string') continue;
    if (v.status === 'passed') {
      lines.push(`  ✅ **${gate.label} gate passed**${v.detail ? ` — ${v.detail}` : ''}`);
    } else if (v.status === 'failed') {
      const errs = Array.isArray(v.errors) && v.errors.length
        ? '\n' + v.errors.slice(0, 6).map((e: string) => `      • ${e}`).join('\n')
        : '';
      lines.push(`  ❌ **${gate.label} gate FAILED**${v.detail ? ` — ${v.detail}` : ''}${errs}`);
    }
    // skipped / unavailable: omit — the gate didn't apply or couldn't run.
  }
  return lines.length ? `\n\n**Behavioral checks:**\n${lines.join('\n')}` : '';
}

/**
 * Detect if the user is asking to build/create/make an app.
 * Returns the extracted goal, purpose, and target OS, or null if no build intent.
 */
function detectBuildIntent(text: string): { goal: string; purpose: string; os: string } | null {
  const lower = text.toLowerCase().trim();

  // Build patterns — these trigger proactive node creation
  // Extended suffix list covers all common app/product descriptors
  const appSuffixes = 'app|application|program|tool|system|software|website|site|webapp|dashboard|platform|game|service|api|cli|gui|widget|view|page|module|plugin|extension|component|editor|player|viewer|reader|handler|manager|engine|client|server|builder|maker|studio|browser|explorer|designer|creator|generator|analyzer|converter|parser|renderer|processor|tracker|monitor|logger|tester|runner|loader|installer|launcher|watcher|scanner|cleaner|controller|adapter|bridge|wrapper|proxy|gateway|interface|connector|mapper|filter|decorator|interceptor';
  const buildPatterns = [
    new RegExp(`(?:build|create|make|design|generate|develop|code)\\s+(?:me\\s+)?(?:a|an|the|my|another|new)\\s+(\\w[\\w\\s]*(?:${appSuffixes}))`, 'i'),
    new RegExp(`(?:i\\s+(?:want\\s+(?:to\\s+)?)?(?:build|create|make|design|generate|develop|code)\\s+)(?:a|an|the|my|another|new)?\\s*(\\w[\\w\\s]*(?:${appSuffixes}))`, 'i'),
    new RegExp(`(?:let'?s?\\s+)(?:build|create|make|design|generate|develop|code)\\s+(?:a|an|the|my|another|new)?\\s*(\\w[\\w\\s]*(?:${appSuffixes}))`, 'i'),
    new RegExp(`^(?:build|create|make|design|generate|develop|code)\\s+(?:a|an|the)?\\s*(\\w[\\w\\s]*(?:${appSuffixes}))`, 'i'),
  ];

  // Check basic negative patterns — don't trigger for questions or casual talk
  const negativePatterns = [
    /how\s+(?:to|do|can|would|should|does)/i,
    /what\s+(?:is|are|does|would|should)/i,
    /can\s+(?:you|i|we)\s+(?:tell|explain|describe|show|list)/i,
    /tell\s+me\s+(?:about|how|what)/i,
    /explain\s+/i,
    /describe\s+/i,
    /(?:have\s+you|did\s+you|do\s+you)\s+(?:ever|built|created|made)/i,
  ];

  // Skip if it's a question about building rather than a command to build
  for (const neg of negativePatterns) {
    if (neg.test(lower)) return null;
  }

  // Also skip very short messages or messages about existing projects
  if (lower.length < 15) return null;
  if (/already|existing|current|previous|my\s+(?:last|old|other)/i.test(lower)) return null;

  // Try to extract goal and purpose
  for (const pattern of buildPatterns) {
    const match = lower.match(pattern);
    if (match) {
      // Extract the app description as goal
      let goal = match[1]?.trim() || '';
      // Clean up trailing punctuation/words
      goal = goal.replace(/[\.\,\!\?]+$/, '').trim();
      // Don't append 'app' if the goal already ends with a known suffix (e.g., "News Widget", "Text Editor")
      const knownSuffixes = appSuffixes.split('|');
      const goalLower = goal.toLowerCase();
      const hasKnownSuffix = knownSuffixes.some(s => goalLower.endsWith(s));
      if (!hasKnownSuffix && !goalLower.includes('app')) {
        goal = goal + ' app';
      }

      // Try to extract purpose from the text (after "that/that/for/to")
      let purpose = '';
      const purposeMatch = lower.match(/(?:that|which|for|to)\s+(\w[\w\s]+)/i);
      if (purposeMatch) {
        purpose = purposeMatch[1].replace(/[\.\,\!\?]+$/, '').trim().substring(0, 200);
      }

      // Try to detect target OS
      let os = 'linux';
      if (/windows|win|microsoft/i.test(lower)) os = 'windows';
      else if (/mac\s*(?:os)?|macos|apple|iphone|ios|ipad|macintosh/i.test(lower)) os = 'mac';
      else if (/iphone|ios|ipad|ipod/i.test(lower)) os = 'ios';
      else if (/android|google\s+pixel|samsung/i.test(lower)) os = 'android';

      return { goal, purpose, os };
    }
  }

  return null;
}

/**
 * Auto-open the planned-interface mockup when a build request is sensed — no
 * button click needed. Two triggers:
 *   1. A build request ("build me a pomodoro timer") — detectBuildIntent.
 *   2. An explicit preview ask ("show me a preview of a chess app").
 * Only fires while NOTHING has been generated yet: once the app is built, the
 * live preview / canvas take over and we don't pop a window on every message.
 * The goal is carried to the smart preview (requestPreview) so App.tsx shows
 * the mockup for exactly what the user described.
 */
/**
 * Settings toggle (ProjectManager → Auto GUI Preview). ON by default; when
 * OFF the chat never auto-opens the mockup window — the explicit 🖥 Show
 * Preview button still works.
 */
function isAutoPreviewEnabled(): boolean {
  try {
    return localStorage.getItem('vaia-auto-preview') !== 'false';
  } catch {
    return true;
  }
}

function maybeShowSessionHistory(userText: string): void {
  if (!detectSessionHistoryIntent(userText)) return;
  // Small delay so the window pops just after the message sends (mirrors the
  // auto-preview timing) and never fights the send animation.
  window.setTimeout(() => {
    useProjectStore.getState().requestSessionHistory();
  }, 700);
}

function maybeShowWiki(userText: string): void {
  if (!detectWikiIntent(userText)) return;
  window.setTimeout(() => {
    useProjectStore.getState().requestWiki();
  }, 700);
}

function maybeShowTodo(userText: string): void {
  if (!detectTodoIntent(userText)) return;
  window.setTimeout(() => {
    useProjectStore.getState().requestTodo();
  }, 700);
}

function maybeAutoPreview(userText: string): void {
  if (!isAutoPreviewEnabled()) return;
  const st = useProjectStore.getState();
  if (!!st.sitePreviewUrl || st.nodes.some(n => n.data?.generatedCode)) return;

  const intent = detectBuildIntent(userText);
  const explicitAsk =
    /(?:show|see|give|get)\s+me?\s*(?:a|the)?\s*(?:gui\s+)?(?:preview|mockup)/i.test(userText) ||
    /(?:preview|mockup)\s+(?:of|for)\s+/i.test(userText);

  let goal = intent?.goal || '';
  if (!goal && explicitAsk) {
    goal = userText
      .replace(/^(?:can\s+you\s+)?(?:please\s+)?(?:show|see|display|give|get)\s+me?\s*(?:a|the)?\s*(?:gui\s+)?(?:preview|mockup)\s*(?:of|for)?\s*/i, '')
      .replace(/^(?:preview|mockup)\s+(?:of|for)\s*/i, '')
      .trim();
  }
  if (!goal) return;

  // Small delay so the window pops just after the message sends (avoids
  // stealing focus mid-send), and re-check in case a build finished instantly.
  window.setTimeout(() => {
    const s = useProjectStore.getState();
    if (!!s.sitePreviewUrl || s.nodes.some(n => n.data?.generatedCode)) return;
    s.requestPreview(goal);
  }, 700);
}

const REASONING_STORAGE_KEY = 'reasoning-messages';
const REASONING_SCALE_KEY = 'reasoning-build-scale';

function createInitialMsg(): ReasoningMessage {
  return { role: 'ai', text: '', timestamp: new Date().toISOString() };
}

function loadMessages(): ReasoningMessage[] {
  try {
    const stored = localStorage.getItem(REASONING_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].role && parsed[0].text !== undefined) {
        return parsed;
      }
    }
  } catch {}
  return [createInitialMsg()];
}

function saveMessages(messages: ReasoningMessage[]) {
  try {
    localStorage.setItem(REASONING_STORAGE_KEY, JSON.stringify(messages));
  } catch {}
}

type AssistantState = 'idle' | 'listening' | 'processing' | 'speaking';

const ReasoningPanel: React.FC = () => {
  const { reasoningDetached, setReasoningDetached } = useProjectStore();
  const [messages, setMessages] = useState<ReasoningMessage[]>(loadMessages);
  const [input, setInput] = useState('');
  // Program scale picked visually with the S/M/L/XL pills; sent as { scale }
  // on plan-code / write-code / architect-plan so builds match the chosen size.
  const [buildScale, setBuildScale] = useState<AppScale>(() => {
    try {
      const stored = localStorage.getItem(REASONING_SCALE_KEY);
      if (stored === 'small' || stored === 'medium' || stored === 'large' || stored === 'enterprise') return stored;
    } catch {}
    return 'medium';
  });
  const [isProcessing, setIsProcessing] = useState(false);
  // Live codegen progress streamed over Socket.IO (P2: the one-shot write call
  // is opaque and can run for minutes — show phase-level status while it runs).
  const [codegenStatus, setCodegenStatus] = useState('');

  // ── Live codegen progress via Socket.IO (generation_progress / architect_progress) ──
  useEffect(() => {
    const socket = io({ path: '/ws', transports: ['websocket', 'polling'], reconnection: true, reconnectionDelay: 2000 });
    socket.on('generation_progress', (data: { phase: string; percent: number; message?: string; generatingNodes?: string[]; batch?: number; totalBatches?: number }) => {
      if (data.phase === 'done') {
        if (data.message && data.message.startsWith('❌')) {
          setCodegenStatus(data.message); // show the failure briefly
          window.setTimeout(() => setCodegenStatus(''), 6000);
        } else {
          setCodegenStatus('');
        }
        return;
      }
      if (data.phase === 'starting') { setCodegenStatus('⚡ Starting code generation…'); return; }
      if (data.message) { setCodegenStatus(data.message); return; }
      if (data.generatingNodes?.length) {
        const batch = data.totalBatches && data.totalBatches > 1 ? ` (${(data.batch || 0) + 1}/${data.totalBatches})` : '';
        setCodegenStatus(`⏳ Generating${batch}: ${data.generatingNodes.join(', ')}`);
        return;
      }
      setCodegenStatus(`⏳ ${data.phase} — ${data.percent}%`);
    });
    socket.on('architect_progress', (data: { phase: string; message?: string }) => {
      if (data.phase === 'done' || data.phase === 'error') { setCodegenStatus(''); return; }
      if (data.message) setCodegenStatus(data.message);
    });
    return () => { socket.disconnect(); };
  }, []);
  const [isListening, setIsListening] = useState(false);
  const [connected, setConnected] = useState(true);
  const [assistantEnabled, setAssistantEnabled] = useState(false);
  const [assistantState, setAssistantState] = useState<AssistantState>('idle');
  const [isTyping, setIsTyping] = useState(false);
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const [speechUnsupported, setSpeechUnsupported] = useState(false);
  const [panelHeight, setPanelHeight] = useState(() => {
    // Ensure panel starts at a reasonable size — clamp to 40% of viewport height
    const maxInit = Math.floor(window.innerHeight * 0.4);
    return Math.min(280, maxInit);
  });
  const [lastEmotion, setLastEmotion] = useState<EmotionResult>(NEUTRAL_EMOTION);
  const [veronicaAction, setVeronicaAction] = useState<{action:string;result:string;spoken:string}|null>(null);
  const [toast, setToast] = useState<{message:string;type:'pause'|'resume'}|null>(null);
  const [llm1Status, setLlm1Status] = useState<'unknown' | 'connected' | 'disconnected' | 'testing'>('unknown');
  const [llm1Latency, setLlm1Latency] = useState<number | null>(null);
  const [pendingQuestions, setPendingQuestions] = useState<any[] | null>(null);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({});
  // Tracks which choice questions the user is answering with a custom typed
  // response instead of one of the preset radio options (question key -> true).
  const [customAnswerKeys, setCustomAnswerKeys] = useState<Record<string, boolean>>({});
  const [pendingIntent, setPendingIntent] = useState<any | null>(null);   // extracted intent from plan-code (Part 4)
  const [intentDraft, setIntentDraft] = useState<any | null>(null);       // editable copy shown in the intent card

  // Use shared LLM store for connection state
  const llmConnectionStatus = useLlmStore(s => s.connectionStatus);
  const llmLatency = useLlmStore(s => s.latency);
  const llmTestConnection = useLlmStore(s => s.testConnection);

  useEffect(() => {
    if (llmConnectionStatus === 'connected') {
      setLlm1Status('connected');
      setLlm1Latency(llmLatency);
    } else if (llmConnectionStatus === 'testing') {
      setLlm1Status('testing');
    } else if (llmConnectionStatus === 'disconnected') {
      setLlm1Status('disconnected');
    }
  }, [llmConnectionStatus, llmLatency]);

  // Also test on visibility change
  useEffect(() => {
    const handleVisible = () => { if (!document.hidden) llmTestConnection(); };
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('focus', handleVisible);
    return () => {
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('focus', handleVisible);
    };
  }, [llmTestConnection]);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emotionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const reasoningWindowRef = useRef<Window | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const assistantRecRef = useRef<SpeechRecognition | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const assistantBufferRef = useRef('');
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const assistantSpeakingRef = useRef(false);
  const assistantEnabledRef = useRef(false);
  const assistantStateRef = useRef<AssistantState>('idle');
  const userIsTypingRef = useRef(false);
  const restartLockRef = useRef(false);
  // True once the user manually clicks a scale pill this session — manual
  // picks win over feature-count auto-detection (explicit size words in the
  // message itself still win, since they describe the request).
  const scaleTouchedRef = useRef(false);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    dragRef.current = { startY: e.clientY, startH: panelHeight };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const maxPanel = Math.floor(window.innerHeight * 0.4);
      const newHeight = dragRef.current.startH - (ev.clientY - dragRef.current.startY);
      setPanelHeight(Math.max(80, Math.min(maxPanel, newHeight)));
    };
    const onUp = () => { dragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    e.preventDefault();
  }, [panelHeight]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Detach / Reattach
  useEffect(() => {
    if (reasoningDetached) {
      const w = window.open('/reasoning.html', 'reasoning-window', 'width=600,height=500,menubar=no,toolbar=no');
      if (w) reasoningWindowRef.current = w;
      else setReasoningDetached(false);
    } else {
      if (reasoningWindowRef.current && !reasoningWindowRef.current.closed) {
        reasoningWindowRef.current.close();
      }
      reasoningWindowRef.current = null;
    }
  }, [reasoningDetached]);

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  // Persist the chosen scale so it survives reloads
  useEffect(() => {
    try { localStorage.setItem(REASONING_SCALE_KEY, buildScale); } catch {}
  }, [buildScale]);

  // Sync via BroadcastChannel
  useEffect(() => {
    const unsub = subscribeReasoning(
      (msg) => {
        setMessages((prev) => {
          if (prev.some((m) => m.timestamp === msg.timestamp && m.text === msg.text)) return prev;
          return [...prev, msg];
        });
      },
      () => {
        try {
          const ch = new BroadcastChannel('visual-ai-reasoning');
          ch.postMessage({ type: 'sync-response', payload: { messages: messagesRef.current } });
          ch.close();
        } catch {}
      },
      () => {
        localStorage.removeItem(REASONING_STORAGE_KEY);
        setMessages([createInitialMsg()]);
      },
      // onSyncResponse — populate messages if we're empty (e.g. just-opened popup)
      (incoming) => {
        if (!incoming || incoming.length === 0) return;
        setMessages((prev) => {
          // Only accept if we have only the initial empty message
          if (prev.length > 1 || (prev.length === 1 && prev[0].text.trim())) return prev;
          return incoming;
        });
        // Also persist to localStorage so the cache is correct
        saveMessages(incoming);
      },
    );
    requestReasoningSync();
    return () => unsub();
  }, []);

  const handleSpeak = useCallback((text: string, index: number) => {
    if (speakingId === index) {
      stopSpeaking();
      setSpeakingId(null);
      return;
    }
    setSpeakingId(index);
    speak(text, () => setSpeakingId(null), { codeToWords: true });
  }, [speakingId]);

  const startListening = useCallback(() => {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) return;

    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);

      // ── If user says "Veronica" during push-to-talk, also trigger the assistant ──
      const lower = transcript.toLowerCase();
      if ((lower.includes('veronica') || lower.includes('venorica')) && assistantEnabledRef.current) {
        // Stop push-to-talk so the assistant can take over
        recognition.stop();
        setIsListening(false);
        // Forward what was said after the wake word to the assistant
        const wakeIdx = Math.max(
          lower.indexOf('veronica'),
          lower.indexOf('venorica'),
        );
        const afterWake = transcript.slice(wakeIdx + 8).trim();
        if (afterWake) {
          setInput(afterWake);
          // Trigger the send so the assistant processes it
          setTimeout(() => {
            const sendBtn = document.querySelector('.terminal-send-btn') as HTMLButtonElement;
            if (sendBtn && !sendBtn.disabled) sendBtn.click();
          }, 100);
        }
      }
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
      // ── User clicked — this is a user gesture. Restart the assistant too. ──
      // Must call synchronously (not via setTimeout) so Chrome's user activation
      // is still in effect for the assistant's SpeechRecognition.start().
      if (assistantEnabledRef.current && !assistantSpeakingRef.current) {
        startAssistantCycle();
      }
    } catch {
      setIsListening(false);
    }
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) stopListening();
    else startListening();
  }, [isListening, startListening, stopListening]);

  const speechAvailable = useCallback((): boolean => {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }, []);

  const stopAssistant = useCallback(() => {
    assistantRecRef.current?.stop();
    assistantRecRef.current = null;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    assistantEnabledRef.current = false;
    assistantStateRef.current = 'idle';
    setAssistantEnabled(false);
    setAssistantState('idle');
    assistantBufferRef.current = '';
    assistantSpeakingRef.current = false;
  }, []);

  /** Analyze emotion for a user text, set badge, and return the result */
  const analyzeVoiceEmotion = useCallback(async (text: string) => {
    try {
      const emotion = await analyzeEmotion(text);
      setLastEmotion(emotion);
      setSharedEmotion(emotion);
      if (emotionTimeoutRef.current) clearTimeout(emotionTimeoutRef.current);
      emotionTimeoutRef.current = setTimeout(() => setLastEmotion(NEUTRAL_EMOTION), 12000);
      return emotion;
    } catch {
      const fallback = clientSideAnalyze(text);
      setLastEmotion(fallback);
      setSharedEmotion(fallback);
      if (emotionTimeoutRef.current) clearTimeout(emotionTimeoutRef.current);
      emotionTimeoutRef.current = setTimeout(() => setLastEmotion(NEUTRAL_EMOTION), 12000);
      return fallback;
    }
  }, []);

  /**
   * INTERACTIVE CLI: Try to plan and write code using the new interactive endpoints.
   * This shows the user a step-by-step plan, asks questions, then writes the files.
   * Returns a formatted message string or null if no code-writing intent detected.
   */
  const tryInteractiveCodeWrite = useCallback(async (userText: string, scale: AppScale): Promise<string | null> => {
    const intent = detectBuildIntent(userText);
    if (!intent) return null;

    // Step 1: Call plan-code to get a structured plan with files + questions
    let planResponse;
    try {
      const res = await fetch('/api/reason/plan-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: `${intent.goal} — ${intent.purpose}`.trim(), scale }),
        signal: AbortSignal.timeout(30000),
      });
      planResponse = await res.json();
    } catch {
      return null; // Fall through to normal flow
    }

    if (!planResponse?.success || !planResponse?.plan) return null;

    const plan = planResponse.plan;

    // If there are no files in the plan, something went wrong
    if (!plan.files || plan.files.length === 0) {
      if (plan.reasoning) {
        return `📋 **Planning ${intent.goal}**\n\n${plan.reasoning}`;
      }
      return null;
    }

    // Build a nice display of the plan
    const fileList = plan.files.map((f: any, i: number) =>
      `  \`${i + 1}. ${f.path}\` — ${f.summary} (${f.language})`
    ).join('\n');

    let message = `📋 **Planning: ${intent.goal}**\n\n`;
    if (plan.reasoning) {
      message += `*${plan.reasoning}*\n\n`;
    }
    message += `**Files to create:**\n${fileList}\n`;

    // If there are questions, ask the user and we'll handle the loop
    if (plan.questions && plan.questions.length > 0) {
      // Normalize to the structured schema (legacy string questions -> {key, question})
      const questions = (plan.questions || []).map((q: any, i: number) =>
        typeof q === 'string' ? { key: `q${i + 1}`, question: q, type: 'text' } : q
      );
      message += `\n\n**Questions:**\n`;
      message += questions.map((q: any, i: number) => {
        const opts = q.options && q.options.length ? ` (${q.options.join(' / ')})` : '';
        return `  ❓ ${i + 1}. ${q.question || q}${opts}`;
      }).join('\n');
      message += `\n\n_Please answer the questions above (or use the answer box below) so I can write the code correctly._`;

      // Store the pending plan + structured questions for the answer form
      pendingPlanRef.current = { request: `${intent.goal} — ${intent.purpose}`, plan, questions, scale };
      setPendingQuestions(questions);
      const defaults: Record<string, string> = {};
      questions.forEach((q: any, i: number) => {
        const key = q.key || `q${i + 1}`;
        defaults[key] = (q.options && q.options.length ? q.options[0] : '') || '';
      });
      setDraftAnswers(defaults);
      setCustomAnswerKeys({});
      // Part 4 (intent card): stash the extracted intent so the UI can show it
      // as an editable card, and the corrected spec goes out with write-code.
      const extracted = planResponse.intent || null;
      setPendingIntent(extracted);
      setIntentDraft(extracted ? { ...extracted, coreFeatures: Array.isArray(extracted.coreFeatures) ? [...extracted.coreFeatures] : [] } : null);

      return message;
    }

    // No questions — write the code directly
    try {
      setCodegenStatus('⚡ Starting code generation…');
      const writeRes = await fetch('/api/reason/write-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: `${intent.goal} — ${intent.purpose}`, plan, answers: {}, scale, ...(planResponse.intent ? { intent: planResponse.intent } : {}) }),
        signal: AbortSignal.timeout(1800000), // one-shot (≤600s) + per-file fallback (≤5×140s) can total ~20 min — allow 30 min
      });
      const writeData = await writeRes.json();
      setCodegenStatus('');

      if (writeData.success && (writeData.files || writeData.written)) {
        placePlanNodesOnCanvas(`${intent.goal} — ${intent.purpose}`, plan, scale);
        const results = formatWriteResults(writeData);
        const where = writeData.exportDir ? `\n📂 Files written to: \`${writeData.exportDir}\`` : '';
        // Surface the behavioral-gate verdicts (render/CLI smoke) the backend
        // returned — a FAILED gate means the app compiles but doesn't work.
        const smokeVerdicts = formatSmokeVerdicts(writeData);
        return `${message}\n\n━━━ **Writing Files** ━━━\n${results}\n\n${writeData.summary || ''}${smokeVerdicts}${where}\n\n🏗️ I also placed the app structure on the canvas — open the architect view to see the nodes.`;
      }

      return `${message}\n\n⚠️ Code generation failed. ${writeData.error || 'Unknown error'}`;
    } catch {
      setCodegenStatus(''); // fetch rejected (timeout/network) — never leave the status stuck
      return `${message}\n\n⚠️ Code writing request timed out or failed.`;
    }
  }, []);

  /**
   * Try to build an app from the user's text by calling the architect API directly.
   * Returns { nodes, edges, summary } or null if it couldn't (no build intent or API failed).
   */
  const tryBuildApp = useCallback(async (userText: string, scale: AppScale): Promise<{
    nodes: any[];
    edges: any[];
    summary: string;
    goal: string;
    purpose: string;
    os: string;
  } | null> => {
    const intent = detectBuildIntent(userText);
    if (!intent) return null;

    try {
      const res = await fetch('/api/architect/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: intent.goal,
          purpose: intent.purpose,
          targetOS: intent.os,
          scale,
        }),
        signal: AbortSignal.timeout(120000), // 2 min timeout for LLM to plan
      });

      if (!res.ok) return null;

      const data = await res.json();
      if (data.success && data.nodes?.length > 0) {
        // Place nodes on the canvas
        const store = useProjectStore.getState();
        let masterId = store.nodes.find(n => n.type === 'master')?.id;

        // If there's no master node, create one so the wizard UI works
        if (!masterId) {
          masterId = `node_master_${Date.now()}`;
          store.addNode({
            id: masterId,
            type: 'master',
            position: { x: 250, y: 50 },
            data: {
              label: 'App Blueprint',
              type: 'master',
              status: 'pending' as const,
              appGoal: intent.goal,
              appPurpose: intent.purpose || '',
              selectedOS: intent.os as OSType,
              scale,
            },
          });
        } else {
          // Keep an existing master node in sync with the chosen scale so the
          // canvas selector and the pill selector always agree.
          store.updateNode(masterId, { scale });
        }

        store.replaceNodes(data.nodes, data.edges, intent.os as OSType, masterId);
        store.setUserGoal(intent.goal);
        store.setUserPurpose(intent.purpose);
        store.setProjectName(intent.goal.substring(0, 40));
        store.setWizardStep('filling-nodes');

        const nodeTypes = [...new Set(data.nodes.map((n: any) => n.type))].join(', ');
        const lang = [...new Set(data.nodes.map((n: any) => n.data?.language || 'typescript'))].join(', ');
        const summary = `Built architecture: ${data.nodes.length} nodes (${nodeTypes}) in ${lang} — placed on the canvas.`;

        return {
          nodes: data.nodes,
          edges: data.edges,
          summary,
          goal: intent.goal,
          purpose: intent.purpose,
          os: intent.os,
        };
      }
    } catch (err) {
      console.warn('[ReasoningPanel] Architect plan failed:', err);
    }

    return null;
  }, []);

  // ── Ref to store pending plan while waiting for user answers ──
  const pendingPlanRef = useRef<{ request: string; plan: any; questions: any[]; scale: AppScale } | null>(null);

  /**
   * Build canvas nodes from a written plan so the visual editor reflects the app.
   * One node per planned file, typed by filename hint, chained in file order.
   */
  const placePlanNodesOnCanvas = useCallback((request: string, plan: any, scale?: AppScale) => {
    const files = plan?.files || [];
    if (!files.length) return;
    const store = useProjectStore.getState();
    let masterId = store.nodes.find(n => n.type === 'master')?.id;
    if (!masterId) {
      masterId = getNextNodeId();
      store.addNode({
        id: masterId,
        type: 'master',
        position: { x: 250, y: 50 },
        data: { label: 'App Blueprint', type: 'master', status: 'pending' as const, appGoal: request, appPurpose: '', scale: scale || 'medium' },
      });
    } else if (scale) {
      // Sync an existing master node's scale with the one used for this build.
      store.updateNode(masterId, { scale });
    }
    const nodes: any[] = [];
    const edges: any[] = [];
    let prevId: string | null = null;
    files.forEach((f: any, i: number) => {
      const id = getNextNodeId();
      const path: string = f.path || `file-${i + 1}.${f.language || 'ts'}`;
      const lower = path.toLowerCase();
      const type = /(ui|view|screen|client|render)/.test(lower) ? 'ui'
        : /(db|database|store|storage|repo)/.test(lower) ? 'database'
        : /(main|entry|input|io|cli|index)/.test(lower) ? 'input'
        : 'logic';
      nodes.push({
        id,
        type,
        position: { x: 150 + (i % 3) * 220, y: 280 + Math.floor(i / 3) * 170 },
        data: {
          label: (path.split('/').pop() || path).replace(/\.[^.]+$/, ''),
          description: f.summary || '',
          type,
          status: 'pending' as const,
          language: f.language || 'typescript',
          appGoal: request,
          appPurpose: '',
        },
      });
      if (prevId) edges.push({ id: `edge_${id}`, source: prevId, target: id });
      prevId = id;
    });
    store.replaceNodes(nodes, edges, 'linux', masterId);
    store.setUserGoal(request);
    store.setProjectName(request.substring(0, 40));
    store.setWizardStep('filling-nodes');
  }, []);

  /**
   * Shared write-code call: POSTs the plan + answers, renders per-file results,
   * places the node graph. Used by BOTH the free-text answer path and the
   * structured answer form so behavior stays consistent.
   */
  const writeCodeForPlan = useCallback(async (request: string, plan: any, answers: Record<string, string>, intentOverride?: any, scale: AppScale = 'medium'): Promise<string> => {
    try {
      setCodegenStatus('⚡ Starting code generation…');
      const writeRes = await fetch('/api/reason/write-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request, plan, answers, scale, ...(intentOverride ? { intent: intentOverride } : {}) }),
        signal: AbortSignal.timeout(1800000), // one-shot (≤600s) + per-file fallback (≤5×140s) can total ~20 min — allow 30 min
      });
      const writeData = await writeRes.json();
      setCodegenStatus('');

      if (writeData.success && (writeData.files || writeData.written)) {
        placePlanNodesOnCanvas(request, plan, scale);
        const results = formatWriteResults(writeData);
        const fileList = plan.files.map((f: any, i: number) =>
          `  \`${i + 1}. ${f.path}\` — ${f.summary}`
        ).join('\n');
        const where = writeData.exportDir ? `\n📂 Files written to: \`${writeData.exportDir}\`` : '';
        // #1 codegen-depth: surface a surviving compile failure explicitly —
        // the independent tsc gate is the authority, and silent "success" with
        // type errors is exactly what the audit flagged.
        const compileWarning = (writeData.tscErrors ?? 0) > 0 || writeData.compileStatus === 'errors'
          ? `\n\n⚠️ **Compile warning:** the independent tsc gate found ${writeData.tscErrors ?? 0} error(s) still in the generated code — the files were written, but review them before running.`
          : '';
        // Behavioral-gate verdicts (render/CLI smoke): a FAILED gate means the
        // app compiles but doesn't run/renders broken — surface it next to the
        // compile warning so silent "success" never hides a dead app.
        const smokeVerdicts = formatSmokeVerdicts(writeData);
        return `📋 **Plan (answers received):**\n${fileList}\n\n━━━ **Writing Files** ━━━\n${results}\n\n${writeData.summary || ''}${compileWarning}${smokeVerdicts}${where}\n\n🏗️ I also placed the app structure on the canvas — open the architect view to see the nodes.`;
      }
      return `⚠️ Code generation failed after getting your answers. ${writeData.error || 'Unknown error'}`;
    } catch {
      setCodegenStatus(''); // fetch rejected (timeout/network) — never leave the status stuck
      return '⚠️ Code writing failed. Please try again.';
    }
  }, [placePlanNodesOnCanvas]);

  /** Submit the structured (radio/dropdown) answers from the answer box. */
  const submitStructuredAnswers = useCallback(async () => {
    if (isProcessing) return; // double-submit guard
    const pending = pendingPlanRef.current;
    if (!pending || !pending.questions.length) return;
    const answers: Record<string, string> = {};
    pending.questions.forEach((q: any, i: number) => {
      const key = q.key || `q${i + 1}`;
      let val = (draftAnswers[key] || '').trim();
      // If the user selected "Type your own…" but left it blank, fall back to
      // the first preset option — sending "(user confirmed)" for a question
      // that had concrete options is meaningless to the writer.
      if (!val && customAnswerKeys[key] && q.options && q.options.length > 0) {
        val = q.options[0];
      }
      answers[key] = val || '(user confirmed)';
    });
    pendingPlanRef.current = null;
    setPendingQuestions(null);
    setPendingIntent(null);
    setIntentDraft(null);
    setCustomAnswerKeys({});
    setIsProcessing(true);
    const reply = await writeCodeForPlan(pending.request, pending.plan, answers, intentDraft, pending.scale || 'medium');
    const aiMsg: ReasoningMessage = { role: 'ai', text: reply, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, aiMsg]);
    broadcastReasoningMessage(aiMsg);
    pushReasoningMessage('ai', reply);
    setIsProcessing(false);
  }, [draftAnswers, customAnswerKeys, writeCodeForPlan, isProcessing, intentDraft]);

  /**
   * A clarifying question is NOT an answer: ends in '?' or starts with an
   * unambiguous wh- question word (what/which/who/...). We deliberately do NOT
   * treat aux-verb starts (is/are/should/do...) alone as questions, because
   * real answers like "should be text-based" or "do a simple minimax" begin
   * that way and would otherwise be mis-routed back to the LLM.
   */
  const isClarifyingQuestion = useCallback((text: string): boolean => {
    const t = text.trim();
    if (!t) return false;
    if (t.endsWith('?')) return true;
    return /^(what|which|who|whom|when|where|why|how)\b/i.test(t);
  }, []);

  const processUserRequest = useCallback(async (userText: string): Promise<{ reply: string; isAction: boolean }> => {
    // ── Step 0: Check if this is an answer to pending questions ──
    const pending = pendingPlanRef.current;
    if (pending && pending.questions.length > 0) {
      // If the user asks a clarifying question instead of answering, keep the plan
      // pending and route the question to the LLM for a helpful reply.
      if (isClarifyingQuestion(userText)) {
        try {
          const planFiles = (pending.plan.files || []).map((f: any, i: number) =>
            `  ${i + 1}. ${f.path} (${f.language}) — ${f.summary}`
          ).join('\n');
          const system = `You are helping the user build: "${pending.request}".\n\nPlanned files:\n${planFiles}\n\nWe asked the user these questions (they have NOT answered yet):\n${pending.questions.map((q: any, i: number) => `  ${i + 1}. ${q.question || q}`).join('\n')}\n\nThe user just asked a follow-up question instead of answering. Answer it helpfully and concisely (2-4 sentences), referencing the plan where relevant. Do NOT write any code yet — the plan is still awaiting their answers.`;
          const reply = await callLlmChat([{ role: 'user', content: userText }], system, { maxTokens: 300 });
          return { reply, isAction: false };
        } catch {
          return { reply: 'That looks like a question — go ahead and answer my earlier questions (or tell me to change the plan) and I will write the code.', isAction: true };
        }
      }

      // Treat the user's text as answers to all questions (one per line or comma-separated)
      pendingPlanRef.current = null;
      setPendingQuestions(null);
      setPendingIntent(null);
      setIntentDraft(null);
      setCustomAnswerKeys({});

      // Build answers from user text, keyed by question key (legacy strings use qN)
      const answerLines = userText.split(/\n|,/).map((s: string) => s.trim()).filter(Boolean);
      const answers: Record<string, string> = {};
      pending.questions.forEach((q: any, i: number) => {
        const key = q.key || `q${i + 1}`;
        answers[key] = answerLines[i] || answerLines[0] || '(user confirmed)'; // fallback
      });

      // If there's only one answer, apply it to all questions
      if (answerLines.length === 1 && pending.questions.length > 1) {
        pending.questions.forEach((q: any, i: number) => { answers[q.key || `q${i + 1}`] = answerLines[0]; });
      }

      // Write the code with the user's answers (shared path) — includes any
      // corrected intent from the editable UNDERSTOOD INTENT card.
      const reply = await writeCodeForPlan(pending.request, pending.plan, answers, intentDraft, pending.scale || 'medium');
      return { reply, isAction: true };
    }

    // ── Session history: asking to see the session history opens a real
    //    window (conversation / builds / saved sessions) instead of the chat
    //    just claiming one. Runs before the preview so it wins. ──
    maybeShowSessionHistory(userText);
    maybeShowWiki(userText);
    maybeShowTodo(userText);

    // ── Auto GUI preview: sensing a build request (or an explicit "show me a
    //    preview") opens the planned-interface mockup automatically when
    //    nothing has been generated yet. ──
    maybeAutoPreview(userText);

    // ── Scale selection: explicit size words always win; otherwise estimate
    //    from the number of features described (unless the user picked a pill
    //    manually this session); finally fall back to the current pill. ──
    const explicitScale = detectScaleFromText(userText);
    const featureScale = estimateScaleFromFeatures(userText);
    const effectiveScale = explicitScale || (!scaleTouchedRef.current ? featureScale : null) || buildScale;
    if (effectiveScale !== buildScale) setBuildScale(effectiveScale);

    // ── Step 1: Try interactive code write (new CLI-style flow) ──
    const interactiveResult = await tryInteractiveCodeWrite(userText, effectiveScale);
    if (interactiveResult) {
      return { reply: interactiveResult, isAction: true };
    }

    // ── Step 2: Check if user wants to build an app — if so, call architect directly ──
    const buildResult = await tryBuildApp(userText, effectiveScale);

    // ── SHORT CIRCUIT: If build intent detected and architect succeeded, skip LLM chat ──
    if (buildResult) {
      const nodeTypes = [...new Set(buildResult.nodes.map((n: any) => n.type))].join(', ');
      const lang = [...new Set(buildResult.nodes.map((n: any) => n.data?.language || 'typescript'))].join(', ');
      const reply = `🏗️ **Built your ${buildResult.goal}** — ${buildResult.nodes.length} nodes (${nodeTypes}) in ${lang}\n\nI've placed the complete architecture on the canvas. You can:\n• Click any node to edit its description or code\n• Click **Generate Code** in the toolbar to write all files\n• Ask me to explain the architecture or suggest improvements`;
      return { reply, isAction: true };
    }

    // ── If build intent detected but architect failed, explain what happened ──
    const intent = detectBuildIntent(userText);
    if (intent) {
      const failReply = `⚠️ Tried to build **${intent.goal}** but the architecture engine didn't respond in time.\n\nThis can happen when:\n• The LLM is still warming up — try again in a moment\n• The app description is too complex — try a simpler goal first\n• The model is overloaded — type the same request again\n\n💡 **Tip:** You can also create nodes manually using the toolbar, or ask me to help design the architecture step by step.`;
      return { reply: failReply, isAction: true };
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // P1: pull the tuned soul traits (data/soul.json) into the chat prompt —
        // the Soul Settings panel writes there, so the model should feel it.
        await syncPersonalityFromSoul();
        const personality = getPersonality();
        const personalityPrompt = buildPersonalityPrompt(personality);
        // P2: inject truthful self-knowledge (model file, size, VRAM) so the
        // model answers "how big are you?" from measured facts, not guesses.
        let modelFacts = '';
        try { modelFacts = await getModelFactsPrompt(); } catch (err) { console.warn('[ModelFacts] getModelFactsPrompt failed:', err); }
        const systemContext = await getSystemContextPrompt();
        let visionContext = '';
        try { visionContext = await getVisionContext(); } catch (err) { console.warn('[Vision] getVisionContext failed:', err); }
        // For short/greeting messages, enforce strict brevity; for real questions, use full context
        const isShortQuery = userText.trim().length < 20;
        const system = isShortQuery
          ? `CRITICAL RULES (YOU MUST FOLLOW ALL):\n1. Respond in at most 1-2 sentences.\n2. For greetings like 'hi', 'sup', 'hello', 'hey', just say a brief greeting back.\n3. Do NOT generate articles, facts, dates, Wikipedia-style content, or any memorized text.\n4. Do NOT output a date like "Monday, January 1, 2000" or any date format.\n5. Do NOT start with a date or a Wikipedia-style introduction.\n6. Keep it short, conversational, and relevant to what was just said.\n7. If you are unsure how to respond, just say a simple greeting back.\n\nREMEMBER: You are a coding assistant bot, not a textbook. Do not output training data.`
          : `${personalityPrompt}${modelFacts}${systemContext}${visionContext}${PREVIEW_MENTION_RULE}${SESSION_HISTORY_RULE}${WIKI_RULE}${TODO_RULE}`;
        const maxTk = isShortQuery ? 40 : 1024;

        // ── Build conversation messages as a proper message array ──
        // FIX: Previously this concatenated history into a single string with
        // "User:" and "Assistant:" prefixes, which caused the model to continue
        // generating the chat template pattern (multi-turn hallucination bug).
        // Now each message gets its own role in the API call.
        const historyMessages = messagesRef.current.filter(m => m.text.trim() && m.text.length > 0);
        const llmMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

        // ── Read current project state ──
        const projectState = useProjectStore.getState();
        const hasNodes = projectState.nodes.length > 0;
        const isNodeQuestion = isNodeQuery(userText);

        // ── FIX: When user asks about nodes and project has nodes, 
        // INJECT project context as FOREGROUND messages instead of relying 
        // solely on the system prompt. This prevents the LLM from being
        // distracted by hallucinated conversation history.
        let systemPromptSuffix = '';
        if (hasNodes && isNodeQuestion) {
          // Node/canvas query with project loaded:
          // 1. DON'T send poisoned conversation history (it may contain
          //    hallucinated content about unrelated topics like Webflow)
          // 2. Instead, inject the project context directly into the
          //    message flow right before the user's question
          // 3. This makes it IMPOSSIBLE for the LLM to ignore
          
          const nodeTypes = [...new Set(projectState.nodes.filter((n: any) => n.type !== 'master').map((n: any) => n.type))].join(', ');
          const projectSummary =
            `[SYSTEM CONTEXT — The user has a project loaded on the canvas. IGNORE any previous conversation that mentions unrelated topics like Webflow or other tools.]\n` +
            `Project: ${projectState.projectName || 'Untitled'}\n` +
            `Goal: ${projectState.userGoal || '(not set)'}\n` +
            `Target OS: ${projectState.targetOS}\n` +
            `Canvas: ${projectState.nodes.length} nodes (${nodeTypes || 'none'}), ${projectState.edges.length} edges.\n` +
            `When asked about my canvas/nodes/nods, I MUST describe THIS project — not any other tool or topic.`;
          
          llmMessages.push({ role: 'user', content: projectSummary });
          
          // Full canvas scan
          const fullContext = buildNodeContext();
          if (fullContext) {
            llmMessages.push({ role: 'user', content:
              `[CANVAS SCAN — Full node details from the current project. Use this to answer the user's question.]\n\n${fullContext}\n\nIMPORTANT: If the user typed "nods" or "nood" they meant "nodes" — answer about the architecture nodes on the canvas. DO NOT talk about Webflow, p5.js, or any other unrelated topic.` });
          }
        } else {
          // Regular conversation (not asking about nodes):
          // Send conversation history with project context in system prompt
          
          if (historyMessages.length > 0) {
            const recent = historyMessages.slice(-8);
            for (const m of recent) {
              llmMessages.push({
                role: m.role === 'user' ? 'user' : 'assistant',
                content: m.text,
              });
            }
          }

          if (hasNodes) {
            const nodeTypes = [...new Set(projectState.nodes.filter((n: any) => n.type !== 'master').map((n: any) => n.type))].join(', ');
            systemPromptSuffix += `\n\n[CURRENT PROJECT]\nProject: ${projectState.projectName || 'Untitled'}\nGoal: ${projectState.userGoal || '(not set)'}\nPurpose: ${projectState.userPurpose || '(not set)'}\nTarget OS: ${projectState.targetOS}\nNodes on canvas: ${projectState.nodes.length}\nEdges: ${projectState.edges.length}\nNode types: ${nodeTypes || 'none'}`;
          } else {
            systemPromptSuffix += '\n\n[CURRENT PROJECT]\nThe canvas is currently empty — no app is loaded. The user can build a new app by describing what they want to create.';
          }
        }

        // Add the current user message LAST (after context injection)
        llmMessages.push({ role: 'user', content: userText });

        // Build enhanced system prompt 
        const enhancedSystem = system + systemPromptSuffix;

        // Use new callLlmChat which sends messages with proper roles
        const reply = await callLlmChat(llmMessages, enhancedSystem, { maxTokens: maxTk });
        setConnected(true);

        return { reply, isAction: false };
      } catch {
        if (attempt === 0) {
          await new Promise(r => setTimeout(r, 600));
          continue;
        }
        setConnected(false);
        return { reply: '⚠️ Error: LLM 1 not reachable. Check connection settings.', isAction: false };
      }
    }
    setConnected(false);
    return { reply: '⚠️ Error: LLM 1 not reachable. Check connection settings.', isAction: false };
  }, [tryBuildApp, writeCodeForPlan, placePlanNodesOnCanvas, intentDraft, buildScale]);

  // ─── Try direct action, then desktop control, then reasoning ──────
  const veronicaProcess = useCallback(async (userText: string): Promise<string> => {
    const { reply } = await processUserRequest(userText);
    return reply;
  }, [processUserRequest]);

  const restartAssistant = useCallback(() => {
    if (restartLockRef.current) return;
    restartLockRef.current = true;
    if (!assistantEnabledRef.current) { restartLockRef.current = false; return; }
    if (userIsTypingRef.current) { restartLockRef.current = false; return; }
    if (assistantSpeakingRef.current) { restartLockRef.current = false; return; }

    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) { restartLockRef.current = false; return; }

    const rec = new SpeechRecognitionClass();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;

    let wakeHeard = false;
    let wakeResultIndex = -1;
    let promptBuffer = '';
    let recStopped = false;

    const scheduleRestart = () => {
      if (recStopped) return;
      recStopped = true;
      setTimeout(() => { restartLockRef.current = false; restartAssistant(); }, 200);
    };

    const resetSilenceTimer = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        if (!wakeHeard || !promptBuffer.trim()) return;
        recStopped = true;
        assistantStateRef.current = 'processing';
        setAssistantState('processing');
        rec.stop();
        const userText = promptBuffer.trim();
        promptBuffer = '';
        wakeHeard = false;

        setVeronicaAction(null);
        const userMsg: ReasoningMessage = { role: 'user', text: userText, timestamp: new Date().toISOString() };
        setMessages((prev) => [...prev, userMsg]);
        broadcastReasoningMessage(userMsg);
        pushReasoningMessage('user', userText);
        warmupAudio();
        analyzeVoiceEmotion(userText);

        const finishAndRestart = () => {
          assistantStateRef.current = 'idle';
          setAssistantState('idle');
          assistantSpeakingRef.current = false;
          restartLockRef.current = false;
          restartAssistant();
        };

        veronicaProcess(userText).then((reply) => {
          const aiMsg: ReasoningMessage = { role: 'ai', text: reply, timestamp: new Date().toISOString() };
          setMessages((prev) => [...prev, aiMsg]);
          broadcastReasoningMessage(aiMsg);
          assistantStateRef.current = 'speaking';
          setAssistantState('speaking');
          assistantSpeakingRef.current = true;
          speak(reply, finishAndRestart, { codeToWords: wantsCodeToWords(userText) });
        }).catch(() => {
          setConnected(false);
          const err = '⚠️ Error: LLM 1 not reachable. Check connection settings.';
          const aiMsg: ReasoningMessage = { role: 'ai', text: err, timestamp: new Date().toISOString() };
          setMessages((prev) => [...prev, aiMsg]);
          broadcastReasoningMessage(aiMsg);
          finishAndRestart();
        });
      }, 2500);
    };

    const detectedWake = (t: string) => {
      const l = t.toLowerCase();
      const idxV = l.indexOf('veronica');
      const idxN = l.indexOf('venorica');
      if (idxV < 0 && idxN < 0) return { found: false, idx: -1, len: 0 };
      const idx = idxV >= 0 && idxN >= 0 ? Math.min(idxV, idxN) : (idxV >= 0 ? idxV : idxN);
      return { found: true, idx, len: 8 };
    };

    rec.onresult = (event) => {
      if (recStopped) return;
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }

      if (!wakeHeard && !assistantSpeakingRef.current) {
        const wake = detectedWake(transcript);
        if (wake.found) {
          wakeHeard = true;
          wakeResultIndex = event.resultIndex;
          promptBuffer = transcript.slice(wake.idx + wake.len).trim();
          assistantStateRef.current = 'listening';
          setAssistantState('listening');
          resetSilenceTimer();
        }
      } else if (wakeHeard && !assistantSpeakingRef.current) {
        let full = '';
        for (let i = wakeResultIndex; i < event.results.length; i++) {
          full += event.results[i][0].transcript + ' ';
        }
        const wake = detectedWake(full);
        if (wake.found) full = full.slice(wake.idx + wake.len);
        promptBuffer = full.trim();
        resetSilenceTimer();
      }

      if (assistantSpeakingRef.current) {
        const wake = detectedWake(transcript);
        if (wake.found) {
          stopSpeaking();
          assistantSpeakingRef.current = false;
          wakeHeard = true;
          wakeResultIndex = event.resultIndex;
          promptBuffer = transcript.slice(wake.idx + wake.len).trim();
          assistantStateRef.current = 'listening';
          setAssistantState('listening');
          resetSilenceTimer();
        }
      }
    };

    rec.onerror = () => {
      if (recStopped) return;
      if (!assistantEnabledRef.current) return;
      scheduleRestart();
    };

    rec.onend = () => {
      if (recStopped) return;
      if (!assistantEnabledRef.current) return;
      scheduleRestart();
    };

    if (assistantRecRef.current) {
      try { assistantRecRef.current.stop(); } catch {}
    }
    assistantRecRef.current = rec;
    try { rec.start(); } catch { scheduleRestart(); }
    restartLockRef.current = false;
  }, [veronicaProcess, analyzeVoiceEmotion]);

  const startAssistantCycle = useCallback(() => {
    restartLockRef.current = false;
    if (assistantRecRef.current) {
      try { assistantRecRef.current.stop(); } catch {}
      assistantRecRef.current = null;
    }
    restartAssistant();
  }, [restartAssistant]);

  const showToast = useCallback((message: string, type: 'pause' | 'resume') => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2000);
  }, []);

  const toggleAssistant = useCallback(() => {
    if (assistantEnabled) {
      stopAssistant();
      return;
    }
    if (!speechAvailable()) {
      setSpeechUnsupported(true);
      return;
    }
    setSpeechUnsupported(false);
    assistantEnabledRef.current = true;
    assistantStateRef.current = 'idle';
    setAssistantEnabled(true);
    setAssistantState('idle');
    setTimeout(() => startAssistantCycle(), 100);
  }, [assistantEnabled, startAssistantCycle, stopAssistant, speechAvailable]);

  // ── Detect user typing in any text input — pause speech rec to avoid focus steal ──
  useEffect(() => {
    const INPUT_SELECTOR = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, [contenteditable="true"], [contenteditable=""]';

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.matches && target.matches(INPUT_SELECTOR)) {
        userIsTypingRef.current = true;
        setIsTyping(true);
        // Pause assistant speech rec while user is typing
        if (assistantRecRef.current && assistantEnabledRef.current) {
          try {
            assistantRecRef.current.stop();
            showToast('🎙 Assistant paused (typing...)', 'pause');
          } catch {}
        }
      }
    };

    const handleFocusOut = (e: FocusEvent) => {
      const relatedTarget = e.relatedTarget as HTMLElement | null;
      // Only resume if focus is moving to something that's not also an input
      if (relatedTarget && relatedTarget.matches && relatedTarget.matches(INPUT_SELECTOR)) {
        return; // still on another input
      }
      userIsTypingRef.current = false;
      setIsTyping(false);
      // Resume assistant if it was enabled
      if (assistantEnabledRef.current && !assistantSpeakingRef.current) {
        showToast('🎙 Assistant resumed', 'resume');
        setTimeout(() => startAssistantCycle(), 300);
      }
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, [startAssistantCycle]);

  // Clean up toast timer on unmount
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Auto-enable voice assistant (only if SpeechRecognition is available)
  useEffect(() => {
    const supported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!supported) {
      setSpeechUnsupported(true);
      return;
    }
    // Wait for slide-up overlay animation to finish before auto-enabling
    const t = setTimeout(() => {
      if (!assistantEnabledRef.current) {
        toggleAssistant();
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [toggleAssistant]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isProcessing) return;

    warmupAudio();

    setInput('');
    setIsProcessing(true);

    // Analyze emotion of user's message
    try {
      const emotion = await analyzeEmotion(text);
      setLastEmotion(emotion);
      setSharedEmotion(emotion);
      if (emotionTimeoutRef.current) clearTimeout(emotionTimeoutRef.current);
      emotionTimeoutRef.current = setTimeout(() => {
        setLastEmotion(NEUTRAL_EMOTION);
      }, 8000);
    } catch {
      const fallback = clientSideAnalyze(text);
      setLastEmotion(fallback);
      setSharedEmotion(fallback);
      if (emotionTimeoutRef.current) clearTimeout(emotionTimeoutRef.current);
      emotionTimeoutRef.current = setTimeout(() => setLastEmotion(NEUTRAL_EMOTION), 8000);
    }

    const userMsg: ReasoningMessage = { role: 'user', text, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    broadcastReasoningMessage(userMsg);
    pushReasoningMessage('user', text);

    // Normal mode: analyze emotion
    try {
      const emotion = await analyzeEmotion(text);
      setLastEmotion(emotion);
      setSharedEmotion(emotion);
      if (emotionTimeoutRef.current) clearTimeout(emotionTimeoutRef.current);
      emotionTimeoutRef.current = setTimeout(() => {
        setLastEmotion(NEUTRAL_EMOTION);
      }, 8000);
    } catch {
      const fallback = clientSideAnalyze(text);
      setLastEmotion(fallback);
      setSharedEmotion(fallback);
      if (emotionTimeoutRef.current) clearTimeout(emotionTimeoutRef.current);
      emotionTimeoutRef.current = setTimeout(() => setLastEmotion(NEUTRAL_EMOTION), 8000);
    }

    const { reply, isAction } = await processUserRequest(text);
    const aiMsg: ReasoningMessage = { role: 'ai', text: reply, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, aiMsg]);
    broadcastReasoningMessage(aiMsg);
    pushReasoningMessage('ai', reply);
    // Auto-learn: capture complete conversation turn (prompt + actual response as a single record)
    autoLearn.conversation(text, reply, { source: 'reasoning-panel' });
    if (!isAction) speak(reply, () => {}, { codeToWords: wantsCodeToWords(text) });
    setIsProcessing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  if (reasoningDetached) {
    return (
      <div className="terminal-section" style={{ borderColor: '#a855f7', height: panelHeight }}>
        <div className="terminal-resize-handle" onMouseDown={handleResizeStart} />
        <div className="terminal-header">
          <div className="terminal-header-left">
            <span className={`thinking-indicator ${isProcessing ? 'thinking' : ''}`} title={isProcessing ? 'Processing...' : 'Idle'}>
              <span className="thinking-dot" />
              <span className="thinking-label">{isProcessing ? 'Thinking' : 'Idle'}</span>
            </span>
            <span className="terminal-title" style={{ color: '#4a9eff' }}>LLM 1 — Reasoning & Design</span>
          </div>
          <div className="terminal-header-right">
            <button className="roadmap-reattach-btn" onClick={() => setReasoningDetached(false)}>
              ↩ Reattach
            </button>
          </div>
        </div>
        <div className="terminal-detached-msg">
          <span>Terminal running in separate window</span>
        </div>
      </div>
    );
  }

  return (
    <div className="terminal-section" style={{ borderColor: '#a855f7', height: panelHeight }}>
      <div className="terminal-resize-handle" onMouseDown={handleResizeStart} />
      <div className="terminal-header">
        <div className="terminal-header-left">
          <span className={`thinking-indicator ${isProcessing ? 'thinking' : ''}`} title={isProcessing ? 'Processing...' : 'Idle'}>
            <span className="thinking-dot" />
            <span className="thinking-label">{isProcessing ? 'Thinking' : 'Idle'}</span>
          </span>
          <span className="terminal-title" style={{ color: '#4a9eff' }}>LLM 1 — Reasoning & Design</span>
        </div>
        <div className="terminal-header-right">
          <span
            className="terminal-status"
            title={llm1Status === 'disconnected' ? 'LLM 1 not reachable — check Settings' :
                   llm1Status === 'testing' ? 'Testing backend connection...' :
                   llm1Latency ? `${llm1Latency}ms latency` : ''}
            style={{
              color: llm1Status === 'connected' ? '#4ade80' :
                     llm1Status === 'testing' ? '#f59e0b' :
                     llm1Status === 'disconnected' ? '#f87171' :
                     isProcessing ? '#f59e0b' :
                     connected ? '#4ade80' : '#f87171'
            }}
          >
            {isProcessing ? '⏳ Processing...' :
             llm1Status === 'testing' ? '🔌 Testing...' :
             llm1Status === 'disconnected' ? '⨯ LLM 1 Offline' :
             llm1Status === 'connected' ? `● ${llm1Latency || ''}ms` :
             connected ? '● Connected' : '⨯ Disconnected'}
          </span>
          <button
            className={`assistant-btn ${assistantEnabled ? 'active' : ''}`}
            onClick={toggleAssistant}
            title={assistantEnabled ? 'Disable voice assistant' : 'Enable voice assistant'}
          >
            🎙
          </button>
          <button
            className="terminal-clear-btn"
            onClick={() => {
              localStorage.removeItem(REASONING_STORAGE_KEY);
              setMessages([createInitialMsg()]);
              pendingPlanRef.current = null;
              setPendingQuestions(null);
              setPendingIntent(null);
              setIntentDraft(null);
              setCustomAnswerKeys({});
            }}
            title="Clear conversation"
          >
            🗑
          </button>
          <button
            className="terminal-restart-btn"
            onClick={() => {
              localStorage.removeItem(REASONING_STORAGE_KEY);
              setMessages([createInitialMsg()]);
              pendingPlanRef.current = null;
              setPendingQuestions(null);
              setCustomAnswerKeys({});
              useProjectStore.getState().clearProject();
              useProjectStore.getState().setWizardStep('welcome');
            }}
            title="Restart from beginning"
          >
            🔄
          </button>
          <button className="terminal-detach-btn" onClick={() => setReasoningDetached(true)} title="Detach to separate window">
            ↗
          </button>
        </div>
      </div>
      {/* Toast notification */}
      {toast && (
        <div
          style={{
            position: 'absolute',
            top: 44,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            padding: '5px 14px',
            fontSize: 12,
            fontWeight: 600,
            border: `1px solid ${toast.type === 'pause' ? '#f59e0b66' : '#4ade8066'}`,
            borderRadius: 0,
            background: toast.type === 'pause' ? 'rgba(245,158,11,0.12)' : 'rgba(74,222,128,0.12)',
            color: toast.type === 'pause' ? '#f59e0b' : '#4ade80',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            animation: 'toast-slidein 0.2s ease-out',
          }}
        >
          {toast.message}
        </div>
      )}
      <div className="terminal-messages">
        {speechUnsupported && (
          <div className="assistant-indicator" style={{ color: '#f87171' }}>
            ⚠️ Speech recognition not supported in this browser. Use Chrome/Edge.
          </div>
        )}
        {assistantEnabled && !speechUnsupported && (
          <div className={`assistant-indicator ${assistantState}`}>
            {assistantState === 'idle' && !isTyping && (
              <span>
                🎧 Waiting for "Veronica"/"Venorica"...
                <span style={{ marginLeft: 8, fontSize: 10, opacity: 0.7 }}>
                  last: {EMOTION_ICONS[lastEmotion.dominant]} {getUserStateLabel(lastEmotion)}
                </span>
              </span>
            )}
            {isTyping && (
              <span>
                ⏸ Paused (typing)
              </span>
            )}
            {assistantState === 'listening' && '🎤 Listening...'}
            {assistantState === 'processing' && (
              <span>
                ⏳ Thinking...
                <span style={{ marginLeft: 8, fontSize: 10, opacity: 0.7 }}>
                  {EMOTION_ICONS[lastEmotion.dominant]} {getUserStateLabel(lastEmotion)}
                </span>
              </span>
            )}
            {assistantState === 'speaking' && '🔊 Speaking...'}
          </div>
        )}
        {/* Veronica Action Display */}
        {veronicaAction && (
          <div style={{
            margin: '4px 12px',
            padding: '8px 12px',
            background: 'rgba(0, 217, 255, 0.08)',
            border: '1px solid rgba(0, 217, 255, 0.25)',
            borderRadius: 0,
            fontSize: 12,
            color: '#eee',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
          }}>
            <span style={{ fontSize: 20 }}>🖥️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: '#00d9ff', marginBottom: 2 }}>
                Veronica: {veronicaAction.action.replace(/_/g, ' ')}
              </div>
              <div style={{ color: '#aaa', fontSize: 11 }}>{veronicaAction.result}</div>
              <div style={{ color: '#4ade80', fontSize: 11, marginTop: 4, fontStyle: 'italic' }}>
                "{veronicaAction.spoken}"
              </div>
            </div>
            <button
              onClick={() => setVeronicaAction(null)}
              style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 14, padding: '2px 4px', lineHeight: 1 }}
            >✕</button>
          </div>
        )}
        {messages.filter((m) => m.text.trim()).map((msg, i) => (
          <div key={i} className={`terminal-message ${msg.role}`}>
            <div className="message-row">
              <span className="message-role">{msg.role === 'user' ? '👤 You' : <><VeronicaPrism width={13} height={16} style={{ marginRight: 2, verticalAlign: 'middle' }} /> LLM 1</>}</span>
              {msg.role === 'ai' && (
                <button
                  className={`speak-btn ${speakingId === i ? 'speaking' : ''}`}
                  onClick={() => handleSpeak(msg.text, i)}
                  title={speakingId === i ? 'Stop' : 'Read aloud'}
                >
                  {speakingId === i ? '⏹' : '🔊'}
                </button>
              )}
              {msg.role === 'ai' && (
                <button
                  className="preview-btn-msg"
                  onClick={() => {
                    // Carry the user's own request that led to this reply as the
                    // preview goal — used to generate a GUI mockup when nothing
                    // is built yet.
                    const goal = [...messages]
                      .slice(0, i)
                      .reverse()
                      .find(m => m.role === 'user')?.text || '';
                    useProjectStore.getState().requestPreview(goal);
                  }}
                  title="Show me a preview"
                >
                  🖥 Show Preview
                </button>
              )}
              {msg.role === 'ai' && (
                <button
                  className="preview-btn-msg"
                  onClick={() => {
                    useProjectStore.getState().requestSessionHistory();
                  }}
                  title="Show session history"
                >
                  📜 Session History
                </button>
              )}
              {msg.role === 'ai' && (
                <button
                  className="preview-btn-msg"
                  onClick={() => {
                    useProjectStore.getState().requestWiki();
                  }}
                  title="Show the wiki (modelVeronice.txt)"
                >
                  📗 Wiki
                </button>
              )}
              {msg.role === 'ai' && (
                <button
                  className="preview-btn-msg"
                  onClick={() => {
                    useProjectStore.getState().requestTodo();
                  }}
                  title="Open the todo list (TODO fixes.txt)"
                >
                  📋 Todo List
                </button>
              )}
            </div>
            <span className="message-text">{msg.text}</span>
            {msg.role === 'ai' && <MessageReactions key={msg.timestamp} messageId={msg.timestamp} />}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {/* Part 4: editable UNDERSTOOD INTENT card — correct goal/features before answering */}
      {pendingIntent && intentDraft && pendingQuestions && pendingQuestions.length > 0 && (
        <div style={{
          margin: '0 12px 8px',
          padding: '10px 12px',
          background: 'rgba(0, 217, 255, 0.06)',
          border: '1px solid rgba(0, 217, 255, 0.3)',
          borderRadius: 0,
          fontSize: 12,
          color: '#eee',
          maxHeight: Math.max(120, panelHeight - 130),
          overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontWeight: 700, color: '#00d9ff' }}>🎯 UNDERSTOOD INTENT — correct it before answering</span>
            <button
              onClick={() => setIntentDraft(pendingIntent ? { ...pendingIntent, coreFeatures: Array.isArray(pendingIntent.coreFeatures) ? [...pendingIntent.coreFeatures] : [] } : null)}
              style={{ background: 'none', border: '1px solid #444', color: '#999', borderRadius: 0, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}
              title="Restore the auto-extracted intent"
            >↺ reset</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <label style={{ gridColumn: '1 / -1' }}>
              <span style={{ color: '#888' }}>Goal</span>
              <input
                type="text"
                value={intentDraft?.goal || ''}
                onChange={(e) => setIntentDraft((prev: any) => ({ ...(prev || {}), goal: e.target.value }))}
                style={intentInputStyle}
              />
            </label>
            <label>
              <span style={{ color: '#888' }}>For (target user)</span>
              <input
                type="text"
                value={intentDraft?.targetUser || ''}
                onChange={(e) => setIntentDraft((prev: any) => ({ ...(prev || {}), targetUser: e.target.value }))}
                style={intentInputStyle}
              />
            </label>
            <label>
              <span style={{ color: '#888' }}>UI style</span>
              <input
                type="text"
                value={intentDraft?.uiStyle || ''}
                onChange={(e) => setIntentDraft((prev: any) => ({ ...(prev || {}), uiStyle: e.target.value }))}
                style={intentInputStyle}
              />
            </label>
            <label>
              <span style={{ color: '#888' }}>Language</span>
              <input
                type="text"
                value={intentDraft?.language || ''}
                onChange={(e) => setIntentDraft((prev: any) => ({ ...(prev || {}), language: e.target.value }))}
                style={intentInputStyle}
              />
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              <span style={{ color: '#888' }}>Core features (comma-separated)</span>
              <input
                type="text"
                value={Array.isArray(intentDraft?.coreFeatures) ? intentDraft.coreFeatures.join(', ') : ''}
                onChange={(e) => setIntentDraft((prev: any) => ({ ...(prev || {}), coreFeatures: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) }))}
                style={intentInputStyle}
              />
            </label>
          </div>
        </div>
      )}
      {/* Structured clarifying-questions form (radio buttons / dropdowns) */}
      {pendingQuestions && pendingQuestions.length > 0 && (
        <div className="terminal-pending-questions" style={{
          margin: '0 12px 8px',
          padding: '10px 12px',
          background: 'rgba(168, 85, 247, 0.08)',
          border: '1px solid rgba(168, 85, 247, 0.35)',
          borderRadius: 0,
          fontSize: 12,
          color: '#eee',
          maxHeight: Math.max(120, panelHeight - 130),
          overflowY: 'auto',
        }}>
          <div style={{ fontWeight: 700, color: '#c084fc', marginBottom: 8 }}>🧭 Answer to generate the code</div>
          {pendingQuestions.map((q: any, i: number) => {
            const key = q.key || `q${i + 1}`;
            const isChoice = q.type === 'choice' && q.options && q.options.length > 0;
            return (
              <div key={key} style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{q.question || q}</div>
                {isChoice ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {q.options.map((opt: string) => (
                      <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name={`pending-q-${key}`}
                          value={opt}
                          checked={!customAnswerKeys[key] && draftAnswers[key] === opt}
                          onChange={() => {
                            setCustomAnswerKeys(prev => ({ ...prev, [key]: false }));
                            setDraftAnswers(prev => ({ ...prev, [key]: opt }));
                          }}
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                    {/* "Type your own" — a free-text escape hatch for ANY choice question,
                        e.g. picking all media formats instead of just one of them. */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name={`pending-q-${key}`}
                        value="__custom__"
                        checked={!!customAnswerKeys[key]}
                        onChange={() => {
                          setCustomAnswerKeys(prev => ({ ...prev, [key]: true }));
                          setDraftAnswers(prev => ({ ...prev, [key]: '' }));
                        }}
                      />
                      <span style={{ color: '#c084fc' }}>✏️ Type your own…</span>
                    </label>
                    {customAnswerKeys[key] && (
                      <input
                        type="text"
                        placeholder="Type your own answer (e.g. 'all of the above')..."
                        value={draftAnswers[key] || ''}
                        onChange={(e) => setDraftAnswers(prev => ({ ...prev, [key]: e.target.value }))}
                        style={{ width: '100%', marginTop: 2, background: 'rgba(0,0,0,0.35)', color: '#eee', border: '1px solid #a855f7', borderRadius: 0, padding: '5px 8px', fontSize: 12 }}
                      />
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="Type your answer..."
                    value={draftAnswers[key] || ''}
                    onChange={(e) => setDraftAnswers(prev => ({ ...prev, [key]: e.target.value }))}
                    style={{ width: '100%', background: 'rgba(0,0,0,0.35)', color: '#eee', border: '1px solid #333', borderRadius: 0, padding: '5px 8px', fontSize: 12 }}
                  />
                )}
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button
              className="terminal-send-btn pending-submit"
              onClick={submitStructuredAnswers}
              disabled={isProcessing}
              style={{ padding: '5px 12px' }}
            >
              {isProcessing ? 'Writing...' : '⚙️ Write Code'}
            </button>
            <button
              onClick={() => { pendingPlanRef.current = null; setPendingQuestions(null); setPendingIntent(null); setIntentDraft(null); setCustomAnswerKeys({}); }}
              style={{ background: 'none', border: '1px solid #444', color: '#999', borderRadius: 0, padding: '5px 10px', cursor: 'pointer' }}
            >
              ✕ Dismiss
            </button>
          </div>
        </div>
      )}
      <div className="scale-selector-row" title="Program size for build requests — the planner will plan this many files/nodes and auto-chunk large builds">
        <span className="scale-selector-label" aria-hidden="true">📏</span>
        {SCALE_OPTIONS.map(opt => {
          const active = buildScale === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              className={`scale-pill ${active ? 'active' : ''}`}
              onClick={() => { scaleTouchedRef.current = true; setBuildScale(opt.value); }}
              aria-pressed={active}
              aria-label={`${opt.label} scale — ${opt.nodes} nodes. ${opt.hint}`}
              title={`${opt.label}: ${opt.nodes} nodes. ${opt.hint}`}
            >
              {opt.short}
            </button>
          );
        })}
        <span className="scale-selector-current">
          {(() => {
            const opt = SCALE_OPTIONS.find(o => o.value === buildScale);
            return `${opt?.icon || '⚙️'} ${opt?.label || 'Medium'} · ${opt?.nodes || '8–14 nodes'}`;
          })()}
        </span>
      </div>
      {codegenStatus && (
        <div style={{ padding: '4px 12px', fontSize: 11, color: '#fbbf24', background: 'rgba(251,191,36,0.08)', borderTop: '1px solid rgba(251,191,36,0.22)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={codegenStatus}>
          {codegenStatus}
        </div>
      )}
      <div className="terminal-input-row">
        <textarea
          ref={inputRef}
          className="terminal-input"
          placeholder={assistantEnabled ? 'Voice assistant active — say "Venorica"' : 'Ask LLM 1 to reason, design architecture, or create blueprints...'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button
          className={`mic-btn ${isListening ? 'listening' : ''}`}
          onClick={toggleListening}
          title={isListening ? 'Stop listening' : 'Push to talk — also available while voice assistant is active'}
        >
          {isListening ? '🎙' : '🎤'}
        </button>
        <button className="stop-talk-btn" onClick={() => {
          stopSpeaking();
          setSpeakingId(null);
          assistantSpeakingRef.current = false;
          assistantStateRef.current = 'idle';
          setAssistantState('idle');
          if (assistantEnabled) startAssistantCycle();
        }} title="Stop speaking">
          🔇
        </button>
        <button className="terminal-send-btn" onClick={handleSend} disabled={!input.trim() || isProcessing}>
          {isProcessing ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
};

export default ReasoningPanel;
