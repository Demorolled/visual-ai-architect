import { describe, it, expect } from 'vitest';
import { detectBuildIntent, extractTrailingTitle, APP_SUFFIXES } from '../utils/buildIntent';

describe('detectBuildIntent', () => {
  it('extracts a plain goal', () => {
    expect(detectBuildIntent('can you please build me a todo app for my family')?.goal).toBe('todo app');
  });

  it('preserves a trailing game title after the app-type suffix', () => {
    const intent = detectBuildIntent('create a classic arcade game void raider');
    expect(intent).not.toBeNull();
    expect(intent!.goal).toBe('classic arcade game void raider');
  });

  it('preserves "called X" / "named X" titles', () => {
    expect(detectBuildIntent('build me a space shooter game called void raider')?.goal).toBe('space shooter game void raider');
    expect(detectBuildIntent('make an arcade game named asteroid raider')?.goal).toBe('arcade game asteroid raider');
  });

  it('does NOT treat a purpose clause as a title', () => {
    const intent = detectBuildIntent('build me a todo app for my family');
    expect(intent!.goal).toBe('todo app');
    expect(intent!.purpose).toContain('my family');
  });

  it('does not invent a title from a word continuation (weather application)', () => {
    // "application" contains the suffix "app" — the remainder "lication"
    // must not be captured as a bogus title.
    expect(detectBuildIntent('build me a weather application')?.goal).toBe('weather app');
  });

  it('returns null for questions and non-build text', () => {
    expect(detectBuildIntent('how do I build a todo app?')).toBeNull();
    expect(detectBuildIntent('what is void raider?')).toBeNull();
    expect(detectBuildIntent('hi')).toBeNull();
  });

  it('detects target OS', () => {
    expect(detectBuildIntent('build me a windows calculator app')?.os).toBe('windows');
    expect(detectBuildIntent('create a game for android')?.os).toBe('android');
  });
});

describe('extractTrailingTitle', () => {
  it('returns the title for a bare trailing noun phrase', () => {
    expect(extractTrailingTitle(' void raider')).toBe('void raider');
  });

  it('strips called/named/titled/dubbed', () => {
    expect(extractTrailingTitle(' called void raider')).toBe('void raider');
    expect(extractTrailingTitle(' titled space raider')).toBe('space raider');
  });

  it('returns empty for purpose clauses', () => {
    expect(extractTrailingTitle(' for my family')).toBe('');
    expect(extractTrailingTitle(' that syncs across devices')).toBe('');
    expect(extractTrailingTitle(' with a dark theme')).toBe('');
  });

  it('returns empty for empty/whitespace', () => {
    expect(extractTrailingTitle('')).toBe('');
    expect(extractTrailingTitle('   ')).toBe('');
  });
});

describe('APP_SUFFIXES', () => {
  it('includes game and app', () => {
    expect(APP_SUFFIXES.split('|')).toContain('game');
    expect(APP_SUFFIXES.split('|')).toContain('app');
  });
});
