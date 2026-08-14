/**
 * wikiIntent.ts — detect when a chat message is asking to SEE the wiki
 * (modelVeronice.txt), so the frontend opens a real wiki view instead of the
 * LLM just claiming one. Pure + testable; used by ReasoningPanel's auto-open.
 */

/** \"write this into your wiki\" / \"save this to the wiki\" — a memory write, NOT a show request. */
const WRITE_GUARD =
  /\b(?:write|save|remember|record|store|add|update|put|append|sync|create|edit|modify|change)\b[^.!?\n]{0,60}?\bwiki\b/i;

/** \"what does your wiki say about X\" / \"search your wiki for X\" — knowledge queries. */
const QUERY_GUARD =
  /\b(?:what|tell\s+me|how|why|where|when|search|find|look\s+up|grep)\b[^.!?\n]{0,30}?\bwiki\b[^.!?\n]{0,50}?\b(?:say|says|have|has|know|knows|contain|about|on|regarding|mention|for|search|find)\b/i;

const SHOW_TRIGGERS = [
  // \"can you show your wiki\", \"show me the wiki\", \"open/read/display your wiki\"…
  /\b(?:show|see|open|display|view|read|browse|pull up|look at|let me see|give me)\b[^.!?\n]{0,40}?\b(?:your|the|my)?\s*wiki\b/i,
  // Bare mentions of the wiki as a thing to look at.
  /\byour wiki\b/i,
  /\bwiki file\b/i,
];

export function detectWikiIntent(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  if (WRITE_GUARD.test(lower)) return false;
  if (QUERY_GUARD.test(lower)) return false;
  return SHOW_TRIGGERS.some((re) => re.test(lower));
}
