/**
 * nonTsRepair — the shared non-TS build gate + repair machinery used by BOTH
 * generation pipelines (the chat/planner path in `routes/codePlanner.ts` and the
 * canvas path in `layers/fileGenerator.ts`).
 *
 * Previously this lived only in `routes/codePlanner.ts`, so the canvas path ran
 * the non-TS compile gate + stub gate but could never REPAIR a failure (and had
 * no deterministic sanitizer or contract-aware stub gate). The gates and the
 * repair loop are pure (fs + spawned toolchains + an INJECTED LLM callback), so
 * they belong in `sandbox/` — importing them from a routes module into a layer
 * would be a cycle.
 *
 * Everything LLM-shaped is injected (`repairCall`), never imported: the sandbox
 * layer must stay unit-testable without a model server.
 */

import * as fs from 'fs';
import * as path from 'path';
import { resolveGateLanguage, resolveGoModuleName, runNonTsProjectGates, fileDeclaresEntryPoint, foldGoPackagePerDirectory, type LanguageGate } from './nonTsCompileGate.js';
import { runStubGate } from './buildVerification.js';
import { memberImplementationState } from '../knowledge/qualityGate.js';
import { resolveCrossFileDuplicates } from './duplicateDeclarations.js';
import { findHardcodedSecrets, formatSecretGateErrors } from './secretGate.js';
import type { PlannedFile } from '../ai/guiShared.js';
import { languageGuidanceBlock } from '../ai/languageGuidance.js';

const MAX_NONTS_REPAIR_ROUNDS = 2;

/** Normalize a file path for contract matching (strip ./, trailing /, ext). */
function normalizeContractPath(p: string): string {
  return (p || '')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '')
    .replace(/\.(ts|tsx|js|jsx|go|rs|py|java|rb|php|c|cpp|cs)$/i, '');
}

/**
 * A header (declaration-only) file: its planned exports are satisfied by the
 * definition in a sibling implementation file, not only by its own text.
 */
const HEADER_FILE_RE = /\.(?:h|hh|hpp|hxx|inl|ipp)$/i;
export function isHeaderPath(p: string): boolean {
  return HEADER_FILE_RE.test((p || '').trim());
}

/** Resolve a relative path safely INSIDE the export dir. */
function safeJoin(exportDir: string, relPath: string): string {
  const rel = path.normalize(relPath || 'file.txt').replace(/^(\.\.(\/|\\|$))+/, '');
  const full = path.resolve(exportDir, rel);
  return full.startsWith(exportDir + path.sep) ? full : path.join(exportDir, 'file.txt');
}

// ─── Language classification ─────────────────────────────────────────────

/**
 * True when a file is a NON-TS gateable code language (Java, Go, Python, Rust,
 * C/C++, C#, Swift, Kotlin, PHP, Ruby). Their compiles are judged by the
 * whole-project non-TS gate, never by the JS/TS import heuristics.
 */
export function isNonTsGateFile(language: string | undefined, relPath: string): boolean {
  return resolveGateLanguage(language, relPath) !== null;
}

// ─── Deterministic source fixups ─────────────────────────────────────────

/** Languages whose blocks are delimited by braces (truncation ⇒ unbalanced). */
const BRACE_LANGS = new Set(['java', 'go', 'c', 'cpp', 'csharp', 'rust', 'swift', 'kotlin', 'php', 'javascript', 'typescript']);

/**
 * Count `{` minus `}` for a C-family source, IGNORING braces inside string/char
 * literals and line/block comments. A positive result means the file ended
 * before its blocks closed (truncation). Pure + best-effort.
 */
export function braceBalance(content: string): number {
  let depth = 0;
  let i = 0;
  const n = content.length;
  while (i < n) {
    const c = content[i];
    const two = content.slice(i, i + 2);
    if (two === '//') { const nl = content.indexOf('\n', i); i = nl === -1 ? n : nl; continue; }
    if (two === '/*') { const end = content.indexOf('*/', i + 2); i = end === -1 ? n : end + 2; continue; }
    if (c === '"' || c === '\'' || c === '`') {
      const quote = c;
      i += 1;
      while (i < n) {
        if (content[i] === '\\') { i += 2; continue; }
        if (content[i] === quote) { i += 1; break; }
        i += 1;
      }
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    i += 1;
  }
  return depth;
}

/**
 * Deterministic source fixups for a NON-TS file, zero LLM calls:
 *   - Java: remove bare `import Foo;` lines (a single-identifier import is
 *     ALWAYS a compile error; a same-package class needs no import).
 *   - Brace languages: append missing closing braces when truncated (guarded).
 * Returns the fixed content, or null when nothing needed changing.
 */
/**
 * A Go package name for the directory a node file is staged in. Go requires
 * every file of one directory to share a package, and the default package name
 * is the directory's base name sanitized to a legal identifier.
 */
export function goPackageNameFromPath(relPath: string): string {
  const dir = (relPath || '').replace(/\\/g, '/').split('/').slice(0, -1).pop() || 'app';
  const name = dir.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!name || /^[0-9]/.test(name) || GO_KEYWORDS.has(name)) return 'app';
  return name;
}

/**
 * Strip a stray leading `.` from any line of Go source.
 *
 * `go build` rejects a statement that starts with a dot (`expected operand,
 * found '.'`), and the model produces them when it drops a receiver or
 * qualifier: the generated file-size CLI shipped `.GetFilesAndSizes(dir)` as a
 * statement inside `main()`, which failed the whole build. No legal Go
 * statement begins with a dot, so the run of dots can be removed.
 *
 * Lines inside a raw string (between backticks) or a block comment, and `//`
 * comment lines, are left untouched — printed text and prose must survive
 * verbatim. A dot followed by a non-identifier (`.5`, `...`) is never touched.
 */
