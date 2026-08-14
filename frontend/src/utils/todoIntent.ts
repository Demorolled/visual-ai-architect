/**
 * todoIntent.ts — detect when a chat message is asking to SEE the deep-scan
 * todo list (TODO fixes.txt), so the frontend opens a real todo view instead
 * of the LLM just claiming one. Pure + testable; used by ReasoningPanel's
 * auto-open.
 */

/** "build me a todo app / a todo list app" — an app build, NOT a show request. */
const APP_BUILD_GUARD = /\b(?:todo|to-do)\s+(?:list\s+)?app\b/i;

/** "add X to the todo list" / "mark 2.1 done" — modifying the list, not viewing it. */
const WRITE_GUARD =
  /\b(?:add|remove|delete|update|edit|mark|check|tick|complete|finish|clear|reset|move|prioritize|reorder)\b[^.!?\n]{0,60}?\btodo\b/i;

const SHOW_TRIGGERS = [
  // "can you open the todo list", "show me your todo list", "display the todos"…
  /\b(?:show|open|display|view|see|read|browse|pull\s+up|look\s+at|let\s+me\s+see|give\s+me)\b[^.!?\n]{0,40}?\b(?:your|the|my)?\s*(?:todo|to-do)s?\s*(?:list|items|board)?\b/i,
  // Bare mention of the todo list as a thing to look at.
  /\byour\s+todo\s+list\b/i,
  /\bthe\s+todo\s+list\b[^.!?\n]{0,30}?\b(?:look|see|view|open|show|read)\b/i,
  // "what's on the todo list" — the list answers it directly.
  /\bwhat'?s\s+(?:on|in)\s+(?:the|your)\s+todo\s+list\b/i,
];

export function detectTodoIntent(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  if (APP_BUILD_GUARD.test(lower)) return false;
  if (WRITE_GUARD.test(lower)) return false;
  return SHOW_TRIGGERS.some((re) => re.test(lower));
}
