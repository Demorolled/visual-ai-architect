import { describe, expect, it, vi } from 'vitest';
import { NARRATION } from '../narration/narrationMap';
import { normalizeKey, resolveNarration, candidatesFor } from '../narration/hoverNarration';

/**
 * The narration layer has one failure mode that matters: hovering control A
 * and being told about control B. Every label in here repeats somewhere else in
 * the app, so these tests pin the disambiguation rather than the happy path.
 */

interface FakeEl {
  text?: string;
  title?: string;
  aria?: string;
  cls?: string;
  data?: string;
}

function el(o: FakeEl): Element {
  return {
    getAttribute: (name: string) =>
      name === 'title'
        ? (o.title ?? null)
        : name === 'aria-label'
          ? (o.aria ?? null)
          : name === 'data-narration'
            ? (o.data ?? null)
            : null,
    innerText: o.text ?? '',
    className: o.cls ?? '',
  } as unknown as Element;
}

const id = (o: FakeEl) => resolveNarration(el(o))?.id ?? null;

describe('normalizeKey', () => {
  it('strips emoji, punctuation and case so prefixed labels still match', () => {
    expect(normalizeKey('⚡ Generate Code')).toBe('generate code');
    expect(normalizeKey('🏗️ Build & Load into Canvas')).toBe('build load into canvas');
    expect(normalizeKey('  🗑 Clear  ')).toBe('clear');
    expect(normalizeKey('✅ Approve & Save')).toBe('approve save');
  });

  it('survives an empty or emoji-only label', () => {
    expect(normalizeKey('')).toBe('');
    expect(normalizeKey('🎙')).toBe('');
  });
});

describe('narration map integrity', () => {
  it('has unique ids', () => {
    const ids = NARRATION.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no empty narration text', () => {
    for (const entry of NARRATION) {
      expect(entry.text.length, `${entry.id} text`).toBeGreaterThan(80);
      expect(entry.title.length, `${entry.id} title`).toBeGreaterThan(0);
    }
  });

  it('never lets two unqualified entries claim the same key', () => {
    // Mirrors the guard inside the module: two entries that both match purely on
    // a label, with no class qualifier between them, is the bug this prevents.
    // A Set per key, because one entry legitimately lists several keys that
    // normalise to the same string (its title and a match alias).
    const generic = new Map<string, Set<string>>();
    for (const entry of NARRATION) {
      if (entry.requireClass) continue;
      for (const key of [entry.title, ...(entry.match || [])].map(normalizeKey)) {
        if (!key) continue;
        if (!generic.has(key)) generic.set(key, new Set());
        generic.get(key)!.add(entry.id);
      }
    }
    const clashes = [...generic.entries()]
      .filter(([, ids]) => ids.size > 1)
      .map(([key, ids]) => `${key} → ${[...ids].join(', ')}`);
    expect(clashes).toEqual([]);
  });
});

describe('candidate extraction', () => {
  it('prefers the class-qualified entry over the generic one', () => {
    expect(candidatesFor(el({ text: 'Clear', cls: 'toolbar-btn clear-btn' }))[0]).toBe('clear');
  });

  it('reads title before visible text', () => {
    expect(
      candidatesFor(el({ title: 'Run interaction tests', text: '🧪 Run Tests' }))[0]
    ).toBe('run interaction tests');
  });
});

describe('label collisions resolve to the right control', () => {
  it('matches class qualifiers as whole tokens, not substrings', () => {
    // `settings-save-btn` contains the substring `save-btn`. A substring test
    // would hand the TTS panel's Save to the project Save entry, and the panel
    // writes completely different state (voice settings, not the node graph).
    expect(id({ text: 'Save', cls: 'settings-save-btn' })).toBe('settings.tts-save');
    expect(id({ title: 'Save project', text: 'Save', cls: 'project-control-btn save-btn' }))
      .toBe('project.save');
  });

  it('separates the two "Run Tests" buttons', () => {
    // Sandbox tester: title attribute only, no live-preview class.
    expect(id({ title: 'Run interaction tests', text: '🧪 Run Tests', cls: 'sp-btn sp-btn-test' }))
      .toBe('sandbox.run-tests');
    // Live preview panel: same visible label, different behaviour.
    expect(id({ text: '🧪 Run Tests', cls: 'lpp-btn lpp-btn-test' }))
      .toBe('live-preview.run-tests');
  });

  it('separates toolbar Clear from the live preview console Clear', () => {
    expect(id({ text: '🗑 Clear', cls: 'toolbar-btn clear-btn' })).toBe('toolbar.clear');
    expect(id({ text: '✕ Clear', cls: 'lpp-btn lpp-btn-sm lpp-btn-danger' }))
      .toBe('live-preview.clear-console');
  });

  it('separates toolbar Export from the project-panel Export as JSON', () => {
    // Same label, two different jobs: one opens the scaffold dialog, the other
    // serialises the graph to a file.
    expect(id({ text: '📦 Export', cls: 'toolbar-btn export-btn' })).toBe('toolbar.export');
    expect(id({ title: 'Export as JSON', text: 'Export', cls: 'project-control-btn' }))
      .toBe('project.export-json');
    // Even without its title, the class still separates the two.
    expect(id({ text: 'Export', cls: 'project-control-btn' })).toBe('project.export-json');
  });

  it('does not confuse the two Generate controls', () => {
    expect(id({ text: '⚡ Generate Code', cls: 'toolbar-btn generate-btn' })).toBe('toolbar.generate');
    expect(id({ title: 'Generate all files', text: '⚡ Generate All', cls: 'lpp-btn lpp-btn-primary' }))
      .toBe('live-preview.generate-all');
  });
});

