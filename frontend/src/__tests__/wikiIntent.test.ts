import { describe, it, expect } from 'vitest';
import { detectWikiIntent } from '../utils/wikiIntent';

describe('detectWikiIntent', () => {
  it('detects explicit show-your-wiki requests', () => {
    expect(detectWikiIntent('can you show your wiki')).toBe(true);
    expect(detectWikiIntent('show me your wiki')).toBe(true);
    expect(detectWikiIntent('open your wiki')).toBe(true);
    expect(detectWikiIntent('read your wiki')).toBe(true);
    expect(detectWikiIntent('can you display the wiki')).toBe(true);
    expect(detectWikiIntent('show me the wiki file')).toBe(true);
    expect(detectWikiIntent('let me see your wiki')).toBe(true);
  });

  it('never fires for memory-write requests', () => {
    expect(detectWikiIntent('write this into your wiki')).toBe(false);
    expect(detectWikiIntent('save this to the wiki')).toBe(false);
    expect(detectWikiIntent('put this in the wiki')).toBe(false);
    expect(detectWikiIntent('update your wiki with anything newer')).toBe(false);
    expect(detectWikiIntent('remember this in your wiki')).toBe(false);
  });

  it('never fires for knowledge queries about wiki content', () => {
    expect(detectWikiIntent('what does your wiki say about session memory')).toBe(false);
    expect(detectWikiIntent('search your wiki for react patterns')).toBe(false);
    expect(detectWikiIntent('tell me what your wiki knows about training')).toBe(false);
  });

  it('does not fire for unrelated chat', () => {
    expect(detectWikiIntent('hello')).toBe(false);
    expect(detectWikiIntent('how do I build a pomodoro timer')).toBe(false);
    expect(detectWikiIntent('')).toBe(false);
  });
});
