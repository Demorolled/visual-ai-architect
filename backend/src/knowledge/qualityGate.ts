/**
 * qualityGate — the ONE quality check for anything that enters the knowledge
 * store or training capture paths.
 *
 * Extracted from learningEngine.ts so knowledgeStore.addPattern() (the funnel
 * every capture path dumps into) can enforce the same deterministic gate as the
 * learning engine, without a circular import. Any code-like content that fails
 * this gate is never stored as a pattern, regardless of what the caller says.
 *
 * The gate catches the 2026-08-13 "3d chees game" poisoning class:
 *   - ``` markdown fences written into .ts files (TS1443/TS1160)
 *   - `---` batched-response separators (one answer smuggling many files)
 *   - trailing explanation prose ("In this solution...", "This code defines...")
 *   - prompt scaffolding echoed into the file ("REAL FILE CONTENT")
 *   - JSX-in-.ts (TS1005) and stub/placeholder bodies
 */

// Stub / placeholder bodies — never valid training examples.
const STUB_PATTERNS = [
  /not implemented/i,
  /placeholder\s+for/i,
  /coming soon/i,
  /lorem ipsum/i,
  /unimplemented/i,
  /throw new Error\(['"]not/i,
  /TODO: Implement/i,
];

// JSX-in-.ts: a .ts file containing JSX element syntax (<div className=...>,
// </div>) breaks tsc with TS1005. If it appears outside a string/comment, the
// file is not a clean example and must not be learned from.
//
// IMPORTANT — must NOT false-positive on legitimate TypeScript generics such
// as Promise<Foo>, Map<string>, Array<Item>, Record<string, X>: those have NO
// whitespace after the tag name (and are often capitalized). So we only flag:
//   - opening tags with attributes:  <div className="x">, <li key={i}>, <br />
//   - closing tags:                  </div>, </li>
const JSX_IN_TS_RE = /<\/?[a-z][a-z0-9]*\s[^>]*>|<\/[a-z][a-z0-9]*\s*>/;

// Markdown leaks that break tsc (TS1443/TS1160): a ``` fence line or a
// batched-response `---` separator inside what should be a pure source file
// means the LLM's markdown answer was written into the file.
export const MARKDOWN_FENCE_RE = /^\s*```/m;
export const BATCH_SEPARATOR_RE = /^\s*---\s*$/m;

// Prompt scaffolding echoed into a source file. The model sometimes copies the
// platform's own tool-marker convention into generated code (seen in the
// 2026-08-13 chess build: "// REAL FILE CONTENT: Real file content injected by
// the platform...") — those artifacts are never valid code.
export const PROMPT_ARTIFACT_RE = /REAL FILE CONTENT|injected by the platform|generated for the "[^"]+" node|entry point for the node/i;

// Prose lines that break tsc (TS1434/TS1435): markdown bullets, bold runs,
// note/explanation prefixes at line start that are NOT code. Includes the
// trailing-explanation phrasing the model emits after code ("In this
// solution...", "This code defines...", "For a chess game...").
const PROSE_RE = /^\s*(?:\*\*[^*]+\*\*|[-*]\s+[A-Za-z]|Note:|NOTE:|> |Explanation:|Here's|Below is|In this (?:solution|implementation|file|module|example)|This (?:code|file|module|implementation|class|function) (?:defines|implements|handles|provides|is|shows)|For (?:a|an) .* (?:game|app|application)|The .* (?:function|class|module|implementation))/;

/** Strip string literals so JSX-in-ts detection doesn't match strings. */
function stripStringLiterals(code: string): string {
  return code.replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, '');
}

/**
 * Deterministic quality gate. Returns true only for content that is plausibly
 * clean source code (or a clean non-code payload like architecture JSON).
 * Rejects markdown leaks, prose, stubs, prompt artifacts, JSX-in-ts, and
 * anything too short to be a meaningful example.
 */
export function isQualityCode(code: string, language: string): boolean {
  if (code.trim().length < 30) return false;
  if (STUB_PATTERNS.some(re => re.test(code))) return false;
  // Markdown fences / batched `---` separators = answer prose leaked into the
  // file. They break tsc AND mean the snippet isn't clean code — reject.
  if (MARKDOWN_FENCE_RE.test(code)) return false;
  if (BATCH_SEPARATOR_RE.test(code)) return false;
  // Prompt scaffolding echoed into the file is never valid code — reject.
  if (PROMPT_ARTIFACT_RE.test(code)) return false;
  // Plain .ts/.js files must not contain JSX syntax (outside strings)
  if (['typescript', 'javascript'].includes((language || '').toLowerCase())) {
    if (JSX_IN_TS_RE.test(stripStringLiterals(code))) return false;
  }
  // Reject markdown-prose lines that would break tsc
  for (const line of code.split('\n')) {
    const t = line.trim();
    if (PROSE_RE.test(line) && !/[;{}()=<>]/.test(t)) {
      return false;
    }
  }
  return true;
}

/** True when the kill switch (AUTO_LEARN_DISABLED=true|1) is active. */
export function isAutoLearnDisabled(): boolean {
  return process.env.AUTO_LEARN_DISABLED === 'true' || process.env.AUTO_LEARN_DISABLED === '1';
}
