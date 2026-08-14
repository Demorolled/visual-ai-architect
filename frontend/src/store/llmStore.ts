import { create } from 'zustand';

const DEFAULT_LLM_URL = 'http://127.0.0.1:8000';
const DEFAULT_MODEL = 'qwen2.5-7b-instruct-uncensored';

export type LlmStatus = 'testing' | 'connected' | 'disconnected' | 'idle';

export type DSparkStatus = 'running' | 'loading' | 'offline' | 'unknown';

export interface DSparkStatusInfo {
  status: DSparkStatus;
  draftMode: string | null;
  model: string | null;
  speculativeDecoding: boolean;
  latencyMs: number | null;
  port: string;
  /** Rolling tokens/sec throughput from the server's health endpoint */
  tokensPerSec: number | null;
  /** Rolling average request latency from the server's health endpoint */
  avgLatencyMs: number | null;
  totalCompletionTokens: number;
  totalRequests: number;
  hint?: string;
}

/**
 * Tuned-vs-stock benchmark summary served by /api/llm/dspark-benchmark
 * (written by scripts/benchmark-dspark.py → data/benchmark-dspark.json).
 */
export interface DSparkBenchmarkInfo {
  exists: boolean;
  timestamp: string | null;
  /** Stock tok/s mean captured from the pre-training dspark.log */
  historicalStockTps: number | null;
  /** Client-side mean tok/s for the tuned model (same hardware) */
  tunedTps: number | null;
  /** Server rolling-window tok/s seen during the tuned benchmark */
  tunedServerTps: number | null;
  /** Client-side mean tok/s for the stock control GGUF */
  stockTps: number | null;
  stockServerTps: number | null;
  stockError: string | null;
  /** Draft-mode verification verdict for the tuned GGUF */
  draftOk: boolean | null;
  draftMode: string | null;
  draftSpeculative: boolean;
  draftTps: number | null;
  finalModel: string | null;
}

const HEARTBEAT_INTERVAL = 30000; // 30 seconds

const SCAN_RESULTS_KEY = 'vaia-llm-scan-results';
const SCAN_TIMESTAMP_KEY = 'vaia-llm-scan-timestamp';
/** Increment this to force a full re-scan of all providers on next load */
const SCAN_CACHE_VERSION = 2;

export interface LlmModelInfo {
  id: string;
  name: string;
  size?: number;
  quantization?: string;
  modifiedAt?: string;
}

/* ── Provider Catalog ── */

export interface LlmProvider {
  id: string;
  name: string;
  icon: string;
  matchUrl: string;
  baseUrl: string;
  description: string;
  apiKeyHint: string | null;
  needsConfig: boolean;
}

export type ProviderScanStatus = 'idle' | 'scanning' | 'reachable' | 'verified' | 'unreachable' | 'needs-config';

export interface ProviderScanResult {
  providerId: string;
  status: ProviderScanStatus;
  latencyMs: number | null;
  error?: string;
  /** Model ID used for the verification chat completion */
  modelTested?: string | null;
  /** Latency of the verification chat completion in ms */
  modelLatencyMs?: number | null;
}

export const PROVIDERS: LlmProvider[] = [
  {
    id: 'ollama',
    name: 'Ollama',
    icon: '🦙',
    matchUrl: '11434',
    baseUrl: 'http://127.0.0.1:11434',
    description: 'Local open-source models (Llama, Gemma, Mistral, etc.)',
    apiKeyHint: null,
    needsConfig: false,
  },
  {
    id: 'dspark',
    name: 'DSpark (Local)',
    icon: '⚡',
    matchUrl: '127.0.0.1:8000',
    baseUrl: 'http://127.0.0.1:8000',
    description: 'Speculative decoding — qwen2.5-7b target + qwen2.5-coder:0.5b draft (DSpark-style, local)',
    apiKeyHint: null,
    needsConfig: false,
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    icon: '📦',
    matchUrl: '1234',
    baseUrl: 'http://127.0.0.1:1234',
    description: 'Run local GGUF models with OpenAI-compatible server',
    apiKeyHint: null,
    needsConfig: false,
  },
  {
    id: 'custom',
    name: 'Custom Server',
    icon: '🌐',
    matchUrl: '',
    baseUrl: 'http://127.0.0.1:11434',
    description: 'Any OpenAI-compatible endpoint — vLLM, TGI, SGLang, etc.',
    apiKeyHint: null,
    needsConfig: false,
  },
];

