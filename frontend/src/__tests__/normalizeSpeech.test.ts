import { describe, it, expect } from 'vitest';
import { normalizeForSpeech, wantsCodeToWords } from '../utils/tts';

describe('normalizeForSpeech — default: code is displayed, never read aloud', () => {
  it('silences complete ```...``` fences (code is not spoken)', () => {
    const out = normalizeForSpeech('Here is the code:\n```typescript\nconst x = 1;\n```\nDone.');
    expect(out).not.toContain('`');
    expect(out).not.toContain('const x');
    expect(out).not.toContain('code block');
    expect(out).toContain('Here is the code');
    expect(out).toContain('Done');
  });

  it('silences unclosed fence openers plus the trailing code', () => {
    const out = normalizeForSpeech('```typescript\nconst x = 1;');
    expect(out).not.toContain('`');
    expect(out).not.toContain('const x');
  });

  it('silences a lone ``` run', () => {
    const out = normalizeForSpeech('```');
    expect(out).not.toContain('`');
  });

  it('keeps inline code content while removing its backticks', () => {
    const out = normalizeForSpeech('Run `npm start` to begin.');
    expect(out).not.toContain('`');
    expect(out).toContain('npm start');
  });

  it('removes stray lone backticks', () => {
    const out = normalizeForSpeech('the ` is a backtick');
    expect(out).not.toContain('`');
    expect(out).toContain('backtick');
  });

  it('handles a mix of complete fences, inline code, and strays', () => {
    const out = normalizeForSpeech('```js\nconst a = 1;\n```\nThen run `npm test`, done ``` ok');
    expect(out).not.toContain('`');
    expect(out).not.toContain('const a');
    expect(out).not.toContain('code block');
    expect(out).toContain('npm test');
    expect(out).toContain('done');
  });

  it('returns nothing for a code-only reply', () => {
    const out = normalizeForSpeech('```python\nprint("hi")\n```');
    expect(out).toBe('');
  });
});

describe('normalizeForSpeech — codeToWords: true reads the code aloud', () => {
  it('keeps code text and drops only the fence markers', () => {
    const out = normalizeForSpeech('Here is the code:\n```typescript\nconst x = 1;\n```\nDone.', { codeToWords: true });
    expect(out).not.toContain('`');
    expect(out).toContain('const x');
    expect(out).toContain('Here is the code');
    expect(out).toContain('Done');
  });

  it('reads unclosed fence content too', () => {
    const out = normalizeForSpeech('```typescript\nconst x = 1;', { codeToWords: true });
    expect(out).not.toContain('`');
    expect(out).toContain('const x');
  });
});

describe('wantsCodeToWords — user requested code to words', () => {
  it('detects explicit requests', () => {
    expect(wantsCodeToWords('read the code to me')).toBe(true);
    expect(wantsCodeToWords('can you read the code out loud?')).toBe(true);
    expect(wantsCodeToWords('say the code aloud')).toBe(true);
    expect(wantsCodeToWords('speak the code')).toBe(true);
    expect(wantsCodeToWords('code to words please')).toBe(true);
  });

  it('ignores ordinary requests', () => {
    expect(wantsCodeToWords('write a chess game')).toBe(false);
    expect(wantsCodeToWords('show me the code')).toBe(false);
    expect(wantsCodeToWords('hello')).toBe(false);
  });
});
