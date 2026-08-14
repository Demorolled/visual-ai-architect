/**
 * Client-side Emotion Probability Engine utilities
 *
 * Provides:
 *  - API helpers to call the backend emotion engine
 *  - Client-side fallback analysis (mirrors backend for instant feedback)
 *  - Visualization helpers for the reasoning panel
 */

import axios from 'axios';

// ─── Types ───────────────────────────────────────────────────────────────

export const EMOTIONS = [
  'joy',
  'sadness',
  'anger',
  'fear',
  'surprise',
  'disgust',
  'trust',
  'anticipation',
  'neutral',
] as const;

export type Emotion = (typeof EMOTIONS)[number];

export interface EmotionResult {
  probabilities: Record<Emotion, number>;
  dominant: Emotion;
  confidence: number;
  rawScores: Record<string, number>;
  valence: number;
  arousal: number;
  dominance: number;
}

/** Color mapping for each emotion (for bars, badges, etc.) */
export const EMOTION_COLORS: Record<Emotion, string> = {
  joy: '#fbbf24',        // gold
  sadness: '#60a5fa',    // blue
  anger: '#ef4444',      // red
  fear: '#a855f7',       // purple
  surprise: '#f97316',   // orange
  disgust: '#22c55e',    // green
  trust: '#06b6d4',      // cyan
  anticipation: '#e879f9', // pink
  neutral: '#6b7280',    // gray
};

export const EMOTION_LABELS: Record<Emotion, string> = {
  joy: 'Joy 😊',
  sadness: 'Sadness 😢',
  anger: 'Anger 😠',
  fear: 'Fear 😨',
  surprise: 'Surprise 😮',
  disgust: 'Disgust 🤢',
  trust: 'Trust 🤝',
  anticipation: 'Anticipation 🤔',
  neutral: 'Neutral 😐',
};

export const EMOTION_ICONS: Record<Emotion, string> = {
  joy: '😊',
  sadness: '😢',
  anger: '😠',
  fear: '😨',
  surprise: '😮',
  disgust: '🤢',
  trust: '🤝',
  anticipation: '🤔',
  neutral: '😐',
};

// ─── API Calls ───────────────────────────────────────────────────────────

/**
 * Analyze a text for emotion probabilities via the backend API
 */
export async function analyzeEmotion(text: string): Promise<EmotionResult> {
  try {
    const res = await axios.post('/api/emotion/analyze', { text });
    const data = res.data;
    return {
      probabilities: data.probabilities,
      dominant: data.dominant,
      confidence: data.confidence,
      rawScores: data.rawScores,
      valence: data.valence,
      arousal: data.arousal,
      dominance: data.dominance,
    };
  } catch {
    // Fall back to client-side analysis
    return clientSideAnalyze(text);
  }
}

/**
 * Get an emotion-aware prompt modifier from the backend
 * Returns the modifier text + emotion data
 */
export async function getEmotionPrompt(text: string, detailed: boolean = true) {
  try {
    const res = await axios.post('/api/emotion/prompt', { text, detailed });
    return res.data;
  } catch {
    return null;
  }
}

// ─── Client-Side Analysis (lightweight fallback) ─────────────────────────

const CLIENT_LEXICON: Record<string, Partial<Record<Emotion, number>>> = {
  happy: { joy: 0.8 },
  great: { joy: 0.7 },
  amazing: { joy: 0.9, surprise: 0.5 },
  wonderful: { joy: 0.85 },
  fantastic: { joy: 0.85 },
  love: { joy: 0.9, trust: 0.7 },
  glad: { joy: 0.6 },
  excited: { joy: 0.7, anticipation: 0.6 },
  awesome: { joy: 0.8 },
  good: { joy: 0.4 },
  nice: { joy: 0.4 },
  thanks: { joy: 0.4, trust: 0.3 },
  sad: { sadness: 0.7 },
  unhappy: { sadness: 0.7 },
  disappointed: { sadness: 0.6 },
  upset: { sadness: 0.6 },
  sorry: { sadness: 0.4 },
  frustrated: { anger: 0.7 },
  angry: { anger: 0.8 },
  mad: { anger: 0.7 },
  furious: { anger: 0.95 },
  annoyed: { anger: 0.5 },
  hate: { anger: 0.85, disgust: 0.7 },
  afraid: { fear: 0.7 },
  scared: { fear: 0.7 },
  worried: { fear: 0.5 },
  anxious: { fear: 0.6 },
  confused: { surprise: 0.5, fear: 0.3 },
  surprised: { surprise: 0.7 },
  shocked: { surprise: 0.8 },
  wow: { surprise: 0.7 },
  gross: { disgust: 0.6 },
  awful: { disgust: 0.7, sadness: 0.4 },
  terrible: { disgust: 0.7, sadness: 0.4 },
  trust: { trust: 0.7 },
  confident: { trust: 0.6 },
  curious: { anticipation: 0.5 },
  hope: { anticipation: 0.5, joy: 0.3 },
  stuck: { anger: 0.4, sadness: 0.4 },
  broken: { anger: 0.5, sadness: 0.4 },
  error: { anger: 0.4, fear: 0.3 },
};

