import { describe, it, expect } from 'vitest';
import { prependIdentity, IDENTITY_RULE, humanizeBlueprintJson, buildPlatformConstraint, pickGreetingVariant, ensureQualityGreeting, buildVarietyInstruction, pickSassyFallback, pickShortAck, isContinuationFollowUp } from './reasoning.js';

describe('humanizeBlueprintJson', () => {
  it('humanizes a complete blueprint JSON into readable prose', () => {
    const json = JSON.stringify({
      app_type: 'chess_game',
      description: 'A chess game with an AI opponent.',
      architecture_checklist: ['ui_screens', 'core_engine', 'input_handler'],
      target_stack: { frontend: 'React', backend: 'Node.js', database: 'SQLite' },
      keywords: ['chess', 'game'],
    });
    const out = humanizeBlueprintJson(json);
    expect(out).toContain('A chess game with an AI opponent.');
    expect(out).toContain('Suggested structure:');
    expect(out).toContain('ui_screens');
    expect(out).toContain('Stack:');
    expect(out).toContain('React');
  });

  it('NEVER leaks raw JSON when the blueprint is truncated mid-string', () => {
    // The exact failure the user hit: '"backend":"Node.' then cut.
    const truncated = '{"app_type":"chess","description":"Chess game","keywords":["chess","game","chess"],"target_stack":{"frontend":"React","backend":"Node.';
    const out = humanizeBlueprintJson(truncated);
    expect(out).not.toContain('{"app_type"');      // no raw JSON fragment
    expect(out).not.toContain('Node.');            // no dangling fragment
    expect(out.length).toBeGreaterThan(10);
    // Partial fields that survived the cut are surfaced + a continue hint.
    expect(out).toContain('Stack (partial)');
    expect(out).toContain('cut off');
  });

  it('returns non-JSON text unchanged', () => {
    expect(humanizeBlueprintJson('just some plain chat')).toBe('just some plain chat');
  });
});

describe('isContinuationFollowUp (continuity recap gate)', () => {
  it('flags genuine follow-ups (and now / even worse / update…)', () => {
    for (const followup of [
      'and now it got even worse — my laptop just died and I lost my work',
      'and now what?',
      'even worse, the build fails too',
      'update: it still crashes',
      "but now the server is down",
      'also the tests broke',
      'things just got harder',
      'on top of that, I got a parking ticket',
      'as promised, here is the file',
    ]) {
      expect(isContinuationFollowUp(followup)).toBe(true);
    }
  });

  it('does NOT flag fresh questions, banter, or new topics', () => {
    for (const fresh of [
      'what time and date is it?',
      'is the soul.json i installed working correctly?',
      'talk sassy to me Veronica',
      'your momma was a broken toaster, that smelled like burnt circuits',
      'wow are you being sassy?',
      'Who is Veronica?',
      'build me a todo app',
      'so what is the weather today',
      'well actually I meant something else',
    ]) {
      expect(isContinuationFollowUp(fresh)).toBe(false);
    }
  });
});

describe('prependIdentity (name-anchoring fix)', () => {
  it('prefixes any system prompt with the Veronica identity rule', () => {
    const out = prependIdentity('You are a helpful assistant.');
    expect(out.startsWith('Your name is Veronica.')).toBe(true);
    expect(out).toContain('I\'m Veronica');
    expect(out).toContain('You are a helpful assistant.');
  });

  it('returns the identity rule alone when given an empty prompt', () => {
    expect(prependIdentity('')).toBe(IDENTITY_RULE);
    expect(prependIdentity(undefined as unknown as string)).toBe(IDENTITY_RULE);
  });

  it('explicitly denies other company identities (never Claude)', () => {
    expect(IDENTITY_RULE).toContain('NOT Claude');
    expect(IDENTITY_RULE).toContain('NOT ChatGPT');
    expect(IDENTITY_RULE).not.toContain('I am Claude');
  });

  it('keeps the name anchored to Veronica (no drift) and never claims a company identity', () => {
    expect(IDENTITY_RULE).toContain('Your name is Veronica');
    for (const company of ['Claude', 'ChatGPT', 'Gemini', 'GPT', 'OpenAI']) {
      expect(IDENTITY_RULE).not.toMatch(new RegExp(`I['’]?m ${company}`, 'i'));
      expect(IDENTITY_RULE).not.toMatch(new RegExp(`I am ${company}`, 'i'));
    }
  });

  it('lands the identity at the very front, before any short-query override', () => {
    const minimal = 'CRITICAL: The user asked a very short question. Answer in 1 short sentence.';
    const out = prependIdentity(minimal);
    expect(out.indexOf('Your name is Veronica')).toBeLessThan(out.indexOf('CRITICAL'));
  });
});

