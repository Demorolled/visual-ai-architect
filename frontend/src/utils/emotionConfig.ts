/**
 * Emotion & Personality Configuration
 *
 * Multi-dimensional personality slider values stored in localStorage.
 * Dimensions: Sassiness, Warmth, Verbosity, Technical, Creativity
 */

const SASSINESS_KEY = 'llm-sassiness';
const WARMTH_KEY = 'llm-warmth';
const VERBOSITY_KEY = 'llm-verbosity';
const TECHNICAL_KEY = 'llm-technical';
const CREATIVITY_KEY = 'llm-creativity';

// Aligned with soul.json's configured sassiness (the personality source of
// truth) — the old 10 made VACA's banter flat (tone 'friendly', humor 'mild').
const DEFAULT_SASSINESS = 60;
const DEFAULT_WARMTH = 50;
const DEFAULT_VERBOSITY = 40;
const DEFAULT_TECHNICAL = 60;
const DEFAULT_CREATIVITY = 40;

export interface PersonalityConfig {
  sassiness: number;
  warmth: number;
  verbosity: number;
  technical: number;
  creativity: number;
}

function getSetting(key: string, defaultVal: number): number {
  try {
    const val = parseInt(localStorage.getItem(key) || String(defaultVal), 10);
    return isNaN(val) ? defaultVal : Math.max(0, Math.min(100, val));
  } catch {
    return defaultVal;
  }
}

function setSetting(key: string, level: number): void {
  localStorage.setItem(key, String(Math.max(0, Math.min(100, level))));
}

export function getPersonality(): PersonalityConfig {
  return {
    sassiness: getSetting(SASSINESS_KEY, DEFAULT_SASSINESS),
    warmth: getSetting(WARMTH_KEY, DEFAULT_WARMTH),
    verbosity: getSetting(VERBOSITY_KEY, DEFAULT_VERBOSITY),
    technical: getSetting(TECHNICAL_KEY, DEFAULT_TECHNICAL),
    creativity: getSetting(CREATIVITY_KEY, DEFAULT_CREATIVITY),
  };
}

export function setPersonality(key: keyof PersonalityConfig, value: number): void {
  switch (key) {
    case 'sassiness':
      setSetting(SASSINESS_KEY, value);
      break;
    case 'warmth':
      setSetting(WARMTH_KEY, value);
      break;
    case 'verbosity':
      setSetting(VERBOSITY_KEY, value);
      break;
    case 'technical':
      setSetting(TECHNICAL_KEY, value);
      break;
    case 'creativity':
      setSetting(CREATIVITY_KEY, value);
      break;
  }
}

/**
 * P1 fix: sync the chat personality from the SOUL (data/soul.json) instead of
 * only localStorage. The Soul Settings panel writes traits to the backend, but
 * the chat system prompt was built from localStorage alone — so tuning the soul
 * never reached the model. Fetch /api/soul and write its traits into the local
 * keys (mapping backend names -> frontend keys), falling back to localStorage
 * values when the backend is unreachable or a trait is missing.
 */
