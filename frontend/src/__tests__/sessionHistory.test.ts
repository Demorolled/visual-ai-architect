import { describe, it, expect } from 'vitest';
import { detectSessionHistoryIntent } from '../utils/sessionHistory';

describe('detectSessionHistoryIntent', () => {
  it('detects explicit session-history requests', () => {
    expect(detectSessionHistoryIntent('can you show me the session history')).toBe(true);
    expect(detectSessionHistoryIntent('show me the session history')).toBe(true);
    expect(detectSessionHistoryIntent('Show me session histories')).toBe(true);
  });

  it('detects past/our-session phrasings', () => {
    expect(detectSessionHistoryIntent('what was our last session')).toBe(true);
    expect(detectSessionHistoryIntent('can you remind me of our past sessions')).toBe(true);
    expect(detectSessionHistoryIntent('how far back does your memory go on our sessions')).toBe(true);
    expect(detectSessionHistoryIntent('show me my saved sessions')).toBe(true);
    expect(detectSessionHistoryIntent('list the sessions we have saved')).toBe(true);
  });

  it('never fires for app builds that merely have a session-history feature', () => {
    expect(detectSessionHistoryIntent('build a pomodoro timer with session history and stats')).toBe(false);
    expect(detectSessionHistoryIntent('a pomodoro timer with session history and stats')).toBe(false);
    expect(detectSessionHistoryIntent('create an app with session history')).toBe(false);
  });

  it('does not fire for unrelated chat', () => {
    expect(detectSessionHistoryIntent('hello')).toBe(false);
    expect(detectSessionHistoryIntent('how do sessions work?')).toBe(false);
    expect(detectSessionHistoryIntent('can you explain the architecture')).toBe(false);
    expect(detectSessionHistoryIntent('')).toBe(false);
  });
});
