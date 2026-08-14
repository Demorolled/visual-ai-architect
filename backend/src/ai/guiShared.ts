/**
 * Shared GUI helpers — used by BOTH the chat/CLI build path (codePlanner) and
 * the canvas node-based path (fileGenerator). Kept in a neutral module so a
 * layers/ file can import them without triggering route-module side effects
 * (Router()/AITranslator instantiation).
 *
 *   - isGuiRequest:           intent detection from request text + user answers
 *   - ensureGuiEntryFile:     plan-level guarantee of an index.html entry
 *   - GUI_WIDGET_SECTION:     verbatim HTML widget templates for small models
 *   - inlineExternalScriptRefs: self-containment fix (inline <script>/<link>
 *                             refs) so the srcdoc preview never renders white
 *   - stripTypeScript:        .ts→browser-JS conversion for inlined siblings
 */
import ts from 'typescript';

/** A cross-file import contract: which members THIS file imports from WHICH file. */
export interface FileUse {
  /** Relative path of the source file being imported from (matches a planned file path). */
  from: string;
  /** Member names (functions, classes, types, constants) imported from that file. */
  members: string[];
}

export interface PlannedFile {
  path: string;
  summary: string;
  language: string;
  /** Members this file DECLARES (its public API surface): functions, classes, types, constants. */
  exports?: string[];
  /** Cross-file imports: members used from other planned files. */
  uses?: FileUse[];
}

/**
 * Concrete HTML widget templates handed to the writer for GUI entry files.
 * Small models reinvent UI code (and produce invalid elements — e.g. a <div>
 * standing in for <video>) when left on their own. Giving them verbatim,
 * correct snippets raises the floor on every GUI build.
 */
export const GUI_WIDGET_SECTION = `
━━━ HTML WIDGET TEMPLATES (copy these EXACT patterns — do not invent new element types) ━━━

LAYOUT:
  <div class="row" style="display:flex;gap:10px;align-items:center"> ...children... </div>
  <div class="col" style="display:flex;flex-direction:column;gap:10px"> ...children... </div>
  <div class="grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px"> ...cards... </div>
  Main shell: <div class="app" style="max-width:960px;margin:0 auto;padding:24px"> ... </div>

BUTTON:
  <button id="playBtn" class="btn" onclick="play()">▶ Play</button>
  <button id="saveBtn" class="btn btn-primary" onclick="save()">💾 Save</button>
  <button id="delBtn" class="btn btn-danger" onclick="remove()">✕ Delete</button>
  Disabled state: <button disabled>...</button>

INPUT / FORM:
  <label for="titleInput">Title</label>
  <input id="titleInput" type="text" placeholder="Enter title" value="">
  <input id="qtyInput" type="number" min="0" step="1" value="1">
  <input id="searchInput" type="search" placeholder="Search…" oninput="onSearch(this.value)">
  <select id="formatSelect" onchange="onFormat(this.value)">
    <option value="mp4">MP4</option>
    <option value="avi">AVI</option>
    <option value="mkv">MKV</option>
  </select>

CARD:
  <div class="card" style="background:#15152a;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px">
    <h3 style="margin:0 0 8px">Card title</h3>
    <p style="margin:0 0 12px">Card description text.</p>
    <button class="btn" onclick="openItem(id)">Open</button>
  </div>

MEDIA — ALWAYS use native elements, NEVER a <div> or placeholder:
  <video id="videoDisplay" controls width="100%" src="video.mp4"></video>
  <audio id="audioPlayer" controls src="song.mp3"></audio>
  JS: const video = document.getElementById('videoDisplay'); video.play(); video.pause();

LIST / NAV:
  <ul style="list-style:none;padding:0;display:flex;gap:12px">
    <li><a href="#" onclick="event.preventDefault();go('home')">Home</a></li>
  </ul>

STATUS / TOAST:
  <div id="statusMsg" role="status" style="padding:8px 12px;border-radius:8px;margin-top:10px"></div>
  JS: document.getElementById('statusMsg').textContent = 'Done';`;

/**
 * The 6 generated-app failure classes (TODO 3.1 / tests/reports/test-report.md:
 * 72.6% pass — every app lost accessibility points, 5 lost state on refresh,
 * chess-engine left its move-history panel empty, geometry-dash produced NaN
 * playerSize, and 8/20 weren't responsive on mobile). Injected verbatim next to
 * GUI_WIDGET_SECTION in EVERY GUI write prompt (one-shot, per-file, chunked,
 * and fileGenerator) so small models avoid the exact defects the eval harness
 * counts against the app.
 */