function stripGoLineDots(code: string): string {
  if (!/^[ \t]*\.+[A-Za-z_]/m.test(code)) return code;
  const out: string[] = [];
  let inRaw = false;
  let inBlock = false;
  for (const line of code.split('\n')) {
    const wasRaw = inRaw;
    const wasBlock = inBlock;
    if (((line.match(/`/g) || []).length % 2) === 1) inRaw = !inRaw;
    if (!wasRaw) {
      if (!inBlock && line.includes('/*')) inBlock = true;
      else if (inBlock && line.includes('*/')) inBlock = false;
    }
    const trimmed = line.trimStart();
    if (wasRaw || wasBlock || trimmed.startsWith('//')) { out.push(line); continue; }
    out.push(line.replace(/^([ \t]*)\.+(?=[A-Za-z_])/, '$1'));
  }
  return out.join('\n');
}

const GO_KEYWORDS = new Set([
  'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else',
  'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import', 'interface',
  'map', 'package', 'range', 'return', 'select', 'struct', 'switch', 'type', 'var',
]);

/**
 * Rewrite Go import specs that can never resolve.
 *
 * A spec whose TAIL names a package directory that EXISTS in the project, but
 * whose path does not start with the module name the staged `go.mod` declares,
 * is always the model inventing one. Measured live: the generated Go CSW-JSON
 * CLI imported `github.com/user/csv-json-converter/pkg/csv` while the gate's
 * `go.mod` declared `module a-multi-file-go-cli-that-converts-a-csv-file-to-json`
 * -> `go build` failed with `no required module provides package ...` and
 * neither LLM repair round ever touched the import.
 *
 * Deliberately narrow, so a correct import is never rewritten:
 *   · only inside an `import` block — a spec-shaped STRING literal elsewhere
 *     (a filename, an error message) is left alone;
 *   · only multi-segment specs — one segment (`fmt`, `os`) is a stdlib path;
 *   · only when the tail matches an existing project directory, LONGEST match
 *     wins, so `.../pkg/csv` can never collapse to `<mod>/csv`;
 *   · never when the spec already starts with the module name.
 */
function rewriteGoModuleImports(code: string, mod: string, dirs?: Iterable<string>): string {
  const list = dirs ? [...dirs].filter(Boolean).sort((a, b) => b.length - a.length) : [];
  if (!list.length) return code;
  const fixSpec = (spec: string): string => {
    if (!spec || spec === mod || spec.startsWith(`${mod}/`)) return spec;
    if (spec.startsWith('./') || spec.startsWith('../')) return spec;
    if (!spec.includes('/')) return spec;
    for (const d of list) {
      if (spec === d || spec.endsWith(`/${d}`)) return `${mod}/${d}`;
    }
    return spec;
  };
  const fixBlock = (body: string) =>
    body.replace(/(["`])([^"`\s]+)\1/g, (_m, quote: string, spec: string) => `${quote}${fixSpec(spec)}${quote}`);
  return code
    .replace(/(\bimport\s*\()([\s\S]*?)(\))/g, (_m, open: string, body: string, close: string) => open + fixBlock(body) + close)
    .replace(/(\bimport\s+)(["`])([^"`\s]+)\2/g, (_m, pre: string, quote: string, spec: string) => `${pre}${quote}${fixSpec(spec)}${quote}`);
}

export function sanitizeNonTsSource(
  content: string,
  language: string,
  relPath?: string,
  opts?: {
    goModuleName?: string;
    /** Package directories present in the project (posix-relative). Used to
     *  recognise an import path the model invented for a package it DID write
     *  — see rewriteGoModuleImports. */
    goPackageDirs?: Iterable<string>;
  },
): string | null {
  let out = content;
  if (language === 'java') {
    out = out.split('\n').filter((l) => !/^\s*import\s+[A-Za-z_$][\w$]*\s*;\s*$/.test(l)).join('\n');
  }
  // Go: a node file staged in its OWN directory must not claim `package main`
  // unless it really is the program (declares `func main()`). The generator's
  // prompt forbids it, but a model that ignores the rule leaves a main package
  // with no main function — `go build ./...` fails with "function main is
  // undeclared in the main package", and the file is unimportable, so its code
  // silently never reaches the binary (measured on the generated Go
  // string-tools app: its CLI node was dead code the whole way through).
  if (language === 'go' && relPath && !/\bfunc\s+main\s*\(/.test(out) && /^\s*package\s+main\b/m.test(out)) {
    out = out.replace(/^(\s*)package\s+main\b/m, `$1package ${goPackageNameFromPath(relPath)}`);
  }
  // Go: a stray artifact BEFORE the package clause (`\.package main`) is always
  // a syntax error — `go build` reports `expected 'package', found '.'` and that
  // FIRST error masks every other one in the file. The clause is mandatory and
  // must come first (comments and blank lines aside), so a dot preceding it can
  // never be correct. Measured live: a generated Go json→yaml tool shipped
  // `\.package main` and stayed red for two repair rounds.
  if (language === 'go' && /^\s*\.+\s*package\b/.test(out)) {
    out = out.replace(/^\s*\.+\s*(?=package\b)/, '');
  }
  // Go: the mirror of the rule above — a file that DECLARES the entry point
  // (`func main()`) but claims some other package. Go builds it as a library:
  // no binary is produced, so the CLI can never run — yet the compile gate
  // reports the file CLEAN, and the defect only surfaces later as a CLI-smoke or
  // stub failure (measured live on the generated SHA-256 CLI, `package app` +
  // `func main()`). A top-level `func main` is legal ONLY in `package main`, so
  // rewriting the clause is the one reading of the model's intent that runs.
  if (language === 'go' && /^func\s+main\s*\(/m.test(out) && !/^\s*package\s+main\b/m.test(out)) {
    out = out.replace(/^([ \t]*)package[ \t]+\w+/m, '$1package main');
  }
  // Go: stuck on a line of their own, elsewhere in the file (see the helper).
  if (language === 'go') {
    out = stripGoLineDots(out);
  }
  // Go: a RELATIVE import path is always fatal in module mode —
  // `go build` rejects `import "./src/hashutil"` with "relative import paths are
  // not supported in module mode", and `import "./parser"` the same way. The
  // model reaches for the relative form precisely because it cannot know the
  // module path, and heuristic "use the module path" prompt guidance does not
  // stop it (measured live on 2 consecutive Go builds that both failed this
  // way). Rewriting is safe and deterministic: a path starting with `./` or
  // `../` can NEVER compile, so there is nothing correct to destroy. Rewrite it
  // to `<go.mod module>/<dir>` so the sibling package actually resolves.
  if (language === 'go' && opts?.goModuleName) {
    const mod = opts.goModuleName;
    out = out.replace(/(["`])(\.\.?\/[^"`]*)\1/g, (_m, quote: string, rel: string) => {
      const cleaned = rel.replace(/^(\.\.?\/)+/, '').replace(/\/+$/, '').replace(/\/+/g, '/');
      return cleaned ? `${quote}${mod}/${cleaned}${quote}` : `${quote}${mod}${quote}`;
    });
    // The same defect in its non-relative form: the model names a real project
    // package but prefixes it with a module path that does not exist.
    out = rewriteGoModuleImports(out, mod, opts.goPackageDirs);
  }
  if (BRACE_LANGS.has(language)) {
    const bal = braceBalance(out);
    if (bal > 0 && bal <= 12) {
      out = out.replace(/\s*$/, '') + '\n' + Array(bal).fill('}').join('\n') + '\n';
    }
  }
  return out === content ? null : out;
}

/**
 * Go build failure: `<file>:<line>:<col>: declared and not used: <name>`.
 *
 * Go refuses an unused LOCAL — it is a hard build error, and the model produces
 * it constantly: the generated file-size CLI captured `err` from
 * `filepath.Walk` and never looked at it, so the whole project failed to build
 * (measured live — this was the FIRST real error the gate reached once the
 * staging artifacts were fixed, and the LLM repair rounds never cleared it).
 * `_ = name` is exactly the value the program already discards, so inserting it
 * makes the file compile with no behaviour change and costs no repair round.
 *
 * Deliberately conservative: the fix is applied only when the compiler's own
 * line both DECLARES the name and ends its statement there. A declaration that
 * continues onto later lines (a call whose arguments span lines, an unbalanced
 * bracket, a `for ... {`) is left to the model — inserting a statement inside it
 * would be a syntax error worse than the one being fixed.
 */
/**
 * Blank out an unused variable in a `range` header.
 *
 * The compiler's `declared and not used` fix is normally an inserted `_ = name`,
 * but inside a `for ... range` header no statement can be inserted — the header
 * must be edited instead. Blanking the name is exactly behaviour-preserving
 * (`for _, record := range rows` does everything `for i, record := range rows`
 * did, minus the counter), and it is the ONLY deterministic cure for a `range`
 * INDEX the body never reads.
 *
 * Measured live: `output_formatter.go:18:7: declared and not used: i` for
 * `for i, record := range records[1:]` — a hard error that survived the whole
 * repair loop and made the delivered Go CLI unbuildable.
 *
 * Returns the rewritten line, or null when the line is not a range header
 * declaring that name.
 */
function blankRangeHeaderName(line: string, name: string): string | null {
  const m = /^([ \t]*)for[ \t]+([A-Za-z_]\w*(?:[ \t]*,[ \t]*[A-Za-z_]\w*)?)[ \t]*:?=[ \t]*range\b/.exec(line);
  if (!m) return null;
  const names = m[2].split(',').map((s) => s.trim());
  if (!names.includes(name)) return null;
  const replaced = names.map((n) => (n === name ? '_' : n));
  // `for _, _ := range` is legal but pointless — drop the clause entirely.
  if (replaced.every((n) => n === '_')) {
    return line.replace(/^([ \t]*)for[ \t]+[A-Za-z_]\w*(?:[ \t]*,[ \t]*[A-Za-z_]\w*)?[ \t]*:?=[ \t]*range/, '$1for range');
  }
  return line.replace(m[2], replaced.join(', '));
}

export function fixUnusedGoVariables(content: string, errors: string[]): string | null {
  const lines = content.split('\n');
  const hits: Array<{ line: number; name: string }> = [];
  for (const e of errors || []) {
    const m = /:(\d+):\d+:\s*declared and not used:\s*([A-Za-z_]\w*)/.exec(e || '');
    if (m) hits.push({ line: Number(m[1]), name: m[2] });
  }
  const balanced = (s: string): boolean => {
    let n = 0;
    for (const ch of s) {
      if (ch === '(' || ch === '[' || ch === '{') n += 1;
      else if (ch === ')' || ch === ']' || ch === '}') n -= 1;
    }
    return n === 0;
  };
  let changed = false;
  // Bottom-up, so inserting a line cannot invalidate a hit above it.
  for (const h of hits.sort((a, b) => b.line - a.line)) {
    const line = lines[h.line - 1];
    if (line === undefined) continue;
    const trimmed = line.trim();
    if (!trimmed.includes(h.name)) continue;
    // A `range` header is the one place the cure is not an inserted statement.
    // Only touched when the name occurs NOWHERE ELSE in the file: the compiler
    // would not call a used variable unused, and blanking one would silently
    // drop real work (that guard also keeps this off a variable the body reads).
    const occurrences = (content.match(new RegExp(`\\b${h.name}\\b`, 'g')) || []).length;
    if (occurrences <= 1) {
      const blanked = blankRangeHeaderName(line, h.name);
      if (blanked !== null && blanked !== line) {
        lines[h.line - 1] = blanked;
        changed = true;
        continue;
      }
    }
    if (!/:=|\bvar\b/.test(trimmed)) continue;
    if ('([{,+-*/=&|.'.includes(trimmed.slice(-1))) continue;
    if (!balanced(trimmed)) continue;
    const indent = /^[ \t]*/.exec(line)?.[0] ?? '';
    lines.splice(h.line, 0, `${indent}_ = ${h.name}`);
    changed = true;
  }
  return changed ? lines.join('\n') : null;
}

/**
 * Go stdlib packages whose PACKAGE NAME is not their final import-path
 * segment. `csv.NewReader` needs `"encoding/csv"`; nothing in the file names
 * that path, so the model must know the mapping — and it does not.
 *
 * Only names with ONE sensible home are listed. A name that could resolve to
 * two stdlib packages (`rand` → math/rand or crypto/rand, `template` →
 * text/template or html/template) is deliberately ABSENT: guessing would swap
 * one compile error for another, and the explicit repair round handles it.
 */
const GO_STDLIB_BY_NAME: Record<string, string> = {
  ascii85: 'encoding/ascii85', base32: 'encoding/base32', base64: 'encoding/base64',
  binary: 'encoding/binary', csv: 'encoding/csv', gob: 'encoding/gob',
  hex: 'encoding/hex', json: 'encoding/json', pem: 'encoding/pem', xml: 'encoding/xml',
  fs: 'io/fs', ioutil: 'io/ioutil',
  http: 'net/http', httptest: 'net/http/httptest', mail: 'net/mail', smtp: 'net/smtp',
  url: 'net/url',
  driver: 'database/sql/driver', sql: 'database/sql',
  big: 'math/big', cmplx: 'math/cmplx',
  scanner: 'text/scanner', tabwriter: 'text/tabwriter',
  utf16: 'unicode/utf16', utf8: 'unicode/utf8',
  atomic: 'sync/atomic',
  aes: 'crypto/aes', cipher: 'crypto/cipher', hmac: 'crypto/hmac', md5: 'crypto/md5',
  rsa: 'crypto/rsa', sha1: 'crypto/sha1', sha256: 'crypto/sha256', sha512: 'crypto/sha512',
  tls: 'crypto/tls', x509: 'crypto/x509',
  exec: 'os/exec', signal: 'os/signal', user: 'os/user',
  flate: 'compress/flate', gzip: 'compress/gzip', zlib: 'compress/zlib',
  tar: 'archive/tar', zip: 'archive/zip',
  heap: 'container/heap', list: 'container/list', ring: 'container/ring',
  slog: 'log/slog', template: 'text/template',
};

/** Stdlib packages whose package name IS the final import-path segment. */
const GO_STDLIB_PLAIN = new Set([
  'bufio', 'bytes', 'context', 'embed', 'errors', 'flag', 'fmt', 'io', 'log', 'math',
  'os', 'path', 'filepath', 'reflect', 'regexp', 'runtime', 'sort', 'strconv',
  'strings', 'sync', 'time', 'unicode', 'unsafe',
]);

/** The import path for a bare stdlib package NAME, or null when not knowable. */
function goStdlibPathFor(name: string): string | null {
  return GO_STDLIB_BY_NAME[name] || (GO_STDLIB_PLAIN.has(name) ? name : null);
}

/**
 * Go's missing/unused-import errors, fixed deterministically from the compiler's
 * own output.
 *
 * Both halves of this class are hard build failures the model produces
 * constantly, and neither is inferable from the code by the model's own
 * reasoning at repair time (it already tried):
 *
 *   - `"bufio" imported as csvutil and not used` — the spec must simply go.
 *   - `undefined: csv` where the file calls `csv.NewReader` — the `"encoding/
 *     csv"` import was never written, and the path is not a function of the
 *     name (it is `encoding/csv`, not `csv`).
 *
 * Measured live on one delivered Go CLI (`exports/a-multi-file-go-cli-that-
 * converts-a-csv--…`): `main.go` had `csvutil "bufio"` unused AND `undefined:
 * csv`; `reader_input.go` had `"os" imported and not used` AND `undefined:
 * strings`; `output_formatter.go` had `undefined: strings`. Three files, five
 * errors, one cause: nothing ever repaired a Go import.
 *
 * Deliberately convergent — an add is only made when the name is ACTUALLY used
 * as a qualifier (`name.`) and is not already imported, so the fixer can never
 * add an import the next round would remove as unused (the add/remove cycle
 * that would make two fixers fight each other).
 */
export function fixGoImports(
  content: string,
  errors: string[],
  opts?: {
    goModuleName?: string;
    /** Project package directories (posix-relative) — lets a missing import of
     *  the project's OWN package be resolved to `<module>/<dir>`. */
    goPackageDirs?: Iterable<string>;
  },
): string | null {
  const unused = new Set<string>();
  const undefinedNames = new Set<string>();
  for (const e of errors || []) {
    const line = e || '';
    const u = /:\d+:\d+:\s*"([^"]+)"\s+imported(?:\s+as\s+\w+)?\s+and not used/.exec(line);
    if (u) { unused.add(u[1]); continue; }
    const d = /:\d+:\d+:\s*undefined:\s*([A-Za-z_]\w*)/.exec(line);
    if (d) undefinedNames.add(d[1]);
  }
  if (!unused.size && !undefinedNames.size) return null;

  let out = content;

  // ── 1. Drop every spec the compiler named as unused ──────────────────────
  if (unused.size) {
    // Block form: rewrite the body, and remove the whole declaration when the
    // last spec in it is gone (an empty `import ()` is itself a syntax error).
    out = out.replace(
      /^([ \t]*)import[ \t]*\([ \t]*\r?\n([\s\S]*?)^([ \t]*\))/gm,
      (_m, open: string, body: string, close: string) => {
        const kept = body.split('\n').filter((l) => {
          const spec = /^\s*(?:[A-Za-z_.]\w*\s+|\.\s+|_\s+)?"([^"]+)"/.exec(l);
          return !(spec && unused.has(spec[1]));
        });
        return kept.join('\n').trim().length ? `${open}import (\n${kept.join('\n')}\n${close}` : '';
      },
    );
    // Single-line form: `import "path"` / `import alias "path"`.
    out = out.replace(
      /^[ \t]*import[ \t]+(?:[A-Za-z_.]\w*[ \t]+|\.\s+|_\s+)?"([^"]+)"[ \t]*\r?\n/gm,
      (m: string, p: string) => (unused.has(p) ? '' : m),
    );
  }

  // ── 2. Add the import for every undefined name that IS a package qualifier ─
  const toAdd: string[] = [];
  for (const name of undefinedNames) {
    if (!new RegExp(`\\b${name}\\s*\\.`).test(out)) continue;      // used as `name.X`
    if (new RegExp(`"(?:[^"]*/)?${name}"`).test(out)) continue;    // already imported
    let importPath = goStdlibPathFor(name);
    if (!importPath && opts?.goPackageDirs && opts.goModuleName) {
      for (const d of opts.goPackageDirs) {
        if (d === name || d.endsWith(`/${name}`)) { importPath = `${opts.goModuleName}/${d}`; break; }
      }
    }
    if (importPath) toAdd.push(importPath);
  }
  if (toAdd.length) {
    const sorted = [...new Set(toAdd)].sort();
    const blockRe = /^([ \t]*)import[ \t]*\([ \t]*\r?\n([\s\S]*?)^([ \t]*\))/m;
    if (blockRe.test(out)) {
      out = out.replace(blockRe, (_m, open: string, body: string, close: string) =>
        `${open}import (\n${body.replace(/\s*$/, '')}\n${sorted.map((p) => `\t"${p}"`).join('\n')}\n${close}`);
    } else if (/^[ \t]*import[ \t]+\S/m.test(out)) {
      const lines = out.split('\n');
      let last = -1;
      for (let i = 0; i < lines.length; i++) if (/^[ \t]*import[ \t]+\S/.test(lines[i])) last = i;
      const indent = last >= 0 ? (/^[ \t]*/.exec(lines[last])?.[0] ?? '') : '';
      for (const p of sorted) lines.splice(++last, 0, `${indent}import "${p}"`);
      out = lines.join('\n');
    } else {
      // No imports at all — a block after the mandatory package clause.
      out = out.replace(
        /^(package[ \t]+\w+[ \t]*\r?\n)/m,
        `$1\nimport (\n${sorted.map((p) => `\t"${p}"`).join('\n')}\n)\n`,
      );
    }
  }

  return out === content ? null : out;
}

