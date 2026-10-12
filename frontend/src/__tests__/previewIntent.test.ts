import { describe, it, expect } from 'vitest';
import { detectPreviewIntent } from '../utils/previewIntent';

describe('detectPreviewIntent', () => {
  it('detects the exact phrasing that previously failed (generate a preview of X + typo)', () => {
    const msg =
      'can you generate a previw of the board. Make it black and white chess board and pieces. Make everything needed for the game and build it in 3d';
    const r = detectPreviewIntent(msg);
    expect(r.asked).toBe(true);
    // Goal should recover the subject: "the board" (up to the clause stop).
    expect(r.goal.toLowerCase()).toContain('board');
  });

  it('detects common preview phrasings', () => {
    const cases: Array<[string, boolean]> = [
      ['show me a preview of a chess app', true],
      ['show me a preview', true],
      ['make me a mockup of a timer app', true],
      ['preview of the board', true],
      ['preview the site', true],
      ['generate a preview', true],
      ['create a mockup for a weather app', true],
      ['can you render a preview of this app', true],
    ];
    for (const [msg, expected] of cases) {
      expect(detectPreviewIntent(msg).asked, msg).toBe(expected);
    }
  });

  it('does NOT fire for plain chat / non-preview questions', () => {
    const cases = [
      'hello',
      'what is the weather like',
      'build me a chess game',
      'how does the preview work',
      'tell me a joke',
      'I was previewing my code earlier',
    ];
    for (const msg of cases) {
      expect(detectPreviewIntent(msg).asked, msg).toBe(false);
    }
  });

  it('recovers a goal for "show me a preview of X"', () => {
    const r = detectPreviewIntent('show me a preview of a pomodoro timer app');
    expect(r.asked).toBe(true);
    expect(r.goal.toLowerCase()).toContain('pomodoro');
  });
});