interface LlmState {
  llmUrl: string;
  selectedModel: string;
  availableModels: LlmModelInfo[];
  connectionStatus: LlmStatus;
  latency: number | null;
  isFetchingModels: boolean;
  isScanning: boolean;
  /** Provider scan results keyed by provider id */
  providerScanResults: Record<string, ProviderScanResult>;
  /** Whether a full provider scan is in progress */
  isProviderScanning: boolean;
  /** Timestamp of the last successful full provider scan (ms since epoch) */
  lastScanTimestamp: number | null;
  /** Provider name that was auto-connected on last scan (null if none) */
  autoConnectedProvider: string | null;
  /** Live status of the local DSpark speculative-decoding server */
  dsparkStatus: DSparkStatusInfo;
  /** Latest tuned-vs-stock benchmark report (null until the benchmark runs) */
  dsparkBenchmark: DSparkBenchmarkInfo | null;
  fetchDsparkStatus: () => Promise<void>;
  fetchDsparkBenchmark: () => Promise<void>;
  fetchModels: () => Promise<void>;
  scanOllama: () => Promise<{ scanned: boolean; count?: number; error?: string }>;
  selectModel: (name: string) => void;
  testConnection: () => Promise<void>;
  setLlmUrl: (url: string) => void;
  /** Scan all known providers to check which are reachable */
  scanAllProviders: () => Promise<void>;
  /** Start a persistent heartbeat that auto-pings the LLM every 30s */
  startHeartbeat: () => () => void;
}

export type OllamaScanResult = {
  models: Array<{
    name: string;
    size: string;
    sizeBytes: number;
    quantization: string;
    modifiedAt: string;
  }>;
  count: number;
  success: boolean;
  error?: string;
};

// Singleton guard: only ONE heartbeat interval across all components
let _heartbeatId: ReturnType<typeof setInterval> | null = null;
let _heartbeatCount = 0;