// ─── Contract-aware implementation gate ──────────────────────────────────

/**
 * A PLANNED export the generated code never really implements:
 *   - `trivial`: body is EMPTY or a single placeholder `return <literal>;`
 *   - `absent`:   no callable declaration (only flagged for non-TS languages;
 *                 TS/JS use the export-drift check in `verifyGeneratedContracts`)
 * Class/type exports have no callable body and are skipped.
 */
export function findUnimplementedPlannedExports(
  files: Array<{ path: string; content: string }>,
  contractFiles: PlannedFile[],
): string[] {
  const failures: string[] = [];
  for (const cf of contractFiles) {
    const exports = cf.exports || [];
    if (!exports.length) continue;
    const gen = files.find((f) => normalizeContractPath(f.path) === normalizeContractPath(cf.path));
    if (!gen) continue;
    const nonTs = isNonTsGateFile(cf.language, cf.path);
    for (const name of exports) {
      // A header only DECLARES its contract; the definition legitimately lives
      // in the sibling .c/.cpp. Judge a header's exports against the whole
      // build (own file first, so a header that also defines keeps its own
      // verdict) — measured live: a generated C to-hex tool was rejected with
      // "src/convert.h: planned export 'toHexadecimal' is not implemented"
      // while `toHexadecimal` was fully implemented in src/convert.c.
      const sources = isHeaderPath(cf.path) ? [gen, ...files.filter((f) => f !== gen)] : [gen];
      let state: string = 'absent';
      for (const src of sources) {
        const s = memberImplementationState(src.content, name, cf.language);
        if (s === 'ok' || s === 'non-callable') { state = s; break; }
        if (s === 'trivial') state = 'trivial';
      }
      // `main` names the entry-point CONVENTION, not a callable contract — a
      // file that is runnable through its language's idiomatic entry satisfies
      // it without declaring a function called `main`.
      const entrySatisfiesMain = /^(?:main|Main)$/.test(name)
        && sources.some((src) => fileDeclaresEntryPoint(src.content, cf.language, cf.path));
      if (state === 'trivial') {
        failures.push(`${cf.path}: planned export '${name}' has a trivial/unimplemented body (placeholder return or empty)`);
      } else if (state === 'absent' && nonTs && !entrySatisfiesMain) {
        failures.push(`${cf.path}: planned export '${name}' is not implemented in the generated code`);
      }
    }
  }
  return failures;
}

