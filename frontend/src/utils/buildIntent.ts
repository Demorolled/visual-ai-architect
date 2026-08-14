/**
 * Build-intent detection for the chat panel (ReasoningPanel).
 *
 * Extracted from ReasoningPanel.tsx into a pure, testable module so the
 * goal-capture logic can be unit-tested. The original implementation
 * truncated the goal at the first app-type suffix word ("game", "app", …),
 * silently dropping a trailing game/product TITLE — "create a classic arcade
 * game void raider" became goal "classic arcade game" and the name "void
 * raider" never reached the blueprint matcher.
 */

export interface BuildIntent {
  goal: string;
  purpose: string;
  os: string;
}

/** Extended suffix list covering common app/product descriptors. */
export const APP_SUFFIXES =
  'app|application|program|tool|system|software|website|site|webapp|dashboard|platform|game|service|api|cli|gui|widget|view|page|module|plugin|extension|component|editor|player|viewer|reader|handler|manager|engine|client|server|builder|maker|studio|browser|explorer|designer|creator|generator|analyzer|converter|parser|renderer|processor|tracker|monitor|logger|tester|runner|loader|installer|launcher|watcher|scanner|cleaner|controller|adapter|bridge|wrapper|proxy|gateway|interface|connector|mapper|filter|decorator|interceptor';

const NEGATIVE_PATTERNS = [
  /how\s+(?:to|do|can|would|should|does)/i,
  /what\s+(?:is|are|does|would|should)/i,
  /can\s+(?:you|i|we)\s+(?:tell|explain|describe|show|list)/i,
  /tell\s+me\s+(?:about|how|what)/i,
  /explain\s+/i,
  /describe\s+/i,
  /(?:have\s+you|did\s+you|do\s+you)\s+(?:ever|built|created|made)/i,
];

/** Purpose/preposition connectors — text after these is NOT a title. */
const TITLE_CONNECTORS =
  /^(?:for|that|which|to|with|using|on|in|of|and|where|so|because|like|under|over|via|by|from|at|into|during)\b/i;

/**
 * Recover a trailing game/product TITLE that the app-suffix capture dropped.
 *
 * Given the text that follows the matched goal (" void raider",
 * " called void raider", " for my family", " that syncs across devices"),
 * returns the title words (or '' when the remainder is a purpose clause).
 * Handles "called/named/titled/dubbed X" and bare trailing noun phrases.
 */
export function extractTrailingTitle(remainder: string): string {
  let t = (remainder || '').trim();
  if (!t) return '';

  // "called void raider" / "named X" / "titled X" → the name itself.
  const called = t.match(/^(?:called|named|titled|dubbed)\s+(.+)$/i);
  if (called) t = called[1].trim();

  // Purpose / preposition clauses are not a title.
  if (TITLE_CONNECTORS.test(t)) return '';

  // Cut trailing sentence punctuation.
  t = t.replace(/[.!?].*$/, '').trim();
  if (!t) return '';

  // A title is a short bare noun phrase, not a full clause.
  if (t.split(/\s+/).length > 5) return '';
  return t;
}

/**
 * Detect whether the user is asking to build/create/make an app and extract
 * the goal (including any trailing title), purpose, and target OS.
 */
export function detectBuildIntent(text: string): BuildIntent | null {
  const lower = text.toLowerCase().trim();

  const buildPatterns = [
    new RegExp(`(?:build|create|make|design|generate|develop|code)\\s+(?:me\\s+)?(?:a|an|the|my|another|new)\\s+(\\w[\\w\\s]*(?:${APP_SUFFIXES}))`, 'i'),
    new RegExp(`(?:i\\s+(?:want\\s+(?:to\\s+)?)?(?:build|create|make|design|generate|develop|code)\\s+)(?:a|an|the|my|another|new)?\\s*(\\w[\\w\\s]*(?:${APP_SUFFIXES}))`, 'i'),
    new RegExp(`(?:let'?s?\\s+)(?:build|create|make|design|generate|develop|code)\\s+(?:a|an|the|my|another|new)?\\s*(\\w[\\w\\s]*(?:${APP_SUFFIXES}))`, 'i'),
    new RegExp(`^(?:build|create|make|design|generate|develop|code)\\s+(?:a|an|the)?\\s*(\\w[\\w\\s]*(?:${APP_SUFFIXES}))`, 'i'),
  ];

  // Skip questions about building rather than a command to build.
  for (const neg of NEGATIVE_PATTERNS) {
    if (neg.test(lower)) return null;
  }

  // Skip very short messages or messages about existing projects.
  if (lower.length < 15) return null;
  if (/already|existing|current|previous|my\s+(?:last|old|other)/i.test(lower)) return null;

  for (const pattern of buildPatterns) {
    const match = lower.match(pattern);
    if (!match) continue;

    const baseGoal = match[1]?.trim() || '';
    // Recover a trailing title that the suffix-based capture dropped
    // ("classic arcade game void raider" → "classic arcade game" + "void raider").
    // Only when the remainder is a NEW word — a continuation like
    // "weather app"+"lication" (from "application") is not a title.
    const remainder = lower.slice((match.index ?? 0) + match[0].length);
    const title = /^\s/.test(remainder) ? extractTrailingTitle(remainder) : '';

    // Decide the 'app' suffix from the BASE goal (before the title), so a
    // titled game like "space shooter game void raider" doesn't get " app"
    // glued after the title.
    const knownSuffixes = APP_SUFFIXES.split('|');
    const baseGoalLower = baseGoal.toLowerCase();
    const hasKnownSuffix = knownSuffixes.some((s) => baseGoalLower.endsWith(s));
    let goal = baseGoal;
    if (!hasKnownSuffix && !baseGoalLower.includes('app')) {
      goal = goal + ' app';
    }
    if (title) goal = `${goal} ${title}`.trim();

    // Clean up trailing punctuation.
    goal = goal.replace(/[.,!?]+$/, '').trim();

    // Try to extract purpose from the text (after "that/which/for/to").
    let purpose = '';
    const purposeMatch = lower.match(/(?:that|which|for|to)\s+(\w[\w\s]+)/i);
    if (purposeMatch) {
      purpose = purposeMatch[1].replace(/[.,!?]+$/, '').trim().substring(0, 200);
    }

    // Try to detect target OS.
    let os = 'linux';
    if (/windows|win|microsoft/i.test(lower)) os = 'windows';
    else if (/mac\s*(?:os)?|macos|apple|iphone|ios|ipad|macintosh/i.test(lower)) os = 'mac';
    else if (/iphone|ios|ipad|ipod/i.test(lower)) os = 'ios';
    else if (/android|google\s+pixel|samsung/i.test(lower)) os = 'android';

    return { goal, purpose, os };
  }

  return null;
}
