/**
 * systemAwareness.ts — System Awareness for Veronica Terminal
 * ============================================================
 *
 * Provides live system data (processes, active window, system load) to the
 * Veronica terminal LLM, making the AI "aware" of what the user is currently
 * running on their Linux machine.
 *
 * The data comes from the `system_monitor.py` Python daemon which POSTs system
 * state to the backend every 5 seconds.
 *
 * API:
 *   fetchSystemStatus()       — Get latest system state from backend
 *   getSystemContextPrompt()  — Get system state formatted as an LLM prompt block
 *   getActiveWindow()         — Get just the active window title
 *   subscribeSystemUpdates()  — Subscribe to live Socket.IO broadcasts
 *   isDaemonRunning()         — Check if the Python daemon is active
 */

import { captureAndDescribe } from './screenshotVision';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SystemState {
  timestamp: string;
  active_window: string;
  active_window_basename: string;
  process_count: number;
  top_cpu: ProcessInfo[];
  top_memory: MemoryProcessInfo[];
  load: SystemLoad;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu_percent: number;
  memory_percent: number;
  status: string;
}

export interface MemoryProcessInfo extends ProcessInfo {
  memory_mb: number;
}

export interface SystemLoad {
  cpu_percent: number;
  cpu_count: number;
  ram_percent: number;
  ram_used_gb: number;
  ram_total_gb: number;
  disk_percent: number;
  disk_used_gb: number;
  disk_total_gb: number;
  uptime_hours: number;
  boot_time: string;
}

export interface BackendSystemResponse {
  success: boolean;
  state: SystemState | null;
  stale_seconds: number;
  daemon_running: boolean;
  last_seen: string | null;
}

// ─── Cache ─────────────────────────────────────────────────────────────────

let cachedState: SystemState | null = null;
let lastFetch: number = 0;
const CACHE_TTL = 4000; // 4 seconds (slightly under the daemon's 5s poll)

// ─── API Functions ─────────────────────────────────────────────────────────

/**
 * Fetch the latest system state from the backend.
 * Uses a short cache to avoid hammering the API.
 */
export async function fetchSystemStatus(): Promise<BackendSystemResponse> {
  const now = Date.now();
  if (cachedState && (now - lastFetch) < CACHE_TTL) {
    return {
      success: true,
      state: cachedState,
      stale_seconds: Math.floor((now - lastFetch) / 1000),
      daemon_running: true,
      last_seen: new Date(lastFetch).toISOString(),
    };
  }

  try {
    const res = await fetch('/api/system-monitor/status', {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data: BackendSystemResponse = await res.json();
      if (data.state) {
        cachedState = data.state;
        lastFetch = now;
      }
      return data;
    }
  } catch {
    // Backend not reachable
  }
  return {
    success: false,
    state: null,
    stale_seconds: -1,
    daemon_running: false,
    last_seen: null,
  };
}

/**
 * Start the Python system monitor daemon from the backend.
 */
export async function startDaemon(): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch('/api/system-monitor/start', {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    });
    return await res.json();
  } catch {
    return { success: false, message: 'Backend not reachable' };
  }
}

/**
 * Stop the Python system monitor daemon.
 */
export async function stopDaemon(): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch('/api/system-monitor/stop', {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    });
    return await res.json();
  } catch {
    return { success: false, message: 'Backend not reachable' };
  }
}

/**
 * Check if the system monitor daemon is running.
 */