// ─── Failure → file routing ──────────────────────────────────────────────

/**
 * Group whole-project non-TS gate errors by the working file they refer to.
 * A `wholeSetGate` (`javac -d classes <all files>`) returns ONE concatenated
 * string for MANY files, so attribution is PER LINE: a line naming a file
 * becomes the "current" file and its `symbol:` context lines accrue to it.
 * The LONGEST matching path wins so `a.java` cannot steal a `src/a.java` error.
 */
export function groupGateErrorsByFile(
  gates: LanguageGate[],
  files: Array<{ path: string; content: string }>,
): Map<string, string[]> {
  const byFile = new Map<string, string[]>();
  const append = (key: string, line: string) => {
    const list = byFile.get(key) || [];
    list.push(line);
    byFile.set(key, list);
  };
  for (const g of gates) {
    if (g.clean) continue;
    for (const err of g.errors) {
      let current = '';
      for (const line of err.split('\n')) {
        // Two passes: the EXACT path first (unchanged behaviour), then the
        // NORMALIZED one. A planned node path is often written
        // `./converter/converter.go` while the compiler names the file
        // `converter/converter.go`; with only the exact test nothing matched, no
        // file was attributed, `failingPaths` was empty and the repair loop fell
        // out at round 0 with the error never shown to the model (measured live:
        // a Go json→YAML build with the invented import `os/yaml` reported
        // repairRounds: 0 and was never repaired). The normalized pass runs ONLY
        // when the exact pass found nothing, so it cannot make an existing match
        // any looser.
        let best = '';
        let bestLen = 0;
        for (const f of files) {
          if (line.includes(f.path) && f.path.length > bestLen) {
            best = f.path;
            bestLen = f.path.length;
          }
        }
        if (!best) {
          for (const f of files) {
            const norm = normalizeContractPath(f.path);
            if (norm && line.includes(norm) && norm.length > bestLen) {
              best = f.path;
              bestLen = norm.length;
            }
          }
        }
        if (best) current = best;
        if (current) append(current, line);
      }
    }
  }
  return byFile;
}