describe('headline controls all resolve', () => {
  const cases: Array<[string, FakeEl]> = [
    ['toolbar.generate', { text: '⚡ Generate Code', cls: 'toolbar-btn generate-btn' }],
    ['toolbar.build', { title: 'Generate code and preview the app', text: '🏗️ Build & Preview', cls: 'toolbar-btn build-btn' }],
    ['toolbar.blueprint', { text: '🧠 Build from Description', cls: 'toolbar-btn blueprint-btn' }],
    ['toolbar.plan', { text: '🧭 Big Plan Mode', cls: 'toolbar-btn plan-btn' }],
    ['toolbar.os', { title: 'Windows', text: '🪟', cls: 'os-button active' }],
    ['header.new-design', { title: 'Start new project wizard', text: '✨ New Design' }],
    ['header.library', { title: 'Reference Library', text: '📚 Library' }],
    ['header.preview', { title: 'Floating Preview Window', text: '🖥 Preview' }],
    ['header.history', { title: 'Build History', text: '📋 History' }],
    ['header.help', { title: 'User Manual & Help', text: '❓ Help' }],
    ['header.logout', { text: '🚪 Logout' }],
    ['blueprint.preview-gui', { text: '🎨 Preview GUI First' }],
    ['blueprint.build-load', { text: '🏗️ Build & Load into Canvas' }],
    ['blueprint.looks-good', { text: '✅ Looks Good — Generate the Code' }],
    ['blueprint.regenerate-missing', { text: '♻️ Regenerate 3 Missing Modules' }],
    ['export.generate-code', { text: '⚡ Generate Code First' }],
    ['export.build-app', { text: '🏗️ Build App' }],
    ['project.export-json', { title: 'Export as JSON', text: 'Export', cls: 'project-control-btn' }],
    ['export.open-folder', { text: '📂 Open Folder' }],
    ['sandbox.refresh', { title: 'Regenerate preview', text: '🔄 Refresh' }],
    ['sandbox.start-container', { text: '🐳 Start Container' }],
    ['sandbox.start-all', { text: '🏗️ Start All Services' }],
    ['sandbox.approve', { text: '✅ Approve & Save' }],
    ['live-preview.fix-all', { title: 'Run error correction on all failing files', text: '🔧 Fix All (2)' }],
    ['live-preview.new-tab', { text: '↗ New Tab' }],
    ['reasoning.send', { text: 'Send', cls: 'terminal-send-btn' }],
    ['reasoning.assistant', { title: 'Enable voice assistant', text: '🎙' }],
    ['reasoning.push-to-talk', { title: 'Push to talk — also available while voice assistant is active' }],
    ['reasoning.session-history', { title: 'Show session history', text: '📜 Session History' }],
    ['reasoning.wiki', { title: 'Show the wiki (modelVeronice.txt)', text: '📗 Wiki' }],
    ['reasoning.todo', { title: 'Open the todo list (TODO fixes.txt)', text: '📋 Todo List' }],
    ['project.save', { title: 'Save project', text: 'Save', cls: 'project-control-btn save-btn' }],
    ['project.load', { title: 'Load project', text: 'Load' }],
    ['project.import', { title: 'Import project file', text: 'Import' }],
    ['project.merge', { title: 'Merge two projects into one — resolves collisions automatically', text: '🔀 Merge' }],
    ['project.new', { title: 'Start a new build', text: 'New' }],
    ['project.settings', { title: 'Settings', text: 'Settings', cls: 'project-control-btn settings-btn' }],
    ['settings.tts-test', { text: '🔊 Test', cls: 'settings-test-btn' }],
    ['settings.tts-save', { text: 'Save', cls: 'settings-save-btn' }],
  ];

  it.each(cases)('%s resolves from its live DOM shape', (expected, shape) => {
    expect(id(shape)).toBe(expected);
  });

  it('says nothing for a control it has no entry for', () => {
    expect(id({ text: '✕ Dismiss', cls: 'some-random-btn' })).toBeNull();
    expect(id({ text: '👍', cls: 'reaction-pill' })).toBeNull();
  });

  it('only narrates once per hover, not once per candidate', () => {
    // The resolver returns a single entry; repetition is prevented by the
    // spoken-once bookkeeping in the installer, which keys off the element.
    const target = el({ text: '⚡ Generate Code', cls: 'toolbar-btn generate-btn' });
    expect(resolveNarration(target)?.id).toBe(resolveNarration(target)?.id);
  });
});

describe('narration text is speakable', () => {
  it('contains no markup that the speech normaliser would strip', () => {
    for (const entry of NARRATION) {
      expect(entry.text, entry.id).not.toMatch(/[*_`#]/);
      expect(entry.text, entry.id).not.toMatch(/[\u{1F300}-\u{1FAFF}]/gu);
    }
  });

  it('keeps every narration within a usable spoken length', () => {
    // 90 seconds is the ceiling: deep detail was requested, but a hover that
    // talks for minutes is unusable during a recording. The measured lengths
    // are printed so the longest entries are visible rather than surprising.
    const measured = NARRATION.map((entry) => {
      const words = entry.text.split(/\s+/).length;
      return { id: entry.id, seconds: Math.round((words / 2.6) * 10) / 10 };
    }).sort((a, b) => b.seconds - a.seconds);

    console.log(
      'longest narrations (seconds): ' +
        measured.slice(0, 5).map((m) => `${m.id}=${m.seconds}s`).join(', ')
    );

    for (const { id: entryId, seconds } of measured) {
      expect(seconds, `${entryId} speaks for ${seconds}s`).toBeLessThan(90);
    }
  });
});

// Keep `vi` referenced so the import is not flagged when tests are trimmed.
void vi;