export const useLlmStore = create<LlmState>((set, get) => ({
  llmUrl: localStorage.getItem('vaia-llm-url') || DEFAULT_LLM_URL,
  // Migration: clear stale model names that no longer match available defaults
  selectedModel: (() => {
    const stored = localStorage.getItem('vaia-llm-model');
    if (stored === 'deepseek-r1:7b') {
      localStorage.removeItem('vaia-llm-model');
      return DEFAULT_MODEL;
    }
    return stored || DEFAULT_MODEL;
  })(),
  availableModels: [],
  connectionStatus: 'idle',
  latency: null,
  isFetchingModels: false,
  isScanning: false,
  providerScanResults: (() => {
    try {
      const version = localStorage.getItem('vaia-llm-scan-version');
      // If version mismatch or missing, clear stale cache
      if (String(version) !== String(SCAN_CACHE_VERSION)) {
        localStorage.removeItem(SCAN_RESULTS_KEY);
        localStorage.removeItem(SCAN_TIMESTAMP_KEY);
        localStorage.setItem('vaia-llm-scan-version', String(SCAN_CACHE_VERSION));
        return {};
      }
      const stored = localStorage.getItem(SCAN_RESULTS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed === 'object' && parsed !== null) return parsed;
      }
    } catch { /* corrupted data — start fresh */ }
    return {};
  })(),
  isProviderScanning: false,
  autoConnectedProvider: null,
  dsparkStatus: { status: 'unknown', draftMode: null, model: null, speculativeDecoding: false, latencyMs: null, port: '8000', tokensPerSec: null, avgLatencyMs: null, totalCompletionTokens: 0, totalRequests: 0 },
  dsparkBenchmark: null,
  lastScanTimestamp: (() => {
    try {
      const version = localStorage.getItem('vaia-llm-scan-version');
      if (String(version) !== String(SCAN_CACHE_VERSION)) return null;
      const stored = localStorage.getItem(SCAN_TIMESTAMP_KEY);
      if (stored) {
        const parsed = Number(stored);
        if (!isNaN(parsed)) return parsed;
      }
    } catch {}
    return null;
  })(),
  fetchModels: async () => {
    const { llmUrl } = get();
    set({ isFetchingModels: true });
    try {
      // Proxy through backend to avoid CORS issues
      const proxyUrl = `/api/llm/proxy/models?url=${encodeURIComponent(llmUrl + '/v1/models')}`;
      const res = await fetch(proxyUrl, {
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        const models: LlmModelInfo[] = (data.data || []).map((m: any) => ({
          id: m.id,
          name: m.id,
          size: m.size,
          modifiedAt: m.modified_at,
        }));
        set({ availableModels: models, isFetchingModels: false });

        // Auto-select first model if current selection isn't in list
        const { selectedModel } = get();
        if (models.length > 0 && !models.some(m => m.id === selectedModel)) {
          get().selectModel(models[0].id);
        }
      } else {
        set({ availableModels: [], isFetchingModels: false });
      }
    } catch {
      set({ availableModels: [], isFetchingModels: false });
    }
  },

  scanOllama: async () => {
    set({ isScanning: true });
    try {
      const res = await fetch('/api/llm/ollama-scan', {
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data: OllamaScanResult = await res.json();
        if (data.success && data.models.length > 0) {
          // Map ollama list format to our LlmModelInfo format
          const models: LlmModelInfo[] = data.models.map((m) => ({
            id: m.name,
            name: m.name,
            size: m.sizeBytes || 0,
            quantization: m.quantization,
            modifiedAt: m.modifiedAt,
          }));
          set({ availableModels: models, isScanning: false });

          // Auto-select first model if current selection isn't in list
          const { selectedModel } = get();
          if (models.length > 0 && !models.some(m => m.id === selectedModel)) {
            get().selectModel(models[0].id);
          }
          return { scanned: true, count: models.length };
        } else {
          set({ isScanning: false });
          return { scanned: false, error: data.error || 'No models found' };
        }
      } else {
        set({ isScanning: false });
        return { scanned: false, error: 'Backend scan failed' };
      }
    } catch (err: any) {
      set({ isScanning: false });
      return { scanned: false, error: err.message || 'Scan failed' };
    }
  },

  selectModel: (name: string) => {
    set({ selectedModel: name, connectionStatus: 'idle', latency: null });
    localStorage.setItem('vaia-llm-model', name);
  },

  testConnection: async () => {
    const { llmUrl, selectedModel } = get();
    set({ connectionStatus: 'testing', latency: null });
    const start = performance.now();
    try {
      // Proxy through backend to avoid CORS issues
      const res = await fetch('/api/llm/proxy/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: llmUrl + '/v1/chat/completions',
          model: selectedModel,
          messages: [{ role: 'user', content: 'Reply with one word: OK' }],
          max_tokens: 5,
          stream: false,
          keep_alive: '5m',
        }),
        signal: AbortSignal.timeout(15000),
      });
      const ms = Math.round(performance.now() - start);
      if (res.ok) {
        const data = await res.json();
        // Check if the proxy returned success
        if (data.id || data.choices) {
          set({ connectionStatus: 'connected', latency: ms });
        } else {
          set({ connectionStatus: 'disconnected', latency: null });
        }
      } else {
        set({ connectionStatus: 'disconnected', latency: null });
      }
    } catch {
      set({ connectionStatus: 'disconnected', latency: null });
    }
  },

  setLlmUrl: (url: string) => {
    set({ llmUrl: url, connectionStatus: 'idle', latency: null });
    localStorage.setItem('vaia-llm-url', url);
    // Re-fetch models with new URL
    get().fetchModels();
  },

  scanAllProviders: async () => {
    const providers = PROVIDERS.filter((p) => !p.needsConfig && p.matchUrl);
    // Initialize all to scanning
    const initResults: Record<string, ProviderScanResult> = {};
    for (const p of providers) {
      initResults[p.id] = { providerId: p.id, status: 'scanning', latencyMs: null };
    }
    set({ isProviderScanning: true, providerScanResults: { ...get().providerScanResults, ...initResults } });

    // Phase 1: Ping all providers' /v1/models in parallel (via backend proxy)
    const pingResults = await Promise.all(
      providers.map(async (provider) => {
        const start = performance.now();
        try {
          // Proxy through backend to avoid CORS issues
          const res = await fetch('/api/llm/proxy/scan-provider', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: `${provider.baseUrl}/v1/models` }),
            signal: AbortSignal.timeout(8000),
          });
          const result = await res.json();
          const ms = Math.round(performance.now() - start);
          if (result.reachable) {
            return {
              providerId: provider.id,
              status: 'reachable' as const,
              latencyMs: result.latencyMs ?? ms,
              error: result.error,
              firstModel: result.firstModel || null,
            };
          } else {
            return {
              providerId: provider.id,
              status: 'unreachable' as const,
              latencyMs: null,
              error: result.error || 'No response',
              firstModel: null,
            };
          }
        } catch {
          return { providerId: provider.id, status: 'unreachable' as const, latencyMs: null, error: 'No response', firstModel: null };
        }
      })
    );

    // Phase 2: For reachable providers, try a quick chat completion to verify the model works
    const updateWithVerification = await Promise.all(
      pingResults.map(async (r) => {
        if (r.status !== 'reachable' || !r.firstModel) {
          // Not reachable or no model to test — return as-is
          const { firstModel, ...rest } = r;
          return rest as ProviderScanResult;
        }

        // Try a tiny chat completion with the first available model (via backend proxy)
        try {
          const verifyStart = performance.now();
          const providerUrl = PROVIDERS.find(p => p.id === r.providerId)?.baseUrl || '';
          const verifyRes = await fetch('/api/llm/proxy/verify-model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: providerUrl,
              model: r.firstModel,
            }),
            signal: AbortSignal.timeout(12000),
          });
          const verifyData = await verifyRes.json();
          const modelMs = Math.round(performance.now() - verifyStart);

          if (verifyData.success) {
            return {
              providerId: r.providerId,
              status: 'verified' as const,
              latencyMs: r.latencyMs,
              modelTested: r.firstModel,
              modelLatencyMs: modelMs,
            };
          } else {
            return {
              providerId: r.providerId,
              status: 'reachable' as const,
              latencyMs: r.latencyMs,
              error: `Model ${r.firstModel} failed: ${verifyData.error}`,
              modelTested: r.firstModel,
            };
          }
        } catch {
          return {
            providerId: r.providerId,
            status: 'reachable' as const,
            latencyMs: r.latencyMs,
            error: `Model ${r.firstModel} verify request failed`,
            modelTested: r.firstModel,
          };
        }
      })
    );

    const updated: Record<string, ProviderScanResult> = { ...get().providerScanResults };
    for (const r of updateWithVerification) {
      updated[r.providerId] = r;
    }
    const timestamp = Date.now();

    // Auto-connect to the first verified provider ONLY if no provider is currently active.
    // If the current llmUrl (default or user-chosen) already matches a known provider,
    // respect that choice — otherwise the scan would override DSpark/Ollama selection
    // on every mount and the provider UI would look inconsistent with the active URL.
    let autoConnected: string | null = null;
    const { llmUrl } = get();
    const currentProvider = PROVIDERS.find(p => p.matchUrl && llmUrl.includes(p.matchUrl));
    const firstVerified = updateWithVerification.find(r => r.status === 'verified');
    if (!currentProvider && firstVerified) {
      const provider = PROVIDERS.find(p => p.id === firstVerified.providerId);
      if (provider) {
        // Auto-connect — set the URL (this also triggers fetchModels)
        set({ llmUrl: provider.baseUrl, connectionStatus: 'idle', latency: null });
        localStorage.setItem('vaia-llm-url', provider.baseUrl);
        // Fetch models in background
        get().fetchModels();
        autoConnected = provider.name;
      }
    }

    set({ providerScanResults: updated, isProviderScanning: false, lastScanTimestamp: timestamp, autoConnectedProvider: autoConnected });
    localStorage.setItem(SCAN_RESULTS_KEY, JSON.stringify(updated));
    localStorage.setItem(SCAN_TIMESTAMP_KEY, String(timestamp));
  },

  fetchDsparkStatus: async () => {
    try {
      const res = await fetch('/api/llm/dspark-status', {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({
        dsparkStatus: {
          status: data.running ? 'running' : data.loading ? 'loading' : 'offline',
          draftMode: data.draftMode ?? null,
          model: data.model ?? null,
          speculativeDecoding: !!data.speculativeDecoding,
          latencyMs: data.latencyMs ?? null,
          port: data.port || '8000',
          tokensPerSec: data.tokensPerSec ?? null,
          avgLatencyMs: data.avgLatencyMs ?? null,
          totalCompletionTokens: data.totalCompletionTokens ?? 0,
          totalRequests: data.totalRequests ?? 0,
          hint: data.hint,
        },
      });
    } catch {
      // Backend unreachable — leave last known status; don't flap the UI.
    }
  },

  fetchDsparkBenchmark: async () => {
    try {
      const res = await fetch('/api/llm/dspark-benchmark', {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.exists) {
        set({ dsparkBenchmark: { exists: false, timestamp: null, historicalStockTps: null, tunedTps: null, tunedServerTps: null, stockTps: null, stockServerTps: null, stockError: null, draftOk: null, draftMode: null, draftSpeculative: false, draftTps: null, finalModel: null } });
        return;
      }
      const s = data.steps ?? {};
      set({
        dsparkBenchmark: {
          exists: true,
          timestamp: data.timestamp ?? null,
          historicalStockTps: s.beforeDeployHistorical?.mean ?? null,
          tunedTps: s.tunedTps ?? null,
          tunedServerTps: s.tunedServerTps ?? null,
          stockTps: s.stockTps ?? null,
          stockServerTps: s.stockServerTps ?? null,
          stockError: s.stockError ?? null,
          draftOk: s.draftOk ?? null,
          draftMode: s.draftMode ?? null,
          draftSpeculative: !!s.draftSpeculative,
          draftTps: s.draftTps ?? null,
          finalModel: s.finalModel ?? null,
        },
      });
    } catch {
      // Backend unreachable — leave last known benchmark state.
    }
  },

  startHeartbeat: () => {
    _heartbeatCount++;
    // Only create ONE interval — subsequent calls are no-ops
    if (!_heartbeatId) {
      get().testConnection();
      _heartbeatId = setInterval(() => {
        get().testConnection();
      }, HEARTBEAT_INTERVAL);
    }
    // Return cleanup that decrements ref count; only clears when all consumers unmount
    return () => {
      _heartbeatCount--;
      if (_heartbeatCount <= 0 && _heartbeatId) {
        clearInterval(_heartbeatId);
        _heartbeatId = null;
        _heartbeatCount = 0;
      }
    };
  },
}));