/**
 * The file path a gate/stub failure message refers to. Stub failures are either
 * a bare path (`src/Game.java`) or `path: detail`. Returns '' when no path.
 */
export function pathFromGateFailure(message: string): string {
  const m = message.match(/^([^\s:]+\.((?:tsx?|jsx?|mjs|cjs|go|py|rs|c|cc|cpp|h|hpp|cs|java|swift|kt|php|rb|html?)))(?::\s|$)/i);
  return m ? m[1] : '';
}

/** Group stub/unimplemented failures by the working file they refer to. */
export function groupStubFailuresByFile(
  stubFailures: string[],
  files: Array<{ path: string; content: string }>,
): Map<string, string[]> {
  const byFile = new Map<string, string[]>();
  for (const s of stubFailures) {
    const p = pathFromGateFailure(s);
    if (!p) continue;
    const match = files.find((f) => normalizeContractPath(f.path) === normalizeContractPath(p));
    if (!match) continue;
    const list = byFile.get(match.path) || [];
    list.push(s);
    byFile.set(match.path, list);
  }
  return byFile;
}

// ─── Gates ───────────────────────────────────────────────────────────────

export interface ProjectGateResult {
  languageGates: LanguageGate[];
  stubFailures: string[];
}

/**
 * Run the whole-project non-TS compile gate plus the file-level stub gate and
 * the contract-aware implementation gate. Shared by both pipelines.
 */
export async function runProjectGates(
  request: string,
  files: Array<{ path: string; content: string }>,
  contractFiles: PlannedFile[],
  /** The caller gates node files only and a scaffolder writes the entry (canvas path). */
  scaffoldSuppliesEntry = false,
  /**
   * The project's ONE Go module name (see resolveGoModuleName). A caller that
   * also writes Go imports must pass the SAME value the writer used, so the
   * gate can never judge a module name the delivered code does not use.
   * Defaults to the historical `sanitizeGoModuleName(request)`.
   */
  goModuleName?: string,
): Promise<ProjectGateResult> {
  const langByPath = new Map<string, string>();
  for (const f of contractFiles) langByPath.set(normalizeContractPath(f.path), (f.language || '').toLowerCase());
  const nonTs = files
    .map((f) => ({ relPath: f.path, code: f.content, language: resolveGateLanguage(langByPath.get(normalizeContractPath(f.path)), f.path) || '' }))
    // Keep bare `.h` headers even though they resolve to no language of their
    // own (`.h` is shared by C and C++, so EXT_TO_LANG has no entry for it).
    // This filter used to DROP them, which made the `.h` routing inside
    // runNonTsProjectGates unreachable from this path: a generated C++ project
    // shipped src/main.cpp + src/string_reverser.cpp + src/string_reverser.h,
    // the header was discarded here, and the gate failed with
    // `src/main.cpp:2:10: fatal error: string_reverser.h: No such file or
    // directory` while the header was sitting in the export the whole time.
    .filter((f) => f.language || /\.h$/i.test(f.relPath));
  const languageGates = nonTs.length
    ? await runNonTsProjectGates(nonTs, goModuleName || resolveGoModuleName(null, request), { scaffoldSuppliesEntry })
    : [];
  const stubFailures = [...new Set([
    ...runStubGate(files),
    ...findUnimplementedPlannedExports(files, contractFiles),
  ])];
  // Hardcoded credentials ride the SAME channel as the duplicate-definitions
  // failures below: a synthetic gate whose error lines each LEAD WITH THE FILE
  // PATH, so the existing grouping + repair loop fix them with no new control
  // flow. Nothing checked this before — a build could ship a real working API
  // key, and every other gate (compile, stub, contract) was satisfied by it.
  const secretFailures = formatSecretGateErrors(findHardcodedSecrets(files));
  return {
    languageGates: secretFailures.length
      ? [...languageGates, { language: 'hardcoded-secret', clean: false, errors: secretFailures }]
      : languageGates,
    stubFailures,
  };
}

