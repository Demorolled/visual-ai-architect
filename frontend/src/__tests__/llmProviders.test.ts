import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { LlmProvider } from '../store/llmStore';

// llmStore reads localStorage at module load. Stub the global FIRST, then
// import the store dynamically so its module body runs against the stub.
const storage = new Map<string, string>();
beforeAll(() => {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
    clear: () => storage.clear(),
  });
});

let PROVIDERS: LlmProvider[] = [];
beforeAll(async () => {
  const mod = await import('../store/llmStore');
  PROVIDERS = mod.PROVIDERS;
});

// Guards the "remove 3rd-party providers" decision: Settings must only offer
// local/self-hosted endpoints. If someone re-adds OpenAI, Anthropic, Google,
// Groq, DeepSeek, xAI, OpenRouter, Azure, Together, etc., this test fails and
// forces a conscious decision.

const ALLOWED_LOCAL_IDS = new Set(['ollama', 'dspark', 'lmstudio', 'custom']);

// Cloud provider ids that were intentionally removed from the catalog.
const FORBIDDEN_CLOUD_IDS = new Set([
  'openai',
  'anthropic',
  'google',
  'azure',
  'groq',
  'together',
  'deepseek',
  'xai',
  'openrouter',
]);

// Brand tokens that would indicate a cloud provider crept back in. (Local
// open-source model names like Mistral/Llama/Gemma are NOT banned — they
// describe what Ollama runs locally.)
const FORBIDDEN_TOKENS = [
  'openai',
  'gpt',
  'anthropic',
  'claude',
  'google',
  'gemini',
  'azure',
  'groq',
  'together',
  'deepseek',
  'xai',
  'grok',
  'openrouter',
];

describe('LLM provider catalog (local-only policy)', () => {
  it('contains only the 4 local providers', () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual(['ollama', 'dspark', 'lmstudio', 'custom']);
  });

  it('every provider id is in the allowed local set (no new 3rd-party ids)', () => {
    for (const p of PROVIDERS) {
      expect(ALLOWED_LOCAL_IDS.has(p.id), `provider id '${p.id}' is not a known local provider`).toBe(true);
    }
  });

  it('rejects any removed cloud provider id', () => {
    for (const p of PROVIDERS) {
      expect(FORBIDDEN_CLOUD_IDS.has(p.id), `removed cloud provider '${p.id}' re-added`).toBe(false);
    }
  });

  it('has no cloud brand tokens in names/descriptions', () => {
    for (const p of PROVIDERS) {
      // 'openai-compatible' is a protocol descriptor, not a provider reference
      const haystack = `${p.name} ${p.description} ${p.id}`
        .toLowerCase()
        .replace(/openai-compatible/g, '');
      for (const token of FORBIDDEN_TOKENS) {
        expect(haystack.includes(token), `cloud token '${token}' found in provider '${p.id}'`).toBe(false);
      }
    }
  });

  it('local providers need no API key config', () => {
    for (const p of PROVIDERS) {
      expect(p.needsConfig, `provider '${p.id}' should not require API-key config`).toBe(false);
    }
  });
});
