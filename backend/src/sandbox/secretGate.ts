/**
 * secretGate — deterministic hardcoded-credential gate for generated code.
 *
 * WHY THIS EXISTS
 * ---------------
 * The generation prompts TELL the model not to inline credentials
 * (fileGenerator.ts: "NEVER add server-side configuration: no DATABASE_URL,
 * SECRET_KEY, API_KEY, ..."), but nothing ever CHECKED. A build could ship
 * `const API_KEY = 'sk-live-...'` into the export — a real, working credential
 * committed to a generated app — and every existing gate was happy: it
 * compiles, it is not a stub, it satisfies its contract.
 *
 * WHY NOT `CodeScanner.securityScan`
 * ----------------------------------
 * That scanner already has a `hardcoded_secret` pattern, but it is unusable as
 * a BLOCKING gate here. Its regex is
 *   /(apiKey|secret|password|token)\s*[:=]\s*['"][^'"]+['"]/g
 * with no filtering at all, so it fires on every placeholder a generator
 * legitimately emits — `const API_KEY = 'your-api-key-here'`,
 * `password: 'changeme'`, `token: 'test'` — and on its other patterns
 * (`console.log`, `Math.random`, `http://`) it fires on essentially all
 * generated code. Gating on that would send every build into the repair loop
 * forever. This module keeps the high-confidence part and adds the filtering
 * that makes it safe to block on.
 *
 * DESIGN
 * ------
 * Precision is favoured over recall ON PURPOSE: a false positive costs a
 * repair round rewriting already-correct code (and, if the model complies
 * badly, real damage), while a miss only preserves today's behaviour — the
 * credential still ships, but no worse than before this gate existed.
 *
 * Two tiers, both requiring the literal to actually look like a secret:
 *   1. FORMAT patterns — shapes only a real credential has (AWS key id,
 *      GitHub/Slack/OpenAI/Stripe/Google token prefixes, PEM private keys).
 *      A placeholder essentially never matches these.
 *   2. ASSIGNMENT pattern — `key/token/password/secret = '<literal>'`, kept
 *      only when the literal is long AND high-entropy AND not a placeholder
 *      word. This is the tier that would false-positive without the filters.
 *
 * Findings are returned as gate error strings that START WITH THE FILE PATH,
 * because the shared repair loop (`groupGateErrorsByFile`) attributes errors to
 * files by matching the path inside each line.
 */

/** A file as the gates see it: a workspace-relative path and its content. */
export interface ScannedFile {
  path: string;
  content: string;
}

/** One hardcoded-credential finding. */
export interface SecretFinding {
  path: string;
  /** 1-based line number in the file. */
  line: number;
  /** Short machine-readable class, e.g. `openai_key`, `assigned_credential`. */
  kind: string;
  /** The redacted evidence line, safe to show in a prompt or a log. */
  evidence: string;
}

/** Only real source files — docs and lockfiles legitimately contain samples. */
const SCANNED_EXTS = /\.(?:ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|c|cc|cpp|h|hpp|cs|php|swift|sh|bash|yml|yaml|json|env|toml|ini|cfg|conf)$/i;
/** Files whose whole purpose is to hold non-real examples. */
const SKIP_PATH = /(?:^|\/)(?:README|LICENSE|CHANGELOG)|\b(?:\.example|\.sample|\.template|\.dist|\.md)\b/i;

/**
 * Formats a real credential has and a placeholder does not. Each entry's
 * regex is matched against the whole file; the line number is derived from the
 * match index so the finding points at the exact offending line.
 */
