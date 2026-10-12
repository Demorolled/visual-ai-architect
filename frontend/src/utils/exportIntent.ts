/**
 * exportIntent.ts — detect when a chat message is asking VACA to write the app
 * OUT to a real folder on disk, e.g.
 *
 *   "take the design on the canvas, compile it to work on Ubuntu and export it
 *    out to desktop separate folder, named tic tac toe"
 *
 * Why this exists: that request used to fall through to the chat model, which
 * answered with the canned "I've opened a GUI preview of how it will look —
 * click ⚡ Build This Now" line and never built or exported anything. The
 * frontend now drives the whole build → export → open-folder flow itself, and
 * this module is the pure, unit-tested core that decides when to do so.
 *
 * This is deliberately conservative: an app BUILD request that merely mentions
 * the word "export" ("build me a CSV export tool") must NEVER be hijacked into
 * an export of the canvas.
 */

export interface ExportIntent {
  /** Name for the exported app/folder — "named tic tac toe" → "tic tac toe". */
  folderName: string | null;
  /** Explicit destination path found in the text (~/Desktop/x, /home/x, C:\x). */
  outputDir: string | null;
  /** Target OS named in the request (Ubuntu → 'linux'), or null. */
  os: string | null;
  /** The user named the desktop as the destination. */
  toDesktop: boolean;
}

/** A literal filesystem path the user typed. */
const PATH_RE = /(?:~\/[\w./-]+|\/home\/[\w./-]+|\/Users\/[\w./-]+|[A-Za-z]:\\[\w.\\-]+)/;

/** Destination nouns that mean "a real place on disk". */
const DEST_WORD_RE = /\b(?:desktop|folder|directory|dir|disk|filesystem|file\s+system|\/home\b)\b/i;

/** A verb that moves something toward a destination. */
const MOVE_TO_DEST_RE =
  /\b(?:save|write|put|drop|place|output|dump|copy|move|install|ship|export|compil\w*)\b[^.!?\n]{0,50}?\b(?:to|into|in|onto|on)\b[^.!?\n]{0,50}?\b(?:desktop|folder|directory|dir|disk|filesystem|file\s+system|\/home)\b/i;

/** The request refers to something that already exists (the canvas/app/design). */
const REFERENCES_EXISTING_RE =
  /\b(?:it|them|the\s+(?:design|app|project|build|canvas|code|game|prototype|thing)|this|that)\b/i;

/** "named X" / "called X" / "titled X" — the app/folder name. */
const NAME_RE = /\b(?:named?|called|titled)\s+["'“]?([^"'”\n]{1,40}?)["'”]?(?:\s*(?:$|[,.;!?]))/i;

/** Questions ABOUT exporting are not commands to export. */
const QUESTION_RE = /^(?:how|what|where|why|who|which)\b|\bhow\s+(?:do|can|would|should)\s+(?:i|you|we)\b/i;

function detectOs(lower: string): string | null {
  if (/\bubuntu\b|\bdebian\b|\bfedora\b|\blinux\b|\bmint\b|\barch\b/i.test(lower)) return 'linux';
  if (/\bwindows\b|\bwin(?:dows)?\s*1[01]\b|\bmicrosoft\b/i.test(lower)) return 'windows';
  if (/\bmac\s*os\b|\bmacos\b|\bmacintosh\b|\bapple\b/i.test(lower)) return 'mac';
  return null;
}

/**
 * Detect an export request. Returns null when the message is not one — the
 * caller then leaves the message to the normal build/chat paths.
 */
export function detectExportIntent(text: string): ExportIntent | null {
  const raw = (text || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  // "how do I export my app?" — a question, not an instruction.
  if (QUESTION_RE.test(lower)) return null;

  const path = raw.match(PATH_RE);
  const explicitExport = /\bexport(?:s|ed|ing)?\b/i.test(lower);
  const compileVerb = /\bcompil(?:e|es|ed|ing)\b/i.test(lower);
  const destWord = DEST_WORD_RE.test(lower);
  const moveToDest = MOVE_TO_DEST_RE.test(lower);
  const referencesExisting = REFERENCES_EXISTING_RE.test(lower);

  const wantsExport =
    !!path ||
    moveToDest ||
    ((explicitExport || compileVerb) && (destWord || referencesExisting));

  if (!wantsExport) return null;

  const nameMatch = raw.match(NAME_RE);
  const folderName = nameMatch ? nameMatch[1].trim().replace(/[.,;!?]+$/, '').trim() || null : null;

  const toDesktop = /\bdesktop\b/i.test(lower);

  return {
    folderName,
    outputDir: path ? path[0] : null,
    os: detectOs(lower),
    toDesktop,
  };
}

/**
 * Resolve the destination directory to hand the scaffolder, or undefined to
 * let the backend pick its default exports/ folder.
 *
 * Only a desktop request is turned into a path (the scaffolder expands a
 * leading ~/ via os.homedir()); anything vaguer is left to the default so we
 * never guess a location the user didn't name.
 *
 * Returns the PARENT directory, not the app folder: PerFileScaffolder always
 * appends the sanitized project name itself (`path.resolve(customDir,
 * sanitized)`), so returning `~/Desktop/<name>` here would nest the app twice
 * (`~/Desktop/<name>/<name>`). The app folder name travels separately as the
 * export's `projectName`.
 */
export function suggestOutputDir(intent: ExportIntent): string | undefined {
  if (intent.outputDir) return intent.outputDir;
  if (!intent.toDesktop) return undefined;
  return '~/Desktop';
}