export const APP_QUALITY_RULES = `
━━━ APP QUALITY RULES (the 6 measured failure classes — follow ALL) ━━━

1. ACCESSIBILITY (ARIA + labels): every form control gets a <label for> (or aria-label when a visual label is impossible); add aria-labels/roles to icon-only buttons and custom widgets; use a proper heading hierarchy (h1→h2→h3, never skip to h3).
2. KEYBOARD & FOCUS SUPPORT: every button/input/link is reachable with Tab, has a visible :focus style, and responds to Enter/Space; add keydown handlers for game controls (arrow keys) — never mouse-only.
3. STATE PERSISTENCE (no loss on refresh): apps that hold meaningful state (games, editors, trackers, dashboards) MUST save it to localStorage on every change and restore it on load — a page that forgets its data on refresh is a failure.
4. LIVE PANELS MUST POPULATE: any history/log/result/score/move-list panel must visibly fill with real entries when the user acts — never leave a declared panel permanently empty.
5. NUMERIC ROBUSTNESS (no NaN): initialize every numeric (sizes, scores, positions, timers) with a real number or fallback (Number(x) || 0); never let division/parsing produce NaN — a NaN dimension breaks layout and collisions.
6. MOBILE RESPONSIVE: include <meta name="viewport" content="width=device-width, initial-scale=1">; use fluid layouts (flex/grid, %, clamp()) so the core UI works at 360px wide with no horizontal scroll.`;

/** True when the request or answers signal a graphical/web/GUI app. */
export function isGuiRequest(request: string, answers?: Record<string, string>): boolean {
  const haystack = `${request || ''} ${answers ? Object.values(answers).filter(Boolean).join(' ') : ''}`.toLowerCase();
  // Bare "interface" would match "Command line interface" / "CLI interface" —
  // those are CLI signals, not GUI. Only specific GUI-bearing phrases count.
  if (/(cli|command\s*line|terminal|console|headless)/i.test(haystack)) {
    // Explicit graphical/web signal still wins over a CLI mention.
    if (!/(gui|graphical|web\s*app|webapp|website|dashboard|frontend|visual)/i.test(haystack)) return false;
  }
  return /(gui|graphical|web\s*app|webapp|website|dashboard|graphical\s*interface|web\s*interface|frontend|visual\s*app|with\s+a\s+ui|\bgames?\b|\bcheckers\b|\bchess\b|\bboard\s*game\b|tic[- ]tac[- ]toe|\bsudoku\b|\bpuzzles?\b)/i.test(haystack);
}

/**
 * If the build wants a GUI but the plan has no HTML entry, append a
 * self-contained index.html. Idempotent — never duplicates an existing HTML file.
 */
export function ensureGuiEntryFile(files: PlannedFile[], request: string, answers?: Record<string, string>): PlannedFile[] {
  if (!isGuiRequest(request, answers)) return files;
  if (files.some(f => /\.html?$/i.test(f.path))) return files;
  return [
    ...files,
    {
      path: 'index.html',
      summary: 'Single self-contained GUI page (HTML + CSS + JS inline, no build step) that renders the complete app interface and wires it to the logic. This is what makes the app viewable in the browser preview — build the full UI here. STRICT RULES: (1) do NOT reference external files — no <script src="...">, no <link href="...">, no CSS or JS files; the preview iframe cannot load external files, so inline ALL CSS in a <style> tag and ALL JavaScript in a <script> tag directly in this file; (2) plain browser JavaScript only — no React, no TypeScript, no imports, no JSX, no build step; (3) include working inline code that actually renders the interface so the page is never blank.',
      language: 'html',
      exports: [],
      uses: [],
    },
  ];
}


/**
 * Deterministic self-containment guarantee for generated HTML entries.
 * The preview iframe renders via srcdoc with no filesystem, so external
 * <script src="..."> / <link href="..."> refs silently fail and render a
 * BLANK WHITE page. Small models frequently emit external refs despite the
 * "inline everything" instruction. This replaces such references with inline
 * <script>/<style> blocks pulled from the sibling generated files, so the GUI
 * entry always works in the preview regardless of what the model wrote.
 */