// ─── Repair prompt ───────────────────────────────────────────────────────

/** The entry-point shape each language expects, for the repair instruction. */
const ENTRY_HINT_FOR_PROMPT: Record<string, string> = {
  python: '`if __name__ == "__main__":` plus a call to the main routine',
  php: 'executable top-level statements',
  ruby: 'executable top-level statements',
  go: '`func main()`',
  rust: '`fn main()`',
  c: '`int main(int argc, char **argv)`',
  cpp: '`int main(int argc, char **argv)`',
  java: '`public static void main(String[] args)`',
  kotlin: '`fun main(args: Array<String>)` (declared exactly ONCE in the whole project)',
  swift: 'top-level statements in `main.swift` — NEVER `@main` in a file called `main.swift`',
  csharp: '`static Main()` or top-level statements',
  javascript: 'a top-level call that runs the program',
  typescript: 'a top-level call that runs the program',
};

/**
 * Repair prompt for a non-TS file that either fails to compile OR has a
 * stub/unimplemented body. Includes the sibling files' REAL code so a typed
 * language can align signatures (names alone are not enough).
 */
export function buildNonTsRepairPrompt(
  request: string,
  file: PlannedFile,
  currentContent: string,
  opts: { compilerErrors?: string[]; stubNotes?: string[]; goModuleName?: string },
  siblings: Array<{ path: string; content: string; language?: string }>,
): string {
  const lang = (file.language || '').trim();
  const siblingBlock = (siblings || [])
    .map((f) => `───── ${f.path}${f.language ? ` (${f.language})` : ''} ─────\n${(f.content || '').slice(0, 2200)}`)
    .join('\n\n');
  const compilerErrors = opts.compilerErrors || [];
  const stubNotes = opts.stubNotes || [];
  // The entry-point gate has no compiler to echo an error at a line, so its
  // note is the whole instruction set the model gets — state the requirement
  // explicitly instead of only describing the failure.
  const needsEntry = compilerErrors.some((e) => /no runnable entry point|no Main-Class/i.test(e));
  const entryBullet = needsEntry
    ? `\n- This file set has NO runnable entry point: it compiles but cannot be launched. Add the real entry point for ${lang || 'this language'} (${ENTRY_HINT_FOR_PROMPT[lang.toLowerCase()] || 'the language\'s entry-point construct'}) and make it CALL the program\'s main logic with real arguments, so running the program prints/does something. A file of bare declarations is NOT finished.\n- ADD the entry point — do NOT rewrite the working functions to do it. Copy every existing function through byte-for-byte and append the entry point below them. Rewriting already-correct logic while adding the entry point has silently broken it before (measured: a word counter's correct \`len(line.split())\` became \`line.split().count(' ') + 1\`).`
    : '';
  const reasons: string[] = [];
  if (compilerErrors.length) reasons.push(`━━━ COMPILER ERRORS ━━━\n${compilerErrors.join('\n')}`);
  if (stubNotes.length) reasons.push(`━━━ UNIMPLEMENTED / STUBBED (must be fully implemented) ━━━\n${stubNotes.join('\n')}`);
  // The repair round writes real code too — without the language primer it
  // re-introduces the same defects the primer exists to prevent (measured: a
  // Kotlin repair added a SECOND `fun factorial(n: Int): Long` in another file,
  // failing with `conflicting overloads`; Go repairs invented
  // `github.com/yourusername/...` import paths).
  const guidance = languageGuidanceBlock(lang, { goModuleName: opts.goModuleName || resolveGoModuleName(null, request) });
  return `User request: ${request}\n\nThe file ${file.path}${lang ? ` (${lang})` : ''} is incomplete or does not compile.\n\n${reasons.join('\n\n')}\n\n━━━ CURRENT CONTENT ━━━\n${currentContent.substring(0, 6000)}\n\n━━━ SIBLING FILES (their REAL code — match these signatures EXACTLY) ━━━\n${siblingBlock || '  (none)'}\n${guidance}\n━━━ TASK ━━━\nFix the problems above and return the COMPLETE corrected file for ${file.path}.\n- EVERY method/function you keep MUST have a REAL implementation. NEVER leave a \`// TODO\`/\`FIXME\`, an empty body, or a placeholder \`return false/0/null;\`. A method that only returns a constant without doing its job is NOT finished — implement the actual logic (this game/app must work when run).\n- The sibling code above is AUTHORITATIVE: call only members that exist there, with the EXACT names, parameter types/count, and return types shown. If a call does not match a sibling's real signature, change YOUR call to match it (do not redefine the sibling).\n- Use ${lang || 'this language'}'s NATIVE module semantics. NEVER add JavaScript/TypeScript syntax such as \`import { X } from './y';\`.\n- When the sibling files are in the SAME package / module / directory, reference them DIRECTLY — do NOT add an import statement for them (a same-package import is a compile error in some languages, e.g. Java's default package refuses \`import Foo;\`).\n- Do not change filenames or restructure unrelated code. Keep all existing working behaviour.${entryBullet}\nReturn ONLY the file's raw code — no markdown fences, no JSON wrapper, no commentary.`;
}

// ─── The repair loop ─────────────────────────────────────────────────────

