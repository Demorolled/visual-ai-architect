/**
 * Hover narration — speaks the technical deep-dive for whatever control the
 * mouse comes to rest on.
 *
 * Design constraints that shaped this:
 *
 *  - Nothing is drawn. The narration is audio only, so it never appears in a
 *    screen recording. No tooltip, no overlay, no DOM mutation.
 *
 *  - It must not speak by accident. A control only narrates after the pointer
 *    has rested on it for DWELL_MS, and a given control narrates once per
 *    hover — moving the mouse across a toolbar on the way somewhere else is
 *    silent.
 *
 *  - It must be inert outside a recording. Off unless explicitly enabled: see
 *    `isEnabled()`. A normal build, a normal run, and a fresh install all get
 *    nothing at all.
 *
 *  - Several controls share a label ("Run Tests", "Clear", "Open Folder"),
 *    where the same words do genuinely different things in different panels.
 *    Label lookup alone would narrate the wrong one, so an entry may require a
 *    class on the element to match. `requireClass` entries win over the
 *    unqualified entry for the same key.
 */

import { NARRATION, NarrationEntry } from './narrationMap';
import { speak } from '../utils/tts';

export const NARRATION_STORAGE_KEY = 'vaca-narration';

/** How long the pointer must rest on a control before it speaks. */
const DWELL_MS = 450;

/** Set to true by VITE_VACA_NARRATION=1 at build time. */
const BUILD_DEFAULT = (import.meta as any)?.env?.VITE_VACA_NARRATION === '1';

/** Minimum gap between two narrations, so fast movement cannot queue audio. */
const MIN_GAP_MS = 400;

const ENTRIES: NarrationEntry[] = NARRATION;

/**
 * Lowercase, strip emoji and every non-alphanumeric character. This is what
 * makes matching survive the emoji that prefix most labels, and the HTML
 * entity forms of `&`.
 */