export function inlineExternalScriptRefs(files: Array<{ path: string; content: string }>): void {
  // Build a lookup from (path | basename) → content for the sibling files.
  // NOTE: on basename collisions (two siblings with the same name in different
  // dirs) the last one wins — acceptable for generated apps, which are flat.
  const byKey = new Map<string, string>();
  const byTs = new Map<string, string>(); // .ts/.tsx sources that need JS-stripping
  for (const f of files) {
    if (/\.([jt]sx?|css)$/i.test(f.path)) {
      byKey.set(f.path, f.content);
      byKey.set(f.path.split('/').pop() || '', f.content);
      if (/\.tsx?$/i.test(f.path)) {
        byTs.set(f.path, f.content);
        byTs.set(f.path.split('/').pop() || '', f.content);
      }
    }
  }

  const lookup = (ref: string): { content: string; isTs: boolean } | undefined => {
    const key = ref.replace(/^\/|^~\/|\.\//g, '').split(/[?#]/)[0];
    const base = key.split('/').pop() || '';
    const direct = byKey.get(key) ?? byKey.get(base);
    if (direct === undefined) return undefined;
    return { content: direct, isTs: byTs.has(key) || byTs.has(base) };
  };

  const inlineScript = (src: string): string | null => {
    const hit = lookup(src);
    if (!hit) return null;
    const body = hit.isTs ? stripTypeScript(hit.content) : hit.content;
    return `<script>\n${body}\n</script>`;
  };

  for (const htmlFile of files) {
    if (!/\.html?$/i.test(htmlFile.path)) continue;
    let html = htmlFile.content;

    // Inline <script src="..."> — both self-closing and paired forms.
    html = html.replace(/<script[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (_m, src: string) => inlineScript(src) ?? _m);
    html = html.replace(/<script[^>]*\bsrc=["']([^"']+)["'][^>]*\/>/gi, (_m, src: string) => inlineScript(src) ?? _m);
    // Inline <link rel="stylesheet" href="..."> — order-independent (rel before or after href).
    html = html.replace(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']stylesheet["'][^>]*\/?>/gi, (_m, href: string) => {
      const hit = lookup(href);
      if (!hit) return _m;
      return `<style>\n${hit.content}\n</style>`;
    });
    html = html.replace(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*\/?>/gi, (_m, href: string) => {
      const hit = lookup(href);
      if (!hit) return _m;
      return `<style>\n${hit.content}\n</style>`;
    });

    htmlFile.content = html;
  }
}

/**
 * Convert generated TypeScript to browser-ready JavaScript using the real
 * TypeScript compiler (transpileModule). The preview iframe has no TS
 * compiler, so raw interfaces, type annotations and module syntax would
 * throw a syntax error and still render a blank page. After transpiling we
 * strip the CommonJS scaffolding ("use strict"/exports.*) that the compiler
 * emits, because this code runs inside a browser <script> tag where `exports`
 * does not exist. Falls back to the raw content only if transpilation fails.
 */
export function stripTypeScript(code: string): string {
  try {
    const result = ts.transpileModule(code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2017,
        module: ts.ModuleKind.None,
        jsx: ts.JsxEmit.React,
        removeComments: false,
      },
    });
    let out = result.outputText || '';
    // Deterministically remove CJS scaffolding emitted by transpileModule.
    out = out.replace(/^\s*"use strict";\s*$/gm, '');
    out = out.replace(/^\s*Object\.defineProperty\(exports, "__esModule", \{ value: true \}\);\s*$/gm, '');
    out = out.replace(/^\s*exports\.[\w$]+\s*=\s*void 0;\s*$/gm, '');
    out = out.replace(/^\s*exports\.[\w$]+\s*=\s*[\w$]+;\s*$/gm, '');
    // Empty output (pure type/interface file) is fine — never fall back to raw TS.
    return out.trim();
  } catch {
    // Never break the write path — and never re-inject raw TS (that would
    // reintroduce the exact SyntaxError this stripper exists to kill). An
    // empty result just renders an empty script, which is safe.
    return '';
  }
}

/**
 * Variant of stripTypeScript for the canvas preview IIFE path. The canvas
 * preview wraps each file as `(function(exports) { <code> })(namespace)` so it
 * can call exported entry points (ns.init(...)). transpileModule with
 * module: None still emits the `exports.x = x;` assignments that populate the
 * namespace, and elides `import` statements entirely — critically it does NOT
 * emit `require()` calls (module: CommonJS would, and `require` doesn't exist
 * in the browser iframe). Only the "use strict" + __esModule scaffolding is
 * removed. Browser-safe JS output.
 */
export function stripTypeScriptKeepExports(code: string): string {
  try {
    const result = ts.transpileModule(code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2017,
        module: ts.ModuleKind.None,
        jsx: ts.JsxEmit.React,
        removeComments: false,
      },
    });
    let out = result.outputText || '';
    out = out.replace(/^\s*"use strict";\s*$/gm, '');
    out = out.replace(/^\s*Object\.defineProperty\(exports, "__esModule", \{ value: true \}\);\s*$/gm, '');
    return out.trim();
  } catch {
    // Never re-inject raw TS on failure — an empty script is safe and keeps
    // the preview free of the SyntaxError this stripper exists to kill.
    return '';
  }
}