export interface NonTsRepairOptions {
  request: string;
  /** Project files, MUTATED in place when a repair rewrites one. */
  files: Array<{ path: string; content: string }>;
  contractFiles: PlannedFile[];
  /** Directory the files are already written to (repaired files are rewritten). */
  exportDir: string;
  timeoutMs: number;
  /** Shared LLM-repair budget: return false to stop repairing. */
  canRepair: () => boolean;
  /** Called once per repair round consumed. */
  consumeRepair: () => void;
  /**
   * The project's ONE Go module name (see resolveGoModuleName). Pass the value
   * the WRITER used for its import statements (canvas: the project name,
   * falling back to the master node's appGoal; chat: the request). When this is
   * omitted the historical `sanitizeGoModuleName(request)` is used, which is
   * what every caller did before this option existed.
   */
  goModuleName?: string;
  /** LLM rewrite call — REQUIRED and injected. Returns raw model output. */
  repairCall: (prompt: string) => Promise<string>;
  /**
   * Set by the canvas path: the files gated here are NODE files and the
   * scaffolder writes the program's entry point afterwards, so the gate must
   * not require one of these files to declare it.
   */
  scaffoldSuppliesEntry?: boolean;
  /** Optional progress sink. */
  onProgress?: (p: { phase: string; percent: number; message?: string }) => void;
  /** Optional log sink (defaults to console.warn/console.log). */
  log?: (msg: string, level?: 'info' | 'warn') => void;
}

export interface NonTsRepairResult {
  languageGates: LanguageGate[];
  stubFailures: string[];
  rounds: number;
  /** True when a deterministic sanitize pass changed at least one file. */
  sanitized: boolean;
}

/**
 * Run the non-TS project gates and, on a compile failure OR a stub/unimplemented
 * body, give the model bounded repair rounds. Deterministic sanitize passes run
 * before the first gate and after every repair round. Mutates `files` in place
 * and rewrites repaired files to `exportDir`.
 */