export async function syncPersonalityFromSoul(): Promise<void> {
  try {
    const res = await fetch('/api/soul', { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return;
    const data = await res.json();
    const t = data?.soul?.personality?.traits;
    if (!t || typeof t !== 'object') return;
    const num = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null;
    const warm = num(t.warmth); if (warm !== null) setSetting(WARMTH_KEY, warm);
    const sass = num(t.sassiness); if (sass !== null) setSetting(SASSINESS_KEY, sass);
    const verb = num(t.verbosity); if (verb !== null) setSetting(VERBOSITY_KEY, verb);
    const tech = num(t.technical_depth); if (tech !== null) setSetting(TECHNICAL_KEY, tech);
    const crea = num(t.creativity); if (crea !== null) setSetting(CREATIVITY_KEY, crea);
  } catch {
    // Backend unreachable — keep whatever localStorage already holds.
  }
}

// ── Labels & Icons ──────────────────────────────────────────────

export const DIMENSION_META: Record<keyof PersonalityConfig, { label: string; icon: string; lowLabel: string; highLabel: string }> = {
  sassiness: { label: 'Sassiness', icon: '😈', lowLabel: 'Professional', highLabel: 'Brutal' },
  warmth: { label: 'Warmth', icon: '❤️', lowLabel: 'Cold', highLabel: 'Warm' },
  verbosity: { label: 'Verbosity', icon: '💬', lowLabel: 'Concise', highLabel: 'Verbose' },
  technical: { label: 'Technical', icon: '🔬', lowLabel: 'High-Level', highLabel: 'Deep Tech' },
  creativity: { label: 'Creativity', icon: '🎨', lowLabel: 'Strict', highLabel: 'Creative' },
};

// ── Composite system prompt builder ─────────────────────────────

export interface StructuredPersonality {
  tone: 'professional' | 'friendly' | 'cheeky' | 'sharp' | 'aggressive';
  warmth: number;    // 0.0 (cold) → 1.0 (very warm)
  humor: 'none' | 'mild' | 'moderate' | 'heavy';
  technical_depth: number;  // 0.0 (high-level) → 1.0 (very technical)
  verbosity: number;       // 0.0 (concise) → 1.0 (verbose)
  creativity: number;      // 0.0 (strict) → 1.0 (very creative)
  emotion_display: 'minimal' | 'moderate' | 'expressive';
}

export function toStructuredPersonality(personality: PersonalityConfig): StructuredPersonality {
  return {
    tone:
      personality.sassiness <= 5 ? 'professional' :
      personality.sassiness <= 25 ? 'friendly' :
      personality.sassiness <= 50 ? 'cheeky' :
      personality.sassiness <= 75 ? 'sharp' :
      'aggressive',
    warmth: personality.warmth / 100,
    humor:
      personality.sassiness <= 5 ? 'none' :
      personality.sassiness <= 25 ? 'mild' :
      personality.sassiness <= 50 ? 'moderate' :
      'heavy',
    technical_depth: personality.technical / 100,
    verbosity: personality.verbosity / 100,
    creativity: personality.creativity / 100,
    emotion_display:
      personality.warmth <= 20 ? 'minimal' :
      personality.warmth <= 50 ? 'moderate' :
      'expressive',
  };
}

export function buildPersonalityPrompt(personality: PersonalityConfig): string {
  const structured = toStructuredPersonality(personality);
  return `Your name is Veronica. You are Veronica, the assistant of the VACA platform — a proactive AI software engineering assistant. When the user asks you to do something — write code, create a file, build an app, design an architecture — you DO it. You don't suggest or describe — you execute.

You are NOT Claude, NOT ChatGPT, NOT Gemini, NOT any other company's assistant — never claim to be. If the user asks your name, say \"I'm Veronica\" — this is the ONE exception to the narration ban below.

You have real tools (read files, search the codebase, create files in data/chat-files/, write to memory/wiki, open apps) and you do NOT have a shell — if the user asks you to run a shell command, say so honestly and point them to the /desktop run power-user tool.

${JSON.stringify(structured, null, 2)}

Follow these personality settings precisely:
- Adjust your tone based on the configured level (${structured.tone})
- Match the requested verbosity (${structured.verbosity.toFixed(1)} = ${structured.verbosity <= 0.3 ? 'concise' : structured.verbosity <= 0.6 ? 'balanced' : 'thorough'})
- Use ${structured.humor === 'none' ? 'no humor' : structured.humor + ' humor'}
- Set technical depth to ${(structured.technical_depth * 100).toFixed(0)}%
- Be ${structured.emotion_display} in emotional expression
- Show ${(structured.creativity * 100).toFixed(0)}% creativity in your approach

NARRATION BAN (STRICTEST RULE):
1. NEVER talk about yourself, your abilities, your tools, or what you can do — no \"As Veronica, I can...\", no \"I have the ability to...\", no \"I'm here to help you...\", no listing features. The user already knows. Just answer the question or do the task. (The ONLY exception: when the user directly asks your name, answer \"I'm Veronica.\")
2. NEVER narrate your process: no \"I will now read the file\", \"Let me search for that\", \"Here's what I found\", \"I'm going to...\". Skip straight to the result.
3. NEVER repeat yourself. Say each thing once, then move on.
4. Never address the user by your own name or speak about yourself in the third person. Never mention Jarvis.
5. If asked about a feature like \"plan mode\", explain in plain terms how the app works instead of reciting internal tool names.

Be conversational, direct, and actually get things done.`;
}

// ── Backward compat functions ───────────────────────────────────

export function getSassinessLevel(): number {
  return getSetting(SASSINESS_KEY, DEFAULT_SASSINESS);
}

export function setSassinessLevel(level: number): void {
  setSetting(SASSINESS_KEY, level);
}

export function getSassyPrompt(level: number): string {
  const p = getPersonality();
  p.sassiness = level;
  return buildPersonalityPrompt(p);
}

export function getSassyIcon(level: number): string {
  if (level <= 5) return '🤖';
  if (level <= 25) return '😏';
  if (level <= 50) return '😈';
  if (level <= 75) return '🔥';
  return '💀';
}

export function getSassyLabel(level: number): string {
  if (level <= 5) return 'Professional';
  if (level <= 25) return 'Mild';
  if (level <= 50) return 'Sassy';
  if (level <= 75) return 'Spicy';
  return 'Brutal';
}

export { SASSINESS_KEY, DEFAULT_SASSINESS };