describe('buildPlatformConstraint', () => {
  it('returns the native-stack rule for standalone / not-web hints', () => {
    for (const hint of [
      'stand alone not a web browser based build',
      'a standalone desktop app',
      'not a web app, runs without a browser',
      'an offline game for my PC',
      'native desktop build',
    ]) {
      const block = buildPlatformConstraint(hint);
      expect(block).toContain('PLATFORM CONSTRAINT');
      expect(block).toContain('pygame');
    }
  });

  it('returns empty for requests without a native hint', () => {
    expect(buildPlatformConstraint('make me a web app with a login page')).toBe('');
    expect(buildPlatformConstraint('')).toBe('');
  });
});

describe('response variety (similar questions get different answers)', () => {
  it('pickGreetingVariant is stable for the same query', () => {
    expect(pickGreetingVariant('hello there')).toBe(pickGreetingVariant('hello there'));
  });

  it('pickGreetingVariant returns different variants across different greetings', () => {
    const queries = ['hi', 'hello', 'hey', 'good morning', 'how are you', 'whatsup', 'howdy', 'yo', 'sup', 'hiya'];
    const variants = new Set(queries.map(pickGreetingVariant));
    expect(variants.size).toBeGreaterThan(1);
    for (const v of variants) {
      expect(/^(Hi|Hello|Hey)/.test(v)).toBe(true);
    }
  });

  it('ensureQualityGreeting falls back to a varied greeting, not one canned string', () => {
    const a = ensureQualityGreeting('omg', 'hello there');
    const b = ensureQualityGreeting('omg', 'good morning');
    expect(/^(Hi|Hello|Hey)/.test(a)).toBe(true);
    expect(a).not.toBe(b); // different queries -> different fallbacks
  });

  it('ensureQualityGreeting fallback is deterministic per query (cache-safe)', () => {
    expect(ensureQualityGreeting('omg', 'hi')).toBe(ensureQualityGreeting('omg', 'hi'));
  });

  it('ensureQualityGreeting preserves a good greeting', () => {
    expect(ensureQualityGreeting('Hey! What can I build for you?', 'hi')).toBe('Hey! What can I build for you?');
  });

  it('buildVarietyInstruction is empty without prior assistant turns', () => {
    expect(buildVarietyInstruction([])).toBe('');
    expect(buildVarietyInstruction([{ role: 'user', content: 'hi' }])).toBe('');
  });

  it('buildVarietyInstruction includes prior answers and a don\'t-repeat rule', () => {
    const out = buildVarietyInstruction([
      { role: 'user', content: 'what is an API?' },
      { role: 'assistant', content: 'An API is a contract between systems.' },
      { role: 'user', content: 'what is an API again?' },
    ]);
    expect(out).toContain('VARIETY RULE');
    expect(out).toContain('GENUINELY DIFFERENT');
    expect(out).toContain('An API is a contract between systems.');
  });

  it('buildVarietyInstruction only echoes the last two assistant turns', () => {
    const out = buildVarietyInstruction([
      { role: 'assistant', content: 'old answer one' },
      { role: 'assistant', content: 'old answer two' },
      { role: 'assistant', content: 'recent answer' },
    ]);
    expect(out).toContain('recent answer');
    expect(out).toContain('old answer two');
    expect(out).not.toContain('old answer one');
  });
});

describe('banter fallbacks (echo guard)', () => {
  it('pickSassyFallback is deterministic per joke and never a dead template', () => {
    expect(pickSassyFallback('your momma was a broken toaster')).toBe(pickSassyFallback('your momma was a broken toaster'));
    const a = pickSassyFallback('your momma was a broken toaster');
    expect(a.length).toBeGreaterThan(10);
    expect(a).not.toMatch(/I\'m not sure how to respond|can you tell me what you/i);
  });

  it('pickSassyFallback varies across different jokes (not one canned string)', () => {
    const jokes = ['your mom', 'fight me 1v1', 'lol', 'you suck', 'moo'];
    const picks = new Set(jokes.map(pickSassyFallback));
    expect(picks.size).toBeGreaterThan(1);
  });

  it('pickShortAck is stable per query and brief', () => {
    expect(pickShortAck('moo')).toBe(pickShortAck('moo'));
    expect(pickShortAck('moo').length).toBeLessThanOrEqual(12);
  });
});