const CLIENT_INTENSIFIERS: Record<string, number> = {
  very: 1.5, really: 1.4, extremely: 1.8, so: 1.3,
  somewhat: 0.6, slightly: 0.4,
};

const CLIENT_NEGATORS = new Set(['not', "n't", 'no', 'never', 'neither', 'nor', "don't", "can't"]);

const EMOTION_VAD_CLIENT: Record<Emotion, { valence: number; arousal: number; dominance: number }> = {
  joy: { valence: 0.85, arousal: 0.65, dominance: 0.65 },
  sadness: { valence: -0.7, arousal: 0.35, dominance: 0.25 },
  anger: { valence: -0.6, arousal: 0.85, dominance: 0.75 },
  fear: { valence: -0.55, arousal: 0.8, dominance: 0.2 },
  surprise: { valence: 0.3, arousal: 0.75, dominance: 0.5 },
  disgust: { valence: -0.6, arousal: 0.6, dominance: 0.45 },
  trust: { valence: 0.6, arousal: 0.3, dominance: 0.6 },
  anticipation: { valence: 0.4, arousal: 0.6, dominance: 0.5 },
  neutral: { valence: 0.0, arousal: 0.0, dominance: 0.5 },
};

export function clientSideAnalyze(text: string): EmotionResult {
  const lower = text.toLowerCase().trim();
  if (!lower) {
    return {
      probabilities: Object.fromEntries(EMOTIONS.map(e => [e, e === 'neutral' ? 1 : 0])) as Record<Emotion, number>,
      dominant: 'neutral',
      confidence: 1,
      rawScores: { neutral: 1 },
      valence: 0,
      arousal: 0,
      dominance: 0.5,
    };
  }

  const tokens = lower.replace(/[^a-z0-9\s']/g, ' ').split(/\s+/).filter(Boolean);
  const scores: Record<string, number> = {};
  EMOTIONS.forEach(e => scores[e] = 0);

  let negate = false;
  let negWindow = 0;

  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i];
    const prevWord = i > 0 ? tokens[i - 1] : null;

    if (CLIENT_NEGATORS.has(word)) {
      negate = true;
      negWindow = 3;
      continue;
    }

    let intensity = 1.0;
    if (prevWord && CLIENT_INTENSIFIERS[prevWord] !== undefined) {
      intensity = CLIENT_INTENSIFIERS[prevWord];
    }
    if (CLIENT_INTENSIFIERS[word] !== undefined) {
      const nextWord = i + 1 < tokens.length ? tokens[i + 1] : null;
      if (nextWord && CLIENT_LEXICON[nextWord]) {
        intensity = CLIENT_INTENSIFIERS[word];
        continue;
      }
    }

    const entries = CLIENT_LEXICON[word];
    if (entries) {
      for (const [emotion, weight] of Object.entries(entries)) {
        let w = weight * intensity;
        if (negate && negWindow > 0) w *= -0.5;
        scores[emotion] = (scores[emotion] || 0) + w;
      }
    }

    if (negWindow > 0) { negWindow--; if (negWindow === 0) negate = false; }
  }

  // Punctuation signals
  const exclCount = (text.match(/!/g) || []).length;
  if (exclCount >= 2) {
    scores.surprise = (scores.surprise || 0) + 0.3;
  }

  // Neutral baseline
  const nonNeutralTotal = Object.entries(scores)
    .filter(([k]) => k !== 'neutral')
    .reduce((sum, [, v]) => sum + Math.abs(v), 0);
  scores.neutral = nonNeutralTotal < 0.3 ? 1 - nonNeutralTotal : Math.max(0, 0.15 - nonNeutralTotal * 0.05);

  // Softmax
  const keys = Object.keys(scores) as Emotion[];
  let maxScore = -Infinity;
  for (const k of keys) if (scores[k] > maxScore) maxScore = scores[k];
  const expScores: Record<string, number> = {};
  let sumExp = 0;
  for (const k of keys) { const v = Math.exp(scores[k] - maxScore); expScores[k] = v; sumExp += v; }
  const probs = {} as Record<Emotion, number>;
  for (const k of keys) probs[k] = sumExp > 0 ? expScores[k] / sumExp : 1 / keys.length;

  let dominant: Emotion = 'neutral';
  let maxProb = 0;
  for (const [e, p] of Object.entries(probs)) { if (p > maxProb) { maxProb = p; dominant = e as Emotion; } }

  // Confidence
  const entropy = -Object.values(probs).reduce((s, p) => p > 0 ? s + p * Math.log2(p) : s, 0);
  const normEntropy = Math.log2(EMOTIONS.length) > 0 ? entropy / Math.log2(EMOTIONS.length) : 1;
  const confidence = Math.min(1, (1 - normEntropy) * 0.4 + maxProb * 0.6);

  // VAD
  let valence = 0, arousal = 0, dominance = 0;
  for (const [e, p] of Object.entries(probs)) {
    const vad = EMOTION_VAD_CLIENT[e as Emotion];
    if (vad) { valence += vad.valence * p; arousal += vad.arousal * p; dominance += vad.dominance * p; }
  }

  return { probabilities: probs, dominant, confidence, rawScores: scores, valence, arousal, dominance };
}

