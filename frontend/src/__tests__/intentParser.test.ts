import { describe, it, expect } from 'vitest';
import {
  createIntent,
  parseCommandToIntent,
  formatIntentConfirmation,
  INTENT_COMMAND_HELP,
} from '../utils/intentParser';

describe('createIntent', () => {
  it('builds a packet with the requested type, payload and source', () => {
    const intent = createIntent('widget_create', { type: 'button', label: 'Go' }, 'cli');
    expect(intent.type).toBe('widget_create');
    expect(intent.payload).toEqual({ type: 'button', label: 'Go' });
    expect(intent.source).toBe('cli');
  });

  it('defaults source to terminal and stamps id + timestamp', () => {
    const intent = createIntent('ping', {});
    expect(intent.source).toBe('terminal');
    expect(intent.id.startsWith('intent_')).toBe(true);
    expect(intent.timestamp).toBeTruthy();
    expect(() => new Date(intent.timestamp).toISOString()).not.toThrow();
  });

  it('generates unique ids across calls', () => {
    const a = createIntent('ping', {});
    const b = createIntent('ping', {});
    expect(a.id).not.toBe(b.id);
  });
});

describe('parseCommandToIntent', () => {
  it('returns null for non-command text', () => {
    expect(parseCommandToIntent('add a button please')).toBeNull();
    expect(parseCommandToIntent('')).toBeNull();
    expect(parseCommandToIntent('  ')).toBeNull();
  });

  it('parses /add-button with a label', () => {
    const intent = parseCommandToIntent('/add-button Submit');
    expect(intent).not.toBeNull();
    expect(intent!.type).toBe('widget_create');
    expect(intent!.payload).toMatchObject({ type: 'button', label: 'Submit' });
  });

  it('defaults /add-button label and uses alias /add-btn', () => {
    expect(parseCommandToIntent('/add-button')!.payload.label).toBe('New Button');
    expect(parseCommandToIntent('/add-btn Start')!.payload.type).toBe('button');
  });

  it('parses widget add commands with default positions', () => {
    expect(parseCommandToIntent('/add-slider Volume')!.payload).toMatchObject({ type: 'slider', label: 'Volume' });
    expect(parseCommandToIntent('/add-toggle')!.payload).toMatchObject({ type: 'toggle', label: 'Toggle' });
  });

  it('maps /add-label to a label widget and /add-display to a display widget', () => {
    expect(parseCommandToIntent('/add-label Hello')!.payload.type).toBe('label');
    expect(parseCommandToIntent('/add-display Status')!.payload.type).toBe('display');
  });

  it('parses select/pick and delete/remove', () => {
    expect(parseCommandToIntent('/select Submit')).toMatchObject({
      type: 'widget_select', payload: { label: 'Submit' },
    });
    expect(parseCommandToIntent('/pick Volume')).toMatchObject({ type: 'widget_select' });
    expect(parseCommandToIntent('/delete Old')).toMatchObject({
      type: 'widget_delete', payload: { label: 'Old' },
    });
    expect(parseCommandToIntent('/remove Old')).toMatchObject({ type: 'widget_delete' });
  });

  it('parses theme with default dark', () => {
    expect(parseCommandToIntent('/theme neon-sunset')).toMatchObject({
      type: 'theme_set', payload: { theme: 'neon-sunset' },
    });
    expect(parseCommandToIntent('/theme')).toMatchObject({ payload: { theme: 'dark' } });
  });

  it('parses /set key value into context_set', () => {
    expect(parseCommandToIntent('/set theme dark')).toMatchObject({
      type: 'context_set', payload: { key: 'theme', value: 'dark' },
    });
    expect(parseCommandToIntent('/set volume')).toMatchObject({
      payload: { key: 'volume', value: '' },
    });
  });

  it('parses navigate/go and ping', () => {
    expect(parseCommandToIntent('/navigate audio')).toMatchObject({
      type: 'navigate', payload: { module: 'audio' },
    });
    expect(parseCommandToIntent('/go')).toMatchObject({ payload: { module: 'gui' } });
    expect(parseCommandToIntent('/ping')).toMatchObject({ type: 'ping' });
  });

  it('returns null for unknown commands (pass-through to LLM)', () => {
    expect(parseCommandToIntent('/definitely-not-a-command')).toBeNull();
  });

  it('is case-insensitive on the command name', () => {
    expect(parseCommandToIntent('/ADD-BUTTON Go')!.type).toBe('widget_create');
    expect(parseCommandToIntent('/Theme Solar')!.payload.theme).toBe('Solar');
  });

  it('propagates a custom source', () => {
    expect(parseCommandToIntent('/ping', 'cli')!.source).toBe('cli');
  });
});

describe('formatIntentConfirmation', () => {
  it('formats success and failure with the right emoji', () => {
    const intent = createIntent('widget_create', { label: 'Go', type: 'button' });
    expect(formatIntentConfirmation(intent, true)).toContain('✅');
    expect(formatIntentConfirmation(intent, false)).toContain('⚠️');
  });

  it('formats every intent type', () => {
    const cases: [Parameters<typeof createIntent>[0], string][] = [
      ['widget_select', 'Selected **Submit**'],
      ['widget_delete', 'Deleted **Submit**'],
      ['theme_set', 'Theme set to **dark**'],
      ['context_set', 'Context `k` set to `v`'],
      ['navigate', 'Navigating to **gui** module'],
      ['ping', 'Bridge pinged'],
    ];
    for (const [type, expected] of cases) {
      const payload =
        type === 'widget_create' ? { label: 'X', type: 'button' } :
        type === 'widget_select' || type === 'widget_delete' ? { label: 'Submit' } :
        type === 'theme_set' ? { theme: 'dark' } :
        type === 'context_set' ? { key: 'k', value: 'v' } :
        type === 'navigate' ? { module: 'gui' } : {};
      const intent = createIntent(type, payload);
      expect(formatIntentConfirmation(intent, true)).toContain(expected);
    }
  });
});

describe('INTENT_COMMAND_HELP', () => {
  it('documents every supported command', () => {
    const help = INTENT_COMMAND_HELP;
    expect(help).toContain('/add-button');
    expect(help).toContain('/add-slider');
    expect(help).toContain('/add-toggle');
    expect(help).toContain('/select');
    expect(help).toContain('/delete');
    expect(help).toContain('/theme');
    expect(help).toContain('/set');
    expect(help).toContain('/navigate');
  });
});