export function normalizeKey(raw: string): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    // emoji, dingbats, arrows, symbols, variation selectors, zero-width joiner
    .replace(/[\u{1F000}-\u{1FFFF}\u{2190}-\u{2BFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** key → entries, in declaration order. */
const INDEX: Map<string, NarrationEntry[]> = (() => {
  const index = new Map<string, NarrationEntry[]>();
  const seen = new Map<string, string>();
  for (const entry of ENTRIES) {
    const keys = [entry.title, ...(entry.match || [])].map(normalizeKey).filter(Boolean);
    for (const key of keys) {
      const bucket = index.get(key) || [];
      // One entry reaching the same key twice (its title and a match alias that
      // normalise identically) is normal, not a collision. Only a second,
      // different entry sharing an unqualified key can narrate the wrong
      // control, so that is the only case worth warning about.
      const others = bucket.filter((e) => e.id !== entry.id);
      if (others.length > 0 && !entry.requireClass && !others.every((e) => e.requireClass)) {
        console.warn(
          `[narration] key "${key}" is ambiguous (${others.map((e) => e.id).join(', ')} vs ${entry.id}) — add requireClass`
        );
      }
      if (!bucket.includes(entry)) {
        bucket.push(entry);
        index.set(key, bucket);
      }
      if (!seen.has(key)) seen.set(key, entry.id);
    }
  }
  return index;
})();

/** Every key in the map — exposed for the reference docs and for tests. */
export function narrationKeys(): string[] {
  return [...INDEX.keys()].sort();
}

/** The element the pointer is actually on, promoted to its nearest control. */
export function controlFor(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null;
  return node.closest<HTMLElement>(
    'button, a[href], select, [role="button"], [data-narration]'
  );
}

/** Candidate keys for an element, most specific first. */
export function candidatesFor(el: Element): string[] {
  const out: string[] = [];
  const push = (v: string | null | undefined) => {
    const n = normalizeKey(v || '');
    if (n) out.push(n);
  };
  push(el.getAttribute('data-narration'));
  push(el.getAttribute('aria-label'));
  push(el.getAttribute('title'));

  // Several labels carry a live count, and the count is part of the text node:
  // "🔧 Fix All (3)", "♻️ Regenerate 2 Missing Modules", "⚡ Generate All (4)".
  // Matching the literal string would make the narration vanish exactly when a
  // build has work to do, so the counted form is tried first and then a
  // count-free form. This is a fallback, never a replacement: a label that
  // already matches keeps its exact meaning.
  const text = (el as HTMLElement).innerText || '';
  push(text); // multi-line labels collapse to spaces
  const uncounted = text.replace(/\([^)]*\)/g, ' ').replace(/\d+/g, ' ');
  if (normalizeKey(uncounted) !== normalizeKey(text)) push(uncounted);

  push(typeof el.className === 'string' ? el.className : null);
  return out;
}

/**
 * Does the element carry this class as a whole class name?
 *
 * Deliberately not `className.includes(token)`: `settings-save-btn` contains
 * `save-btn` as a substring, so a substring test would let the TTS panel's Save
 * steal the hover from the project Save (and vice versa). Class names are
 * space-separated tokens; compare them as tokens.
 */
function hasClass(el: Element, token: string): boolean {
  const cls = typeof el.className === 'string' ? el.className : '';
  return cls.split(/\s+/).includes(token);
}

/**
 * Resolve the narration entry for an element, or null.
 *
 * A class-qualified entry always beats the unqualified one for the same key,
 * so a generic "Clear" cannot steal the hover from the console's own "Clear".
 * If a key is class-qualified and this element's class does not match, the key
 * is treated as a miss and the next candidate is tried — that is what keeps
 * the two "Run Tests" buttons apart instead of falling back to the wrong one.
 */
export function resolveNarration(el: Element | null): NarrationEntry | null {
  if (!el) return null;
  for (const key of candidatesFor(el)) {
    const bucket = INDEX.get(key);
    if (!bucket || bucket.length === 0) continue;
    const qualified = bucket.find((e) => e.requireClass && hasClass(el, e.requireClass));
    if (qualified) return qualified;
    const generic = bucket.find((e) => !e.requireClass);
    if (generic) return generic;
    // Every entry for this key is class-qualified and none matched: not ours.
  }
  return null;
}

/** True when narration should be active for this session. */
export function isEnabled(): boolean {
  try {
    const override = localStorage.getItem(NARRATION_STORAGE_KEY);
    if (override === '1') return true;
    if (override === '0') return false;
  } catch {
    /* storage blocked — fall through to the other signals */
  }
  try {
    const param = new URLSearchParams(window.location.search).get('narration');
    if (param === '1') return true;
    if (param === '0') return false;
  } catch {
    /* no location (unlikely in the renderer) */
  }
  return BUILD_DEFAULT;
}

export function setEnabled(on: boolean): void {
  try {
    localStorage.setItem(NARRATION_STORAGE_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

let installed = false;

/**
 * Install the hover listener. Idempotent. Does nothing when narration is
 * disabled, so a build without the flag pays no cost beyond this call.
 */
export function installHoverNarration(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  const state = {
    hovered: null as HTMLElement | null,
    timer: 0 as unknown as ReturnType<typeof setTimeout> | 0,
    spokenFor: null as HTMLElement | null,
    lastAt: 0,
    spokenCount: 0,
  };

  const debug = (msg: string, extra?: unknown) => {
    if (isEnabled()) console.log(`[narration] ${msg}`, extra ?? '');
  };

  const narrate = (el: HTMLElement) => {
    if (state.spokenFor === el) return;
    const entry = resolveNarration(el);
    if (!entry) {
      debug('no entry for', (el.innerText || el.getAttribute('title') || el.className).slice(0, 60));
      state.spokenFor = el;
      return;
    }
    const now = Date.now();
    if (now - state.lastAt < MIN_GAP_MS) return;
    state.lastAt = now;
    state.spokenFor = el;
    state.spokenCount += 1;
    // Announce the control, then the deep-dive.
    const spoken = `${entry.title}. ${entry.text}`;
    console.log(`[narration] speak ${entry.id} (${spoken.length} chars)`);
    void speak(spoken);
  };

  const onOver = (e: Event) => {
    const el = controlFor(e.target);
    if (el === state.hovered) return;
    state.hovered = el;
    if (state.timer) clearTimeout(state.timer);
    if (!el) {
      state.spokenFor = null;
      return;
    }
    state.timer = setTimeout(() => narrate(el), DWELL_MS);
  };

  const onOut = (e: Event) => {
    const el = controlFor(e.target);
    if (!el) return;
    const to = (e as MouseEvent).relatedTarget;
    if (el.contains(to as Node)) return; // still inside the same control
    if (el === state.hovered) {
      state.hovered = null;
      if (state.timer) clearTimeout(state.timer);
    }
    // Re-arm so deliberately re-hovering the same control speaks it again.
    if (state.spokenFor === el) state.spokenFor = null;
  };

  document.addEventListener('mouseover', onOver, true);
  document.addEventListener('mouseout', onOut, true);

  // Handles for verification and for turning it on/off mid-recording from the
  // renderer console without a rebuild.
  (window as any).__vacaNarration = {
    enabled: isEnabled,
    setEnabled,
    speakEntry: (id: string) => {
      const entry = ENTRIES.find((e) => e.id === id);
      if (!entry) return `unknown id: ${id}`;
      void speak(`${entry.title}. ${entry.text}`);
      return `speaking ${id}`;
    },
    resolve: (el: Element) => resolveNarration(el)?.id ?? null,
    entries: () => ENTRIES.map((e) => ({ id: e.id, title: e.title })),
    keys: narrationKeys,
    stats: () => ({ spoken: state.spokenCount, lastAt: state.lastAt }),
  };

  debug(
    `installed (${ENTRIES.length} entries, ${INDEX.size} keys, enabled=${isEnabled()})`
  );
}

export default installHoverNarration;
