export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * The browser's IANA timezone (e.g. "America/New_York"), sent to the backend
 * so it formats the current date/time in the USER's local zone — not the
 * server's — when answering "what time is it?" / "what's the date?".
 */
function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Legacy: call the LLM with a flat prompt string.
 * Uses /api/reason which concatenates history into the prompt string.
 * For multi-turn conversations, prefer callLlmChat() instead.
 */
export async function callLlm(
  messages: LlmMessage[],
  system?: string,
  options?: { maxTokens?: number; signal?: AbortSignal }
): Promise<string> {
  const maxTokens = options?.maxTokens || 2048;
  const signal = options?.signal;

  const sys = system || 'You are an expert AI code architect and friendly conversational assistant. Help users build software by writing clear, well-structured code.';

  try {
    const res = await fetch('/api/reason', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n'),
        system: sys,
        maxTokens,
        timeZone: browserTimeZone(),
      }),
      signal: signal || AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Backend HTTP ${res.status}: ${errText.substring(0, 200)}`);
    }

    const data = await res.json();
    if (data.success && data.response) return data.response;
    throw new Error(data.error || 'No response from backend');
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new Error('LLM request timed out');
    if (err.message?.includes('fetch')) throw new Error('Backend not reachable. Make sure the server is running.');
    throw err;
  }
}

/**
 * NEW: Call the LLM with proper message-array format.
 * Uses /api/reason/chat which sends each message with its proper role,
 * preventing the model from hallucinating multi-turn conversation patterns.
 * This is the FIX for the "Bot:" / "User:" generation bug.
 */
export async function callLlmChat(
  messages: LlmMessage[],
  system?: string,
  options?: { maxTokens?: number; signal?: AbortSignal; provider?: 'primary' | 'reasoning' }
): Promise<string> {
  // 2048 (not 1024): the tuned model answers build requests with blueprint
  // JSON plans that routinely exceed 1k tokens — at 1024 they got truncated
  // mid-string and leaked as raw JSON ("Vaca is still a little broken").
  const maxTokens = options?.maxTokens || 2048;
  const signal = options?.signal;

  const sys = system || 'You are an expert AI code architect and friendly conversational assistant. Help users build software by writing clear, well-structured code.';

  try {
    const res = await fetch('/api/reason/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        system: sys,
        maxTokens,
        timeZone: browserTimeZone(),
        ...(options?.provider ? { provider: options.provider } : {}),
      }),
      signal: signal || AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Backend HTTP ${res.status}: ${errText.substring(0, 200)}`);
    }

    const data = await res.json();
    if (data.success && data.response) return data.response;
    throw new Error(data.error || 'No response from backend');
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new Error('LLM request timed out');
    if (err.message?.includes('fetch')) throw new Error('Backend not reachable. Make sure the server is running.');
    throw err;
  }
}

export async function askLlm(
  prompt: string,
  system?: string,
  options?: { maxTokens?: number; signal?: AbortSignal }
): Promise<string> {
  return callLlm([{ role: 'user', content: prompt }], system, options);
}
