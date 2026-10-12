/**
 * previewIntent — detect when the user asks to see/preview an app's interface
 * so the frontend can open the planned-interface mockup window (requestPreview).
 *
 * Pure + unit-tested, mirroring wikiIntent / todoIntent. The OLD inline regex
 * in ReasoningPanel only matched "show/see/give/get me a preview" and
 * "preview of X" — so "can you generate a preview of the board" (and the typo
 * "previw") never opened the window, while the LLM was told to claim it did.
 * This detector is broader: any "X a preview/mockup", "preview of/for X",
 * "preview the X", plus tolerant of the "previw"/"priview" typo family.
 */

export interface PreviewIntent {
  asked: boolean;
  /** Best-effort goal for the mockup ('' when nothing specific extracted). */
  goal: string;
}

// Preview noun, tolerant of the common "previw"/"priview"/"prevue" typos.
const PREVIEW_NOUN = 'previ?e?w|mockup';

/** Any "VERB a preview [of X]" / "VERB me a preview" phrasing. */
const VERB_PATTERNS = [
  new RegExp(
    `(?:generate|make|create|build|show|see|display|give|get|open|load|render|draw|produce|design|launch)\\s+` +
    `(?:me\\s+)?(?:a|an|the|my)?\\s*(?:gui\\s+)?(?:${PREVIEW_NOUN})\\b`,
    'i',
  ),
];

/** "preview of X", "preview for X", "mockup of X". */
const OF_PATTERN = new RegExp(`(?:${PREVIEW_NOUN})\\s+(?:of|for)\\s+`, 'i');

/** "preview the board", "preview my app", "mockup the site". */
const THE_PATTERN = new RegExp(`(?:${PREVIEW_NOUN})\\s+(?:the|my|your|this)\\s+`, 'i');

/** Bare "show a preview" / "want a preview" without a goal noun. */
const BARE_PATTERN = new RegExp(`\\b(?:${PREVIEW_NOUN})\\b`, 'i');

const GOAL_STRIP = new RegExp(
  `^(?:can\\s+you\\s+|please\\s+|could\\s+you\\s+)?` +
  `(?:generate|make|create|build|show|see|display|give|get|open|load|render|draw|produce|design|launch)\\s+` +
  `(?:me\\s+)?(?:a|an|the|my)?\\s*(?:gui\\s+)?(?:${PREVIEW_NOUN})\\s*` +
  `(?:of|for)?\\s*`,
  'i',
);

/** A word that ends the goal (sentence punctuation or a fresh clause).
 *  `.*$` truncates everything after the stop so the goal stays a clean phrase
 *  ("the board. Make it black…" → "the board"). */
const GOAL_STOP = /(?:[.!?]|\b(?:make|so|then|with|where|please|build)\b).*$/i;

export function detectPreviewIntent(text: string): PreviewIntent {
  const t = (text || '').trim();
  if (!t) return { asked: false, goal: '' };

  const verbHit = VERB_PATTERNS.some((re) => re.test(t));
  const ofHit = OF_PATTERN.test(t);
  const theHit = THE_PATTERN.test(t);
  const asked = verbHit || ofHit || theHit || (BARE_PATTERN.test(t) && /\b(?:preview|mockup)\b/i.test(t) && /\b(?:show|see|want|need|like|open|generate|make|create)\b/i.test(t));
  if (!asked) return { asked: false, goal: '' };

  // Extract the goal: strip the preview verb phrase, keep up to the first
  // clause stop. "can you generate a preview of the board. Make it black…" → "the board".
  const remainder = t.replace(GOAL_STRIP, '').trim();
  let goal = remainder.replace(GOAL_STOP, '').trim();
  goal = goal.replace(/[^a-z0-9 -]/gi, '').trim();
  // A bare "yes"/"that"/"it"/"one" is not a goal.
  if (/^(?:yes|that|it|one|this|them|they)\s*$/i.test(goal)) goal = '';
  if (goal.split(/\s+/).length > 12) goal = goal.split(/\s+/).slice(0, 12).join(' ');

  return { asked: true, goal };
}
