import { describe, it, expect } from 'vitest';
import { detectScaleFromText, estimateScaleFromFeatures, SCALE_OPTIONS } from '../types';
import type { AppScale } from '../types';

describe('SCALE_OPTIONS', () => {
  it('covers all four backend scale tiers', () => {
    const values = SCALE_OPTIONS.map(o => o.value);
    expect(values).toEqual(['small', 'medium', 'large', 'enterprise']);
  });

  it('provides a short label, node range and hint for every tier', () => {
    for (const opt of SCALE_OPTIONS) {
      expect(opt.short.length).toBeGreaterThan(0);
      expect(opt.nodes).toBeTruthy();
      expect(opt.hint).toBeTruthy();
    }
  });
});

describe('detectScaleFromText', () => {
  it('detects enterprise wording', () => {
    expect(detectScaleFromText('build me an enterprise trading platform')).toBe('enterprise');
    expect(detectScaleFromText('a massive corporate system')).toBe('enterprise');
  });

  it('detects large wording', () => {
    expect(detectScaleFromText('build me a large e-commerce app')).toBe('large');
    expect(detectScaleFromText('I want a big social network')).toBe('large');
  });

  it('detects small wording', () => {
    expect(detectScaleFromText('make a small todo app')).toBe('small');
    expect(detectScaleFromText('a simple calculator')).toBe('small');
  });

  it('returns null when no scale word is present', () => {
    expect(detectScaleFromText('build me a music player')).toBeNull();
    expect(detectScaleFromText('hello there')).toBeNull();
  });

  it('treats "large" inside unrelated words conservatively', () => {
    // "larger" is not a scale pick, but "large " with a space/end is.
    expect(detectScaleFromText('make the font larger')).toBeNull();
  });

  it('always returns a valid AppScale when it matches', () => {
    const valid: AppScale[] = ['small', 'medium', 'large', 'enterprise'];
    for (const sample of ['small thing', 'large app', 'enterprise platform']) {
      const hit = detectScaleFromText(sample);
      if (hit) expect(valid).toContain(hit);
    }
  });
});

describe('estimateScaleFromFeatures', () => {
  it('returns null when no recognizable features are mentioned', () => {
    expect(estimateScaleFromFeatures('build me a calculator')).toBeNull();
    expect(estimateScaleFromFeatures('hello there')).toBeNull();
    expect(estimateScaleFromFeatures('I would like a nice app')).toBeNull();
  });

  it('picks small for a single-feature request', () => {
    expect(estimateScaleFromFeatures('a plain to-do list')).toBe('small');
    expect(estimateScaleFromFeatures('a music app with playlists')).toBe('small');
  });

  it('picks medium for 2–4 features', () => {
    expect(estimateScaleFromFeatures('a to-do list with reminders')).toBe('medium');
    const text = 'a music player with playlists, shuffle and downloads';
    expect(estimateScaleFromFeatures(text)).toBe('medium');
  });

  it('picks large for 5–9 features', () => {
    const text = 'a social network with profiles, posts, comments, likes, follows, notifications and direct messages';
    expect(estimateScaleFromFeatures(text)).toBe('large');
  });

  it('picks enterprise for 10+ features', () => {
    const text = 'an e-commerce platform with products, cart, checkout, payments, billing, orders, inventory, shipping, reviews, wishlist, admin dashboard and analytics';
    expect(estimateScaleFromFeatures(text)).toBe('enterprise');
  });

  it('matches plurals and -ing forms of terms', () => {
    expect(estimateScaleFromFeatures('payments, orders and reminders')).toBe('medium');
    expect(estimateScaleFromFeatures('with messaging')).toBe('small');
    expect(estimateScaleFromFeatures('a shopping app')).toBe('small');
  });

  it('does not double-count the message family via phrase + token', () => {
    expect(estimateScaleFromFeatures('a chat app with direct messages')).toBe('medium');
  });

  it('does not match feature words inside unrelated words', () => {
    // 'list' inside 'bloglist' or 'post' inside 'postgres' must not count.
    expect(estimateScaleFromFeatures('a bloglist with postgres')).toBeNull();
  });
});
