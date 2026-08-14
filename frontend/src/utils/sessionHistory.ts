/**
 * sessionHistory.ts — detect when a chat message is asking to SEE the session
 * history (past sessions / what we've worked on), so the frontend can open the
 * Session History window instead of just talking about it.
 *
 * This is the pure, testable core used by ReasoningPanel's auto-open logic.
 */

/**
 * True when "session history" is describing an app feature rather than asking
 * to view history — e.g. "a pomodoro timer with session history and stats".
 * These must NEVER trigger the session-history window.
 */
function describesAppFeature(text: string): boolean {
  return /\b(?:with|including|that has|featuring|incl\.)\b[^.!?\n]{0,80}?\bsession\s+histor/i.test(text);
}

/** Whether the user is asking to see the session history (not building an app with one). */
export function detectSessionHistoryIntent(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const lower = t.toLowerCase();

  // Never hijack an app build request — "build a pomodoro timer with session history".
  if (/\b(?:build|create|make|design|generate|develop|code)\b/i.test(lower)) return false;
  // "a pomodoro timer with session history and stats" — a feature, not a request.
  if (describesAppFeature(lower)) return false;

  const triggers = [
    /\bsession\s+histor/i, // "session history" / "session histories"
    /(?:our|past|previous|old|earlier|recent)\s+sessions?\b/i, // "our sessions", "past sessions"
    /\bwhat was our last session\b/i,
    /\blast session\b/i,
    /\bhow far back (?:does|did|can) (?:your|our) memory go\b/i,
    /\bsaved sessions?\b/i,
    /(?:show|see|display|list|view|open|look at|check|get|pull up|give)\b[^.!?\n]{0,50}?\bsessions?\b/i,
  ];
  return triggers.some((re) => re.test(lower));
}