export async function runNonTsGatesWithRepair(opts: NonTsRepairOptions): Promise<NonTsRepairResult> {
  const { request, files, contractFiles, exportDir, timeoutMs, canRepair, consumeRepair, repairCall } = opts;
  // Resolved ONCE for this run, then handed to every consumer below (the gate's
  // staging go.mod, the repair prompt, the sanitizer's import rewriters and the
  // shipped-layout fold), so they cannot disagree with each other or with the
  // module name the writer baked into the files' import statements.
  const goModuleName = opts.goModuleName || resolveGoModuleName(null, request);
  // The package directories that exist in the generated tree. An import path the
  // model invented is recognised by its TAIL matching one of these. Hoisted out
  // of sanitizeAll so the deterministic import fixer in the repair loop below
  // resolves a missing project package the same way the import rewriter does.
  // Paths never change during a run (only content), so computing it once is exact.
  const goPackageDirs = new Set<string>();
  for (const p of files.map((f) => f.path)) {
    const dir = p.replace(/\\/g, '/').replace(/^\.\//, '').split('/').slice(0, -1).join('/');
    if (dir) goPackageDirs.add(dir);
  }
  const scaffoldSuppliesEntry = opts.scaffoldSuppliesEntry === true;
  const log = opts.log ?? ((msg: string, level: 'info' | 'warn' = 'info') => (level === 'warn' ? console.warn(msg) : console.log(msg)));
  const emit = opts.onProgress ?? (() => { /* no sink */ });

  const langOf = (p: string): string => {
    const t = contractFiles.find((x) => normalizeContractPath(x.path) === normalizeContractPath(p));
    return (t?.language || '').toLowerCase();
  };
  const sanitizeAll = (): number => {
    let n = 0;
    for (const f of files) {
      const lang = resolveGateLanguage(langOf(f.path), f.path);
      if (!lang) continue;
      const fixed = sanitizeNonTsSource(f.content, lang, f.path, {
        goModuleName,
        goPackageDirs,
      });
      if (fixed && fixed !== f.content) {
        f.content = fixed;
        try { fs.writeFileSync(safeJoin(exportDir, f.path), fixed, 'utf-8'); } catch { /* noop */ }
        n += 1;
      }
    }
    if (n) log(`[nonTsRepair] sanitize: ${n} file(s) fixed (bare imports / truncation)`, 'warn');
    return n;
  };

  /**
   * Project-level Go pass: enforce ONE PACKAGE PER DIRECTORY on the files that
   * ship, mirroring the fold the compile gate performs on its staging copy.
   *
   * Without it the gate could report the Go build CLEAN while the export did not
   * build at all: a generated file-preview CLI shipped `main.go` (`package main
   * ` with `func main`) next to `reader.go` (`package app`) at the project root
   * with nothing importing `package app`, so `go build ./...` on the delivered
   * tree failed with `found packages main (main.go) and app (reader.go)` — the
   * gate had folded them into one package in its temp dir and judged THAT.
   *
   * Deterministic and free: no LLM round is spent, and the written files are the
   * ones that were gated, so a clean verdict is true of the delivered artifact.
   */
  const normalizeGoLayoutAll = (): number => {
    const changed = foldGoPackagePerDirectory(files, goModuleName);
    for (const c of changed) {
      const f = files.find((w) => normalizeContractPath(w.path) === normalizeContractPath(c.path));
      if (!f) continue;
      f.content = c.content;
      try { fs.writeFileSync(safeJoin(exportDir, f.path), c.content, 'utf-8'); } catch { /* noop */ }
    }
    if (changed.length) {
      log(
        `[nonTsRepair] go layout: folded ${changed.length} file(s) into their directory's package `
        + `(${changed.map((c) => c.path).join(', ')}) so the export builds as gated`,
        'warn',
      );
    }
    return changed.length;
  };

  /**
   * Deterministic cross-file duplicate-declaration pass (see
   * sandbox/duplicateDeclarations.ts). A shared domain type declared by two
   * nodes is a redeclaration error in Swift/C#/Kotlin/Java; this removes the
   * redundant copy from the non-owner file instead of spending a repair round
   * on a full-file rewrite that is not convergent for this defect class.
   * Returns the failures for the duplicates it could NOT safely resolve.
   */
  const dedupeAll = (): string[] => {
    const res = resolveCrossFileDuplicates(files, contractFiles);
    for (const p of res.changedPaths) {
      const f = files.find((w) => normalizeContractPath(w.path) === normalizeContractPath(p));
      if (!f) continue;
      try { fs.writeFileSync(safeJoin(exportDir, f.path), f.content, 'utf-8'); } catch { /* noop */ }
    }
    for (const n of res.notes) {
      log(
        `[nonTsRepair] duplicate '${n.symbol}' ${n.action === 'deleted' ? 'removed from' : 'reported in'} ${n.path} (owner ${n.ownerPath})`,
        'warn',
      );
    }
    return res.failures;
  };

  /**
   * Fold the duplicates that could not be resolved into the verdict as one
   * attributed gate, so the repair loop fixes them with the OWNER named — the
   * fact a bare `CS0101` never carried.
   */
  const withDuplicateFailures = (gates: LanguageGate[], failures: string[]): LanguageGate[] =>
    failures.length > 0 ? [...gates, { language: 'duplicate-definitions', clean: false, errors: failures }] : gates;

  const sanitizedPre = sanitizeAll();
  normalizeGoLayoutAll();
  const duplicateFailuresPre = dedupeAll();
  let { languageGates, stubFailures } = await runProjectGates(request, files, contractFiles, scaffoldSuppliesEntry, goModuleName);
  languageGates = withDuplicateFailures(languageGates, duplicateFailuresPre);
  if (sanitizedPre) {
    log(`[nonTsRepair] gates after sanitize: ${languageGates.map((g) => `${g.language}=${g.clean ? 'PASS' : 'FAIL'}`).join(', ') || '(none)'}`);
  }
  let rounds = 0;
  /** Files already given the deterministic Go fixers (imports + unused local). */
  const unusedTried = new Set<string>();
  while (
    (languageGates.some((g) => !g.clean) || stubFailures.length > 0) &&
    rounds < MAX_NONTS_REPAIR_ROUNDS &&
    canRepair()
  ) {
    const compileByFile = groupGateErrorsByFile(languageGates, files);
    const stubByFile = groupStubFailuresByFile(stubFailures, files);
    const failingPaths = [...new Set([...compileByFile.keys(), ...stubByFile.keys()])];
    if (!failingPaths.length) break;
    // Deterministic pre-pass (Go): an unused local is a hard build error with an
    // exact, behaviour-preserving fix, so take it BEFORE spending an LLM round —
    // the round is not consumed, and the loop re-gates straight away. Each file
    // is tried once, so a fix that does not take cannot spin the loop.
    let unusedFixed = false;
    for (const [filePath, errs] of compileByFile) {
      if (unusedTried.has(filePath)) continue;
      const cf = files.find((w) => normalizeContractPath(w.path) === normalizeContractPath(filePath));
      if (!cf || resolveGateLanguage(langOf(cf.path), cf.path) !== 'go') continue;
      unusedTried.add(filePath);
      // Both deterministic Go repair classes, in one pass. ORDER MATTERS: the
      // variable fixer locates its target by the LINE NUMBER in the compiler's
      // message, so it must run on the exact content those errors describe;
      // the import fixer only matches import specs and `undefined: name` and
      // never looks a line up, so it is safe to run second — and it MUST, since
      // adding an import shifts every later line by one. (Measured while
      // verifying the CSV→JSON export: running the import fixer first moved the
      // range header onto another line, the variable fixer then edited the wrong
      // one, and `declared and not used: i` survived the pass.)
      const before = cf.content;
      const varFixed = fixUnusedGoVariables(cf.content, errs);
      const importFixed = fixGoImports(varFixed ?? cf.content, errs, { goModuleName, goPackageDirs });
      const fixed = importFixed ?? varFixed;
      if (!fixed || fixed === before) continue;
      cf.content = fixed;
      try { fs.writeFileSync(safeJoin(exportDir, cf.path), fixed, 'utf-8'); } catch { /* noop */ }
      log(`[nonTsRepair] Go imports/vars: patched ${cf.path} deterministically (no repair round)`, 'warn');
      unusedFixed = true;
    }
    if (unusedFixed) {
      const regated = await runProjectGates(request, files, contractFiles, scaffoldSuppliesEntry, goModuleName);
      languageGates = withDuplicateFailures(regated.languageGates, duplicateFailuresPre);
      stubFailures = regated.stubFailures;
      continue;
    }
    rounds += 1;
    const failingLangs = languageGates
      .filter((g) => !g.clean && g.language !== 'duplicate-definitions' && g.language !== 'hardcoded-secret')
      .map((g) => g.language)
      .join('/');
    const duplicateCount = languageGates.find((g) => g.language === 'duplicate-definitions')?.errors.length || 0;
    // Reported separately from `failingLangs` so the log says what it is: a
    // credential problem is NOT a compile error, and `hardcoded-secret` must
    // not be rendered as "hardcoded-secret compile error(s)".
    const secretCount = languageGates.find((g) => g.language === 'hardcoded-secret')?.errors.length || 0;
    const what = [
      failingLangs ? `${failingLangs} compile error(s)` : '',
      duplicateCount ? `${duplicateCount} duplicate definition(s)` : '',
      secretCount ? `${secretCount} hardcoded credential(s)` : '',
      stubFailures.length ? `${stubFailures.length} stub/unimplemented` : '',
    ].filter(Boolean).join(' + ');
    log(`[nonTsRepair] repair (round ${rounds}) — ${what}: ${failingPaths.join(', ')}`, 'warn');
    emit({ phase: 'validating', percent: 93, message: `Fixing ${what}…` });
    let changed = false;
    for (const filePath of failingPaths) {
      if (!canRepair()) break;
      const cf = files.find((w) => normalizeContractPath(w.path) === normalizeContractPath(filePath));
      if (!cf) continue;
      const compiled = compileByFile.get(filePath) || [];
      const stub = stubByFile.get(filePath) || [];
      if (!compiled.length && !stub.length) continue;
      const planned = contractFiles.find((t) => normalizeContractPath(t.path) === normalizeContractPath(cf.path))
        || { path: cf.path, summary: '', language: '' };
      const siblingFiles = files
        .filter((w) => normalizeContractPath(w.path) !== normalizeContractPath(cf.path))
        .map((w) => ({
          path: w.path,
          content: w.content,
          language: contractFiles.find((t) => normalizeContractPath(t.path) === normalizeContractPath(w.path))?.language,
        }));
      consumeRepair();
      const prompt = buildNonTsRepairPrompt(request, planned as PlannedFile, cf.content, { compilerErrors: compiled, stubNotes: stub, goModuleName }, siblingFiles);
      const content = await repairCall(prompt);
      if (content && content !== cf.content) {
        cf.content = content;
        try { fs.writeFileSync(safeJoin(exportDir, cf.path), content, 'utf-8'); } catch { /* noop */ }
        changed = true;
      }
    }
    sanitizeAll();
    normalizeGoLayoutAll();
    const duplicateFailures = dedupeAll();
    const regate = await runProjectGates(request, files, contractFiles, scaffoldSuppliesEntry, goModuleName);
    languageGates = withDuplicateFailures(regate.languageGates, duplicateFailures);
    stubFailures = regate.stubFailures;
    if (!changed) break;
  }
  return { languageGates, stubFailures, rounds, sanitized: sanitizedPre > 0 };
}
