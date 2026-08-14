import { describe, it, expect } from 'vitest';
import {
  clientSideAnalyze,
  isUserFrustrated,
  getUserStateLabel,
  formatEmotionBars,
  setSharedEmotion,
  getSharedEmotion,
  subscribeSharedEmotion,
  EMOTION_COLORS,
  EMOTION_ICONS,
  EMOTION_LABELS,
  EMOTIONS,
  type EmotionResult,
} from '../utils/emotionEngine';

// ─── EMOTIONS constant ─────────────────────────────────────────────

describe('EMOTIONS constant', () => {
  it('should contain all 9 emotions', () => {
    expect(EMOTIONS).toHaveLength(9);
    expect(EMOTIONS).toContain('joy');
    expect(EMOTIONS).toContain('sadness');
    expect(EMOTIONS).toContain('anger');
    expect(EMOTIONS).toContain('fear');
    expect(EMOTIONS).toContain('surprise');
    expect(EMOTIONS).toContain('disgust');
    expect(EMOTIONS).toContain('trust');
    expect(EMOTIONS).toContain('anticipation');
    expect(EMOTIONS).toContain('neutral');
  });
});

// ─── EMOTION_COLORS ────────────────────────────────────────────────

describe('EMOTION_COLORS', () => {
  it('should have a color for every emotion', () => {
    for (const e of EMOTIONS) {
      expect(EMOTION_COLORS[e]).toBeDefined();
      expect(EMOTION_COLORS[e]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

// ─── EMOTION_ICONS ─────────────────────────────────────────────────

describe('EMOTION_ICONS', () => {
  it('should have an icon for every emotion', () => {
    for (const e of EMOTIONS) {
      expect(EMOTION_ICONS[e]).toBeDefined();
      expect(EMOTION_ICONS[e].length).toBeGreaterThan(0);
    }
  });
});

// ─── EMOTION_LABELS ────────────────────────────────────────────────

describe('EMOTION_LABELS', () => {
  it('should have a label for every emotion', () => {
    for (const e of EMOTIONS) {
      expect(EMOTION_LABELS[e]).toBeDefined();
      expect(EMOTION_LABELS[e]).toContain(EMOTION_ICONS[e]);
    }
  });
});

// ─── clientSideAnalyze ─────────────────────────────────────────────

describe('clientSideAnalyze', () => {
  it('should return neutral for empty string', () => {
    const result = clientSideAnalyze('');
    expect(result.dominant).toBe('neutral');
    expect(result.probabilities.neutral).toBeCloseTo(1, 1);
  });

  it('should detect joy from positive words', () => {
    const result = clientSideAnalyze('happy great amazing');
    expect(result.dominant).toBe('joy');
    expect(result.probabilities.joy).toBeGreaterThan(0.2);
  });

  it('should detect sadness from sad words', () => {
    const result = clientSideAnalyze('sad unhappy disappointed');
    expect(result.dominant).toBe('sadness');
    expect(result.probabilities.sadness).toBeGreaterThan(0.3);
  });

  it('should detect anger from angry words', () => {
    const result = clientSideAnalyze('angry furious mad');
    expect(result.dominant).toBe('anger');
    expect(result.probabilities.anger).toBeGreaterThan(0.3);
  });

  it('should detect fear from fearful words', () => {
    const result = clientSideAnalyze('afraid scared anxious');
    expect(result.dominant).toBe('fear');
    expect(result.probabilities.fear).toBeGreaterThan(0.3);
  });

  it('should detect surprise from surprising words', () => {
    const result = clientSideAnalyze('surprised shocked wow');
    expect(result.dominant).toBe('surprise');
    expect(result.probabilities.surprise).toBeGreaterThan(0.3);
  });

  it('should amplify emotions with intensifiers', () => {
    const normal = clientSideAnalyze('angry');
    const intense = clientSideAnalyze('extremely angry');
    expect(intense.probabilities.anger).toBeGreaterThan(normal.probabilities.anger);
  });

  it('should handle negators (reduce emotion)', () => {
    const positive = clientSideAnalyze('happy');
    const negated = clientSideAnalyze('not happy');
    // "not happy" should have reduced joy compared to "happy"
    expect(negated.probabilities.joy).toBeLessThan(positive.probabilities.joy);
  });

  it('should detect punctuation signals (multiple exclamation marks)', () => {
    const calm = clientSideAnalyze('okay');
    const excited = clientSideAnalyze('wow!!');
    expect(excited.probabilities.surprise).toBeGreaterThan(calm.probabilities.surprise);
  });

  it('should return valid probability distribution (sums to ~1)', () => {
    const result = clientSideAnalyze('I am really happy and excited about this!');
    const sum = Object.values(result.probabilities).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 1);
  });

  it('should handle love correctly (joy + trust)', () => {
    const result = clientSideAnalyze('love');
    expect(result.probabilities.joy).toBeGreaterThan(0.2);
    expect(result.probabilities.trust).toBeGreaterThan(0.15);
  });

  it('should handle mixed emotions', () => {
    const result = clientSideAnalyze('amazing surprise');
    expect(result.probabilities.joy).toBeGreaterThan(0.2);
    expect(result.probabilities.surprise).toBeGreaterThan(0.14);
  });

  it('should set valence correctly for positive emotions', () => {
    const result = clientSideAnalyze('happy great wonderful');
    expect(result.valence).toBeGreaterThan(0);
  });

  it('should set valence correctly for negative emotions', () => {
    const result = clientSideAnalyze('sad angry afraid');
    expect(result.valence).toBeLessThan(0);
  });

  it('should return confidence between 0 and 1', () => {
    const result = clientSideAnalyze('I am furious and angry');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('should return arousal for high-energy emotions', () => {
    const result = clientSideAnalyze('angry furious');
    expect(result.arousal).toBeGreaterThan(0.5);
  });

  it('should return low arousal for low-energy emotions', () => {
    const result = clientSideAnalyze('sad');
    expect(result.arousal).toBeLessThan(0.6);
  });
});

// ─── isUserFrustrated ──────────────────────────────────────────────

describe('isUserFrustrated', () => {
  it('should return true for anger dominant', () => {
    const result = clientSideAnalyze('I am so angry and furious!');
    expect(isUserFrustrated(result)).toBe(true);
  });

  it('should return true for disgust dominant', () => {
    const result = clientSideAnalyze('this is disgusting awful');
    expect(isUserFrustrated(result)).toBe(true);
  });

  it('should return true for negative valence + high arousal', () => {
    const angry: EmotionResult = {
      probabilities: {
        joy: 0.05, sadness: 0.05, anger: 0.6, fear: 0.05,
        surprise: 0.05, disgust: 0.05, trust: 0.05, anticipation: 0.05, neutral: 0.05,
      },
      dominant: 'anger',
      confidence: 0.8,
      rawScores: { anger: 3 },
      valence: -0.5,
      arousal: 0.7,
      dominance: 0.6,
    };
    expect(isUserFrustrated(angry)).toBe(true);
  });

  it('should return false for neutral/positive emotions', () => {
    const neutral = clientSideAnalyze('thank you very much');
    expect(isUserFrustrated(neutral)).toBe(false);
  });

  it('should return false for joy', () => {
    const result = clientSideAnalyze('happy great amazing');
    expect(isUserFrustrated(result)).toBe(false);
  });
});

// ─── getUserStateLabel ─────────────────────────────────────────────

describe('getUserStateLabel', () => {
  it('should return frustrated for angry dominant', () => {
    // Create a result with clear anger dominance
    const angry = clientSideAnalyze('furious');
    const label = getUserStateLabel(angry);
    expect(label).toContain('Frustrated');
  });

  it('should return happy for joy dominant', () => {
    const result = clientSideAnalyze('happy great');
    expect(getUserStateLabel(result)).toContain('Happy');
  });

  it('should return upset for sadness dominant', () => {
    const result = clientSideAnalyze('sad unhappy');
    expect(getUserStateLabel(result)).toContain('Upset');
  });

  it('should return anxious for fear dominant', () => {
    const result = clientSideAnalyze('afraid scared');
    expect(getUserStateLabel(result)).toContain('Anxious');
  });

  it('should return surprised for surprise dominant', () => {
    const result = clientSideAnalyze('surprised shocked');
    expect(getUserStateLabel(result)).toContain('Surprised');
  });

  it('should return Neutral for neutral input', () => {
    const result = clientSideAnalyze('');
    expect(getUserStateLabel(result)).toContain('Neutral');
  });
});

// ─── formatEmotionBars ─────────────────────────────────────────────

describe('formatEmotionBars', () => {
  it('should return a formatted string with top emotions', () => {
    const result = clientSideAnalyze('happy');
    const bars = formatEmotionBars(result);
    expect(bars).toContain('joy');
    expect(bars).toContain('%');
    expect(bars).toContain('█');
  });

  it('should include emotion icons', () => {
    const result = clientSideAnalyze('happy');
    const bars = formatEmotionBars(result);
    expect(bars).toContain('😊');
  });
});

// ─── Shared Emotion State ──────────────────────────────────────────

describe('shared emotion state', () => {
  it('should start with default neutral state', () => {
    const state = getSharedEmotion();
    expect(state.dominant).toBe('neutral');
  });

  it('should update via setSharedEmotion', () => {
    const result = clientSideAnalyze('happy');
    setSharedEmotion(result);
    const state = getSharedEmotion();
    expect(state.dominant).toBe('joy');
  });

  it('should notify subscribers on update', () => {
    let notified = false;
    const unsub = subscribeSharedEmotion(() => { notified = true; });
    const result = clientSideAnalyze('angry');
    setSharedEmotion(result);
    expect(notified).toBe(true);
    unsub();
  });

  it('should allow unsubscribing', () => {
    let count = 0;
    const unsub = subscribeSharedEmotion(() => { count++; });
    unsub();
    setSharedEmotion(clientSideAnalyze('sad'));
    expect(count).toBe(0);
  });
});