const FORMAT_PATTERNS: Array<{ kind: string; re: RegExp }> = [
  { kind: 'private_key_block', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { kind: 'aws_access_key_id', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'github_token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { kind: 'slack_token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { kind: 'openai_key', re: /\bsk-(?:proj-|live-)?[A-Za-z0-9_-]{20,}\b/g },
  { kind: 'stripe_key', re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { kind: 'google_api_key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
];

/**
 * The tier that needs filtering: `name = '<literal>'` for credential-ish names.
 * Captures the literal in group 1 so it can be vetted before being reported.
 */
const ASSIGNMENT_RE =
  /(?:api[_-]?key|apikey|client[_-]?secret|secret[_-]?key|access[_-]?key|auth[_-]?token|access[_-]?token|refresh[_-]?token|private[_-]?key|secret|passwd|password|token)\s*[:=]\s*['"]([^'"\n]{8,})['"]/gi;

/**
 * Values that are obviously NOT a real credential. Without this list the
 * assignment tier reports every scaffold placeholder the prompts themselves ask
 * for, and the repair loop burns its budget rewriting correct code.
 */
const PLACEHOLDER_RE =
  /^(?:$|\$\{|<[^>]*>|\*+|\.{2,}|x{3,}|y{3,}|_{3,})|your[-_ ]?[\w-]*(?:key|secret|token|password)|placeholder|change[-_ ]?me|changeme|example|dummy|sample|replace[-_ ]?me|todo|fixme|fake|not[-_]?a[-_]?real|(?:^|[-_ ])test(?:[-_ ]|$)|lorem|foobar|abc123|insert[-_ ]|enter[-_ ]/i;

/** Character classes present in a value: lower, upper, digit, symbol. */
function classCount(value: string): number {
  let n = 0;
  if (/[a-z]/.test(value)) n++;
  if (/[A-Z]/.test(value)) n++;
  if (/[0-9]/.test(value)) n++;
  if (/[^A-Za-z0-9]/.test(value)) n++;
  return n;
}

/**
 * Does this assigned literal look like a real secret rather than a sample?
 * Long AND high-entropy, accepting two classes once the value is long enough
 * (a 40-char hex key is only lower+digit but is clearly real).
 */
function looksLikeSecret(value: string): boolean {
  if (value.length < 16) return false;
  if (PLACEHOLDER_RE.test(value)) return false;
  const classes = classCount(value);
  if (classes >= 3) return true;
  return value.length >= 32 && classes >= 2;
}

/**
 * Lines that are comments. Applied to the AMBIGUOUS tier only: a placeholder
 * quoted inside a comment is documentation, but a real credential is leaked
 * wherever it sits — and `-----BEGIN ... PRIVATE KEY-----` starts with `--`, so
 * filtering tier 1 on this would have skipped every PEM block.
 */
const COMMENT_LINE = /^\s*(?:\/\/|#|\*|\/\*|--|<!--)/;

/** Redact the middle of a matched value so logs/prompts never echo a real key. */
function redact(value: string): string {
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)} (${value.length} chars)`;
}

/** 1-based line number of a character offset. */
function lineAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

/**
 * Every high-confidence hardcoded credential in the given files.
 * Scans each file once per pattern tier; dedupes by (path, line) so a value
 * matched by BOTH tiers is reported once, not twice. Tier 1 runs first, so the
 * more specific format kind wins (`openai_key`, not `assigned_credential`) —
 * two near-identical lines for one credential is pure prompt noise and burns
 * repair budget on the same fix twice.
 */
export function findHardcodedSecrets(files: ScannedFile[]): SecretFinding[] {
  const found = new Map<string, SecretFinding>();

  const record = (path: string, line: number, kind: string, evidence: string) => {
    const key = `${path}:${line}`;
    if (!found.has(key)) found.set(key, { path, line, kind, evidence });
  };

  for (const f of files) {
    if (!f?.content || !SCANNED_EXTS.test(f.path || '')) continue;
    if (SKIP_PATH.test(f.path || '')) continue;
    const lines = f.content.split('\n');

    // Tier 1 — credential formats.
    for (const { kind, re } of FORMAT_PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(f.content)) !== null) {
        const line = lineAt(f.content, m.index);
        record(f.path, line, kind, redact(m[0]));
      }
    }

    // Tier 2 — credential-ish assignment whose literal survives the filters.
    ASSIGNMENT_RE.lastIndex = 0;
    let a: RegExpExecArray | null;
    while ((a = ASSIGNMENT_RE.exec(f.content)) !== null) {
      const value = a[1];
      if (!looksLikeSecret(value)) continue;
      const line = lineAt(f.content, a.index);
      if (COMMENT_LINE.test(lines[line - 1] || '')) continue;
      record(f.path, line, 'assigned_credential', redact(value));
    }
  }

  // Map insertion order already runs tier 1 before tier 2, so the sort is
  // purely for stable, readable output.
  return [...found.values()].sort((x, y) =>
    x.path === y.path ? x.line - y.line : x.path.localeCompare(y.path));
}

/**
 * The gate's error strings. Each line LEADS WITH THE FILE PATH because the
 * shared repair loop attributes gate errors to files by matching a path inside
 * the line — an error without one is silently dropped from every repair round.
 */
export function formatSecretGateErrors(findings: SecretFinding[]): string[] {
  return findings.map((f) =>
    `${f.path}:${f.line}: SECURITY — hardcoded credential (${f.kind}: ${f.evidence}). ` +
    `Do NOT inline real credentials. Read it from the environment ` +
    `(e.g. process.env.MY_API_KEY / os.environ['MY_API_KEY']) and add the name ` +
    `to .env.example, or remove it and use a placeholder.`,
  );
}