// ─── Visualization Helpers ───────────────────────────────────────────────

/**
 * Format an emotion result as a compact bar string (for inline display)
 */
export function formatEmotionBars(result: EmotionResult, maxWidth: number = 20): string {
  const top = Object.entries(result.probabilities)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4);

  return top
    .map(([emotion, prob]) => {
      const pct = Math.round(prob * 100);
      const barLen = Math.round((prob / (top[0]?.[1] || 1)) * maxWidth);
      const bar = '█'.repeat(Math.max(1, barLen));
      const icon = EMOTION_ICONS[emotion as Emotion] || '';
      return `${icon} ${emotion.padEnd(12)} ${bar} ${pct}%`;
    })
    .join('\n');
}

/**
 * Check if the emotion state suggests user is frustrated or having difficulty
 */
export function isUserFrustrated(result: EmotionResult): boolean {
  return (
    result.dominant === 'anger' ||
    result.dominant === 'disgust' ||
    (result.valence < -0.3 && result.arousal > 0.5) // negative + high arousal = distress
  );
}

/**
 * Get a suggested user-state label
 */
export function getUserStateLabel(result: EmotionResult): string {
  if (isUserFrustrated(result)) return '😤 Frustrated';
  if (result.dominant === 'joy' || result.valence > 0.5) return '😊 Happy';
  if (result.dominant === 'sadness') return '😢 Upset';
  if (result.dominant === 'fear') return '😨 Anxious';
  if (result.dominant === 'surprise') return '😮 Surprised';
  if (result.valence > 0.2) return '🙂 Positive';
  if (result.valence < -0.2) return '🙁 Negative';
  return '😐 Neutral';
}

// ── Shared emotion state (module-level, usable from any component) ──
let _sharedLastEmotion: EmotionResult = {
  probabilities: { joy: 0, sadness: 0, anger: 0, fear: 0, surprise: 0, disgust: 0, trust: 0, anticipation: 0, neutral: 1 },
  dominant: 'neutral', confidence: 1, rawScores: { neutral: 1 }, valence: 0, arousal: 0, dominance: 0.5,
};
const _emotionListeners = new Set<() => void>();

export function setSharedEmotion(emotion: EmotionResult): void {
  _sharedLastEmotion = emotion;
  _emotionListeners.forEach(fn => fn());
}

export function getSharedEmotion(): EmotionResult {
  return _sharedLastEmotion;
}

export function subscribeSharedEmotion(fn: () => void): () => void {
  _emotionListeners.add(fn);
  return () => _emotionListeners.delete(fn);
}