export async function isDaemonRunning(): Promise<boolean> {
  try {
    const res = await fetch('/api/system-monitor/daemon', {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      return data.running;
    }
  } catch {
    // Backend not reachable
  }
  return false;
}

// ─── LLM Context Formatter ─────────────────────────────────────────────────

/**
 * Get system state formatted as an LLM-aware context block.
 * Call this in the terminal's send handler to inject into the system prompt.
 *
 * Example output:
 * ```
 * ── System State ──
 * Active Window: Firefox — Reddit
 * Processes: 187 running
 * CPU: 23.5% | RAM: 62.1% | Disk: 45%
 * Top: firefox (12.3% CPU), code (8.1% CPU), terminal (2.1% CPU)
 * The user is focused on: Firefox
 * ── End System State ──
 * ```
 */
export async function getSystemContextPrompt(): Promise<string> {
  const status = await fetchSystemStatus();
  if (!status.state) return '';

  const s = status.state;
  const isStale = status.stale_seconds > 30;

  let context = `\n\n── Current System State (live) ──\n`;
  context += `Active Window: ${s.active_window}\n`;
  context += `Processes Running: ${s.process_count}\n`;
  context += `System Load: ${s.load.cpu_percent}% CPU | ${s.load.ram_percent}% RAM | ${s.load.disk_percent}% Disk\n`;
  context += `Uptime: ${s.load.uptime_hours}h\n\n`;

  context += `Top CPU Processes:\n`;
  for (const p of s.top_cpu.slice(0, 6)) {
    context += `  • ${p.name} (PID ${p.pid}): ${p.cpu_percent}% CPU\n`;
  }
  context += '\n';

  context += `Top Memory Processes:\n`;
  for (const p of s.top_memory.slice(0, 4)) {
    context += `  • ${p.name}: ${p.memory_mb}MB (${p.memory_percent}%)\n`;
  }

  if (s.active_window_basename && s.active_window_basename !== '(unknown)') {
    context += `\nThe user is currently focused on: **${s.active_window_basename}**`;
  }

  if (isStale) {
    context += `\n\n⚠️ Note: System data is ${status.stale_seconds}s stale — the monitor may not be running.\n`;
  }

  context += `\n── End System State ──`;
  return context;
}

/**
 * Get just the active window title (synchronous, uses cache if available).
 */
export function getActiveWindow(): string | null {
  return cachedState?.active_window || null;
}

// ─── Model Facts ────────────────────────────────────────────────────────────

/**
 * Fetch the deployed model's truthful self-description from the backend
 * (which reads dspark-target.env + stats the GGUF + nvidia-smi).
 */
interface DSparkModelFacts {
  modelFile?: string | null;
  modelFileSizeGb?: number | null;
  modelFileSizeMiB?: number | null;
  vramUsedMiB?: number | null;
  vramTotalMiB?: number | null;
  gpus?: { index: string; name: string }[] | null;
  tokensPerSec?: number | null;
  model?: string | null;
}

export async function fetchModelFacts(): Promise<DSparkModelFacts> {
  try {
    const res = await fetch('/api/llm/dspark-status', { signal: AbortSignal.timeout(3000) });
    if (res.ok) return await res.json();
  } catch {
    // Backend not reachable
  }
  return {};
}

/**
 * Model self-knowledge block for the LLM system prompt.
 *
 * Without this, the model hallucinates about its own size (it has no training
 * memory of the deployed file). Includes only measured facts — if the backend
 * can't report them, the block degrades to '' so the prompt stays clean.
 *
 * Example output:
 * ```
 * ── About the Model Running Right Now (measured facts — do not guess) ──
 * File: Qwen2.5-7B-Instruct-Uncensored.R9.Q4_K_M.gguf
 * Size: 4.36 GB
 * VRAM in use: 7.6 GB of 24 GB across 2 GPU(s)
 * Speed: ~21 tok/s
 * If asked about your size/VRAM/parameters, answer ONLY from these facts.
 * ── End Model Facts ──
 * ```
 */
export async function getModelFactsPrompt(): Promise<string> {
  const f = await fetchModelFacts();
  if (!f.modelFile) return '';

  // Human-friendly parameter count parsed from the filename (e.g. "7B").
  const paramsMatch = (f.modelFile || '').match(/(\d+[.]?\d*)[bB]/);
  const params = paramsMatch ? `${paramsMatch[1]}B parameters` : '';
  const quantMatch = (f.modelFile || '').match(/Q[0-9]_[A-Z0-9_]+/);
  const quant = quantMatch ? ` (${quantMatch[0]} quantization)` : '';

  const lines = [`\n\n── About the Model Running Right Now (measured facts — do not guess) ──`];
  lines.push(`File: ${f.modelFile}`);
  if (params) lines.push(`Parameters: ${params}${quant}`);
  if (f.modelFileSizeGb != null) lines.push(`Disk size: ${f.modelFileSizeGb} GB (${f.modelFileSizeMiB} MiB file on disk)`);
  if (f.vramUsedMiB != null) {
    const gpuCount = f.gpus?.length || 1;
    const totalStr = f.vramTotalMiB != null ? ` of ${(f.vramTotalMiB / 1024).toFixed(1)} GB` : '';
    lines.push(`GPU VRAM in use: ${(f.vramUsedMiB / 1024).toFixed(1)} GB${totalStr} across ${gpuCount} GPU(s)`);
  }
  if (f.gpus?.length) lines.push(`GPUs: ${f.gpus.map(g => g.name).join(', ')}`);
  if (f.tokensPerSec != null) lines.push(`Current throughput: ~${Math.round(f.tokensPerSec)} tok/s`);
  lines.push('If asked about your size, VRAM, or parameters, answer ONLY from these measured facts — never guess or round up.');
  lines.push(`── End Model Facts ──`);
  return lines.join('\n');
}

// ─── Vision Context ────────────────────────────────────────────────────────

let visionCache: {
  description: string;
  timestamp: number;
  windowAtCapture: string;
} | null = null;

const VISION_CACHE_TTL = 15000; // 15 seconds

// ─── Auto Screenshot Toggle ─────────────────────────────────────────────────

let visionAutoEnabled = true;

/**
 * Check whether automatic screenshot injection is enabled.
 */
export function isVisionAutoEnabled(): boolean {
  return visionAutoEnabled;
}

/**
 * Enable or disable automatic screenshot injection into LLM system prompts.
 * Also controls the vision pre-warm poller.
 *
 * Returns the new state for confirmation.
 */
export function setVisionAutoEnabled(enabled: boolean): boolean {
  visionAutoEnabled = enabled;

  if (!enabled) {
    // Stop pre-warm poller
    if (preWarmTimer) {
      clearInterval(preWarmTimer);
      preWarmTimer = null;
    }
    preWarmStarted = false;
    // Clear any cached vision context so stale data isn't returned if re-enabled
    visionCache = null;
  }

  return visionAutoEnabled;
}

/**
 * Capture a screenshot, describe it with a vision LLM, and return the
 * description as an LLM-aware context block.
 *
 * Smart caching:
 *   - Caches for 15 seconds (avoids spamming the vision API on every keystroke)
 *   - Re-captures if the active window changed (gets fresh context when you switch apps)
 *   - Gracefully degrades if no vision model is configured or daemon is down
 *
 * On first call, starts a background poller that watches for window switches
 * and proactively warms the cache — so the first message after switching apps
 * is instant.
 *
 * Returns '' immediately if auto screenshot is disabled via /screenshot auto off.
 *
 * Example output:
 * ```
 * ── Screen Content ──
 * The user's screen shows a VS Code editor with a React component open.
 * The sidebar shows the file tree with src/App.tsx highlighted.
 * ── End Screen Content ──
 * ```
 */
export async function getVisionContext(): Promise<string> {
  // Return immediately if auto screenshot is disabled
  if (!visionAutoEnabled) return '';

  // Start pre-warm poller on first call
  startVisionPreWarm();

  const now = Date.now();
  const currentWindow = cachedState?.active_window_basename || '';

  // Use cache if still fresh and same window
  if (visionCache && (now - visionCache.timestamp) < VISION_CACHE_TTL) {
    if (!currentWindow || visionCache.windowAtCapture === currentWindow) {
      return visionCache.description;
    }
  }

  try {
    const result = await captureAndDescribe('What is visible? Describe in 1 sentence.');

    if (result.success && result.description) {
      // Keep vision descriptions very short to avoid overflowing the LLM's context window
      const clean = result.description
        .replace(/^I can see[.,]?\s*/i, '')
        .replace(/^The screen (shows|displays|has)[.,]?\s*/i, '')
        .substring(0, 400);
      const desc = `\n\n── Screen Content ──\n${clean}\n── End Screen Content ──`;
      visionCache = { description: desc, timestamp: now, windowAtCapture: currentWindow };
      return desc;
    }
  } catch {
    // Vision model not configured or capture failed — degrade gracefully
  }

  return '';
}

// ─── Vision Pre-Warm ────────────────────────────────────────────────────────

let preWarmStarted = false;
let preWarmTimer: ReturnType<typeof setInterval> | null = null;
let lastPreWarmWindow = '';

/**
 * Start a background poller that detects window switches and proactively
 * warms the vision cache. This makes the first message after switching
 * apps instant — no 2-5s vision API delay.
 *
 * - Polls system state every 5s (same as the Python daemon)
 * - When active_window_basename changes, calls captureAndDescribe in background
 * - Fails silently — if vision isn't configured, the next getVisionContext()
 *   call will gracefully return '' as before
 * - Only starts once, no matter how many times getVisionContext() is called
 */
let preWarmLocked = false;

function startVisionPreWarm(): void {
  if (preWarmStarted) return;
  preWarmStarted = true;
  lastPreWarmWindow = cachedState?.active_window_basename || '';

  preWarmTimer = setInterval(async () => {
    // Don't fire if auto-screenshot was disabled after start
    if (!visionAutoEnabled) return;

    // Prevent overlapping async calls (can happen if capture takes >5s)
    if (preWarmLocked) return;
    preWarmLocked = true;

    try {
      await fetchSystemStatus();
      const currentWindow = cachedState?.active_window_basename || '';

      if (!currentWindow || currentWindow === '(unknown)' || currentWindow === lastPreWarmWindow) return;

      lastPreWarmWindow = currentWindow;

      const result = await captureAndDescribe('What is visible? Describe in 1 sentence.');
      if (!result.success || !result.description) return;

      const clean = result.description
        .replace(/^I can see[.,]?\s*/i, '')
        .replace(/^The screen (shows|displays|has)[.,]?\s*/i, '')
        .substring(0, 400);

      visionCache = {
        description: `\n\n── Screen Content ──\n${clean}\n── End Screen Content ──`,
        timestamp: Date.now(),
        windowAtCapture: currentWindow,
      };
    } catch {
      // Pre-warm failed silently — next manual call will handle it
    } finally {
      preWarmLocked = false;
    }
  }, 10000); // Poll every 10s (was 5s) — reduces API calls by 50%

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      if (preWarmTimer) clearInterval(preWarmTimer);
    });
  }
}

// ─── Subscription (via Socket.IO) ───────────────────────────────────────────

type SystemUpdateCallback = (state: SystemState) => void;

/**
 * Subscribe to live system state updates via polling.
 * Returns an unsubscribe function.
 *
 * Uses fetch polling rather than Socket.IO directly because:
 * 1. Most consumers (terminal components) already manage their own sockets
 * 2. The daemon polls at 5s intervals — 10s fetch polling is sufficient
 * 3. Avoids the ESM `require` issue with socket.io-client
 *
 * The backend broadcasts `system_state` events via Socket.IO to all clients,
 * but components that want real-time updates should use their existing socket
 * connection and listen for `system_state` events.
 */
export function subscribeSystemUpdates(callback: SystemUpdateCallback): () => void {
  // Poll for system state every 10 seconds (twice the daemon's 5s interval)
  const interval = setInterval(async () => {
    const status = await fetchSystemStatus();
    if (status.state) callback(status.state);
  }, 10000);

  // Fetch immediately on subscribe
  fetchSystemStatus().then(status => {
    if (status.state) callback(status.state);
  });

  return () => {
    clearInterval(interval);
  };
}
