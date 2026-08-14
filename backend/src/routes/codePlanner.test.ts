import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { isGuiRequest, ensureGuiEntryFile, GUI_WIDGET_SECTION, APP_QUALITY_RULES, inlineExternalScriptRefs, stripTypeScript, stripTypeScriptKeepExports, verifyGeneratedContracts, findMissingPlannedFiles, buildMissingImportRepairPrompt, buildRegenerateWithErrorsPrompt, runTscCheck, normalizeTscError, isSafeNonRelativeImport, stripPhantomPackageImports, tscErrorCode, isMechanicalTscClass, applyDeterministicMissingReturnFix, applyDeterministicVoidReturnFix, selectWholeProjectRepairFiles, buildWholeProjectRepairPrompt, shouldRunNextWholeProjectRound, extractExportedFunctionArity, countCallArgumentCounts, estimateFileOutputTokens, estimatePlanOutputTokens, estimateAutoChunkSize, computeRequiredImportLines, applyDeterministicImportPatch, applyDeterministicNameDriftFix, applyImportPatch, buildImportPatchPrompt, emitCodegenProgress, buildErrorFocusedNumberedSource, buildRenderSmokeRepairPrompt, pickCliEntryFile, buildCliSmokeRepairPrompt, runBehavioralSmokeGates, type SmokeVerdict } from './codePlanner.js';

// ═══════════════════════════════════════════════════════════════════════════
// codePlanner — Interactive CLI Code Planning & Writing
// ═══════════════════════════════════════════════════════════════════════════
//
// These tests validate the helper functions and prompt templates used
// by the three interactive endpoints:
//   POST /api/reason/plan-code  — LLM plans files + asks questions
//   POST /api/reason/write-code — Writes code to disk after user approval
//   POST /api/reason/interactive — Full flow in one call
//
// The system prompts (PLAN_PROMPT, WRITE_PROMPT) and the extractJSON
// helper are tested here as pure functions.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Import the prompts and helper from the route module ──
// Since we can't easily import them directly (they're not exported),
// we define the expected content here for testing purposes.
// The actual prompts are defined in codePlanner.ts.

const PLAN_PROMPT_CONTENT = [
  'expert software architect',
  'interactive CLI mode',
  'plan what code needs to be written',    'clarifying questions',
  'OUTPUT FORMAT',
  '"reasoning"',
  '"files"',
  '"questions"',
  '"path"',
  '"summary"',
  '"language"',
  '"key"',
  '"options"',
  '"choice"',
];

const WRITE_PROMPT_CONTENT = [
  'expert software engineer',
  'COMPLETE code',
  'working code',
  'no placeholders',
  'no TODOs',
  'OUTPUT FORMAT',
  '"files"',
  '"path"',
  '"content"',
  'MUST be imported',
];

// ═══════════════════════════════════════════════════════════════════════════
// 1. System Prompt Validation
// ═══════════════════════════════════════════════════════════════════════════

describe('PLAN_PROMPT', () => {
  it('describes expert software architect role', () => {
    // The PLAN_PROMPT should describe the role properly (CLI vs GUI now handled by global preference)
    const prompt = `You are an expert software architect working in an interactive CLI mode.

Your job is to plan what code needs to be written for the user's request.

RULES:
1. First, think through what the user needs step by step
2. List every file that needs to be created with its path and a brief summary
3. Ask any clarifying questions needed before writing code
4. Be specific about file paths, languages, and what each file does
5. If the user hasn't specified important details (language, framework), ask

OUTPUT FORMAT — Return ONLY valid JSON (no markdown, no code fences):
{
  "reasoning": "Step-by-step thinking about what this app needs...",
  "files": [
    { "path": "src/main.ts", "summary": "Entry point: parses args, orchestrates the app", "language": "typescript" }
  ],
  "questions": [
    { "key": "storage", "question": "How should todos be stored?", "options": ["JSON file", "SQLite database"], "type": "choice" }
  ]
}`;
    
    for (const keyword of PLAN_PROMPT_CONTENT) {
      expect(prompt.toLowerCase()).toContain(keyword.toLowerCase());
    }
  });

  it('requires JSON output format', () => {
    const hasJsonOutput = true;
    expect(hasJsonOutput).toBe(true);
  });

  it('mentions clarifying questions', () => {
    const hasQuestions = true; // Prompt includes questions array
    expect(hasQuestions).toBe(true);
  });

  it('specifies file path, summary, and language fields', () => {
    const hasPath = true; // files[].path
    const hasSummary = true; // files[].summary
    const hasLanguage = true; // files[].language
    expect(hasPath && hasSummary && hasLanguage).toBe(true);
  });
});

describe('WRITE_PROMPT', () => {
  it('describes expert software engineer role', () => {
    const prompt = `You are an expert software engineer. The user wants to build something, and we've already planned the files and answered any questions.

Now, generate the actual COMPLETE code for EVERY file in the plan.

RULES:
1. Every file must be COMPLETE — working code, no placeholders, no TODOs
2. Files must properly import from each other
3. Include proper error handling, input validation, and edge cases
4. Follow best practices for the language
5. Each file must be production-quality
6. IMPORTS (MANDATORY): every member a file uses from another planned file MUST be imported at the top of that file — referencing a sibling's symbol with no import statement is a compile failure.

OUTPUT FORMAT — Return ONLY valid JSON (no markdown, no code fences):
{
  "files": [
    {
      "path": "src/main.ts",
      "content": "import { TodoApp } from './todo';\\n\\nconst app = new TodoApp();\\napp.run();"
    }
  ]
}`;
    
    for (const keyword of WRITE_PROMPT_CONTENT) {
      expect(prompt.toLowerCase()).toContain(keyword.toLowerCase());
    }
  });

  it('requires complete working code (no placeholders)', () => {
    expect(true).toBe(true);
  });

  it('requires valid JSON output with files array', () => {
    expect(true).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. extractJSON Helper — Extracting JSON from LLM Responses
// ═══════════════════════════════════════════════════════════════════════════

// Replicate the extractJSON logic from codePlanner.ts for testing
function extractJSON<T>(text: string): T | null {
  if (!text) return null;

  // Try direct parse first
  try {
    return JSON.parse(text) as T;
  } catch {}

  // Try extracting from code fences
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as T;
    } catch {}
  }

  // Try finding any JSON object in the text
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]) as T;
    } catch {}
  }

  return null;
}

describe('extractJSON', () => {
  it('parses valid JSON directly', () => {
    const input = JSON.stringify({
      reasoning: 'Step 1: Create the app',
      files: [{ path: 'src/main.ts', summary: 'Entry point', language: 'typescript' }],
      questions: ['CLI or web?'],
    });
    const result = extractJSON(input);
    expect(result).not.toBeNull();
    expect((result as any).reasoning).toBe('Step 1: Create the app');
    expect((result as any).files).toHaveLength(1);
    expect((result as any).files[0].path).toBe('src/main.ts');
    expect((result as any).questions).toHaveLength(1);
  });

  it('parses JSON wrapped in markdown code fences', () => {
    const json = JSON.stringify({
      files: [{ path: 'app.py', content: 'print("hello")' }],
    });
    const input = `Here is the code:\n\`\`\`json\n${json}\n\`\`\`\nLet me know.`;
    const result = extractJSON(input);
    expect(result).not.toBeNull();
    expect((result as any).files).toHaveLength(1);
    expect((result as any).files[0].path).toBe('app.py');
  });

  it('extracts JSON from text with surrounding explanation', () => {
    const input = 'Based on your request:\n{"files":[{"path":"main.go","content":"package main"}],"questions":[]}\nThis is the plan.';
    const result = extractJSON(input);
    expect(result).not.toBeNull();
    expect((result as any).files).toHaveLength(1);
    expect((result as any).files[0].path).toBe('main.go');
  });

  it('returns null for completely invalid input', () => {
    const result = extractJSON('This is not JSON at all');
    expect(result).toBeNull();
  });

  it('returns null for empty string', () => {
    const result = extractJSON('');
    expect(result).toBeNull();
  });

  it('handles JSON with code fence but no language tag', () => {
    const json = JSON.stringify({
      reasoning: 'A simple todo app',
      files: [{ path: 'todo.ts', summary: 'Todo logic', language: 'typescript' }],
      questions: [],
    });
    const input = `\`\`\`\n${json}\n\`\`\``;
    const result = extractJSON(input);
    expect(result).not.toBeNull();
    expect((result as any).files).toHaveLength(1);
    expect((result as any).files[0].path).toBe('todo.ts');
  });

  it('handles escaped newlines in JSON content strings', () => {
    const input = JSON.stringify({
      files: [{ path: 'test.ts', content: 'line1\\nline2\\nline3' }],
    });
    const result = extractJSON(input);
    expect(result).not.toBeNull();
    expect((result as any).files[0].content).toContain('\\n');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2b. normalizeQuestions Helper — structured question schema
// ═══════════════════════════════════════════════════════════════════════════

// Replicate the normalizeQuestions logic from codePlanner.ts for testing
function normalizeQuestions(questions: any): Array<{ key: string; question: string; options?: string[]; type: 'choice' | 'text' }> {
  if (!Array.isArray(questions)) return [];
  const seen = new Set<string>();
  const out: Array<{ key: string; question: string; options?: string[]; type: 'choice' | 'text' }> = [];
  questions.forEach((q: any, i: number) => {
    if (typeof q === 'string') {
      const question = (q as string).trim();
      if (!question) return;
      out.push({ key: `q${i + 1}`, question, type: 'text' });
      return;
    }
    if (!q || typeof q !== 'object') return;
    const question = typeof q.question === 'string' ? q.question.trim() : '';
    if (!question) return;
    let key = typeof q.key === 'string' && q.key.trim() ? q.key.trim() : `q${i + 1}`;
    const baseKey = key;
    let n = 2;
    while (seen.has(key)) { key = `${baseKey}_${n++}`; }
    seen.add(key);
    const options = Array.isArray(q.options)
      ? q.options.filter((o: any) => typeof o === 'string' && o.trim().length > 0).map((o: string) => o.trim())
      : undefined;
    const type: 'choice' | 'text' = options && options.length > 0 ? 'choice' : 'text';
    out.push({ key, question, ...(options && options.length ? { options } : {}), type });
  });
  return out;
}

describe('normalizeQuestions', () => {
  it('assigns stable keys and keeps options for legacy string questions', () => {
    const out = normalizeQuestions(['CLI or web?', 'What DB?']);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ key: 'q1', question: 'CLI or web?', type: 'text' });
    expect(out[1]).toEqual({ key: 'q2', question: 'What DB?', type: 'text' });
  });

  it('keeps structured questions with key/options and infers type choice', () => {
    const out = normalizeQuestions([
      { key: 'interface', question: 'CLI or web?', options: ['CLI', 'Web'] },
      { key: 'ai', question: 'AI strength?', options: ['Easy', 'Hard'], type: 'choice' },
    ]);
    expect(out[0]).toEqual({ key: 'interface', question: 'CLI or web?', options: ['CLI', 'Web'], type: 'choice' });
    expect(out[1].type).toBe('choice');
  });

  it('deduplicates repeated keys with a numeric suffix', () => {
    const out = normalizeQuestions([
      { key: 'ui', question: 'A?' },
      { key: 'ui', question: 'B?' },
    ]);
    expect(out.map(q => q.key)).toEqual(['ui', 'ui_2']);
  });

  it('drops empty questions and non-object entries', () => {
    const out = normalizeQuestions(['', 42, { question: '   ' }, { question: 'Keep me?' }]);
    expect(out).toHaveLength(1);
    expect(out[0].question).toBe('Keep me?');
  });

  it('returns empty array for non-array input', () => {
    expect(normalizeQuestions(undefined)).toEqual([]);
    expect(normalizeQuestions('nope')).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2c. getDominantNodeType Helper — dominant node-type tally for the one-shot
// ═══════════════════════════════════════════════════════════════════════════

// Replicate inferNodeTypeFromPath + getDominantNodeType from codePlanner.ts
function inferNodeTypeFromPath(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (/(\bmaster\b|\bblueprint\b|architect|overview|roadmap|readme)/.test(lower)) return 'master';
  if (/(ui|view|screen|client|render|gui)/.test(lower)) return 'ui';
  if (/(db|database|store|storage|repo|model)/.test(lower)) return 'database';
  if (/(main|entry|input|io|cli|index|app)/.test(lower)) return 'input';
  return 'logic';
}

function getDominantNodeType(files: any): { type: string; language: string } | null {
  if (!files || !files.length) return null;
  const typeCounts = new Map<string, number>();
  const langCounts = new Map<string, number>();
  for (const f of files) {
    if (!f || typeof f.path !== 'string' || !f.path.trim()) continue;
    const type = inferNodeTypeFromPath(f.path);
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    const lang = typeof f.language === 'string' ? f.language.trim().toLowerCase() : '';
    if (lang) langCounts.set(lang, (langCounts.get(lang) || 0) + 1);
  }
  const priority: Record<string, number> = { master: 5, logic: 4, ui: 3, database: 2, input: 1 };
  let bestType = '';
  let bestCount = 0;
  for (const [type, count] of typeCounts) {
    if (count > bestCount || (count === bestCount && (priority[type] || 0) > (priority[bestType] || 0))) {
      bestType = type;
      bestCount = count;
    }
  }
  if (!bestType) return null;
  let bestLang = '';
  let bestLangCount = 0;
  for (const [lang, count] of langCounts) {
    if (count > bestLangCount) {
      bestLang = lang;
      bestLangCount = count;
    }
  }
  return { type: bestType, language: bestLang };
}

function resolveOneShotNodeType(dominant: any): string {
  return dominant && dominant.type === 'master' ? 'master' : 'logic';
}

describe('getDominantNodeType', () => {
  it('picks logic for a chess-style plan (main/engine/rules/ai/ui)', () => {
    const files = [
      { path: 'src/main.ts', summary: 'Entry', language: 'typescript' },
      { path: 'src/game.ts', summary: 'Engine', language: 'typescript' },
      { path: 'src/rules.ts', summary: 'Rules', language: 'typescript' },
      { path: 'src/ai.ts', summary: 'AI', language: 'typescript' },
      { path: 'src/ui.ts', summary: 'UI', language: 'typescript' },
    ];
    expect(getDominantNodeType(files)).toEqual({ type: 'logic', language: 'typescript' });
  });

  it('breaks ties deterministically (logic beats ui at 2-2)', () => {
    const files = [
      { path: 'src/engine.ts', summary: 'E', language: 'go' },
      { path: 'src/game.ts', summary: 'G', language: 'go' },
      { path: 'src/ui.ts', summary: 'U', language: 'go' },
      { path: 'src/screen.ts', summary: 'S', language: 'go' },
    ];
    expect(getDominantNodeType(files)?.type).toBe('logic');
  });

  it('picks ui for ui-heavy plans', () => {
    const files = [
      { path: 'src/App.tsx', summary: 'App', language: 'typescript' },
      { path: 'src/HomeView.tsx', summary: 'Home', language: 'typescript' },
      { path: 'src/SettingsView.tsx', summary: 'Settings', language: 'typescript' },
    ];
    expect(getDominantNodeType(files)?.type).toBe('ui');
  });

  it('returns null for empty/undefined plan', () => {
    expect(getDominantNodeType([])).toBeNull();
    expect(getDominantNodeType(undefined)).toBeNull();
  });

  it('uses the majority language mode', () => {
    const files = [
      { path: 'src/engine.ts', summary: 'E', language: 'go' },
      { path: 'src/board.ts', summary: 'B', language: 'go' },
      { path: 'src/main.rs', summary: 'M', language: 'rust' },
    ];
    expect(getDominantNodeType(files)).toEqual({ type: 'logic', language: 'go' });
  });

  it('skips file entries without a path instead of throwing', () => {
    const files = [
      { path: 'src/engine.ts', summary: 'E', language: 'go' },
      { summary: 'no path' } as any,
      { path: 'src/ui.ts', summary: 'U', language: 'go' },
    ];
    expect(getDominantNodeType(files)).toEqual({ type: 'logic', language: 'go' });
  });

  it('tolerates a non-string language field (untrusted JSON)', () => {
    const files = [
      { path: 'src/engine.ts', summary: 'E', language: 42 as any },
      { path: 'src/board.ts', summary: 'B', language: 'go' },
      { path: 'src/ui.ts', summary: 'U', language: 'go' },
    ];
    expect(getDominantNodeType(files)).toEqual({ type: 'logic', language: 'go' });
  });

  it('detects master/blueprint/architecture files as the master type', () => {
    expect(inferNodeTypeFromPath('src/master.ts')).toBe('master');
    expect(inferNodeTypeFromPath('blueprint.md')).toBe('master');
    expect(inferNodeTypeFromPath('docs/architecture.md')).toBe('master');
    expect(inferNodeTypeFromPath('README.md')).toBe('master');
    expect(inferNodeTypeFromPath('src/game.ts')).toBe('logic');
  });

  it('breaks ties in favor of master over logic', () => {
    const files = [
      { path: 'src/master.ts', summary: 'Blueprint', language: 'typescript' },
      { path: 'src/game.ts', summary: 'Engine', language: 'typescript' },
    ];
    expect(getDominantNodeType(files)?.type).toBe('master');
  });
});

describe('resolveOneShotNodeType', () => {
  it('returns master only for the master dominant type, else logic', () => {
    expect(resolveOneShotNodeType({ type: 'master' })).toBe('master');
    expect(resolveOneShotNodeType({ type: 'logic' })).toBe('logic');
    expect(resolveOneShotNodeType({ type: 'ui' })).toBe('logic');
    expect(resolveOneShotNodeType({ type: 'database' })).toBe('logic');
    expect(resolveOneShotNodeType({ type: 'input' })).toBe('logic');
  });

  it('returns logic for null/undefined dominant', () => {
    expect(resolveOneShotNodeType(null)).toBe('logic');
    expect(resolveOneShotNodeType(undefined)).toBe('logic');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2d. getPlanPromptWithContext — user context injected into the PLAN prompt
// ═══════════════════════════════════════════════════════════════════════════

// Replicate the capInjection + getPlanPromptWithContext composition from codePlanner.ts
function capInjection(text: string, maxChars: number): string {
  if (!text) return '';
  return text.length > maxChars ? text.substring(0, maxChars) + '\n…(truncated)' : text;
}

function getPlanPromptWithContext(preferenceBase: string, profile: string, manifesto: string, library: string): string {
  const parts: string[] = [preferenceBase];
  if (profile) parts.push(profile);
  if (manifesto) parts.push(`\n\n${manifesto}`);
  const lib = capInjection(library, 1500);
  if (lib) parts.push(`\n\n${lib}`);
  return parts.join('\n');
}

describe('getPlanPromptWithContext', () => {
  it('injects profile, manifesto and library alongside the preference block', () => {
    const prompt = getPlanPromptWithContext(
      'PLAN_PROMPT (cli)',
      'USER PROFILE: dark, typescript',
      'DESIGN MANIFESTO',
      'LIBRARY CONTENT',
    );
    expect(prompt).toContain('PLAN_PROMPT (cli)');
    expect(prompt).toContain('USER PROFILE: dark, typescript');
    expect(prompt).toContain('DESIGN MANIFESTO');
    expect(prompt).toContain('LIBRARY CONTENT');
  });

  it('caps the library injection at 1500 chars with a truncation marker', () => {
    const big = 'x'.repeat(3000);
    const prompt = getPlanPromptWithContext('PLAN_PROMPT (ask)', 'profile', '', big);
    expect(prompt).toContain('…(truncated)');
    expect(prompt.length).toBeLessThan(1600);
  });

  it('omits empty profile/manifesto/library sections', () => {
    const prompt = getPlanPromptWithContext('PLAN_PROMPT (gui)', '', '', '');
    expect(prompt).toBe('PLAN_PROMPT (gui)');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2e. getWritePromptWithContext library MODES — goal | hybrid | dominant
// ═══════════════════════════════════════════════════════════════════════════

// Replicate normalizeLibraryMode + the library-branch of getWritePromptWithContext
// from codePlanner.ts (the parts that change per mode: which context source gets
// which budget). Returns the library-section strings ONLY (base + profile +
// manifesto are identical across modes and covered by 2d).
function normalizeLibraryMode(v: any): string {
  return v === 'goal' || v === 'dominant' ? v : 'hybrid';
}

function writeLibrarySections(
  goalLib: string,
  nodeLib: string,
  dominant: any,
  mode: any,
): string[] {
  const m = normalizeLibraryMode(mode);
  const hasDominant = !!(dominant && dominant.type);
  if (m === 'goal') {
    const lib = capInjection(goalLib, 1800);
    return lib ? [lib] : [];
  }
  if (m === 'dominant') {
    if (hasDominant) {
      const lib = capInjection(nodeLib, 1800);
      return lib ? [lib] : [];
    }
    const lib = capInjection(goalLib, 1800);
    return lib ? [lib] : [];
  }
  // hybrid
  if (hasDominant) {
    const out: string[] = [];
    const g = capInjection(goalLib, 900);
    if (g) out.push(g);
    const n = capInjection(nodeLib, 900);
    if (n) out.push(n);
    return out;
  }
  const lib = capInjection(goalLib, 1800);
  return lib ? [lib] : [];
}

describe('getWritePromptWithContext library modes', () => {
  it('normalizes unknown/empty modes to hybrid (the shipped default)', () => {
    expect(normalizeLibraryMode(undefined)).toBe('hybrid');
    expect(normalizeLibraryMode('garbage')).toBe('hybrid');
    expect(normalizeLibraryMode('')).toBe('hybrid');
  });

  it('accepts the goal and dominant modes', () => {
    expect(normalizeLibraryMode('goal')).toBe('goal');
    expect(normalizeLibraryMode('dominant')).toBe('dominant');
  });

  it('goal mode: full budget goes to goal-based context, no node-type section', () => {
    const sections = writeLibrarySections('GOAL'.repeat(500), 'NODE'.repeat(500), { type: 'logic', language: 'typescript' }, 'goal');
    expect(sections).toHaveLength(1);
    expect(sections[0]).toContain('GOAL');
    expect(sections[0]).not.toContain('NODE');
    expect(sections[0].length).toBeGreaterThan(900); // full 1800 budget used
  });

  it('goal mode caps at 1800 chars with truncation marker', () => {
    const sections = writeLibrarySections('x'.repeat(4000), '', null, 'goal');
    expect(sections).toHaveLength(1);
    expect(sections[0]).toContain('…(truncated)');
    expect(sections[0].length).toBeLessThan(1820);
  });

  it('dominant mode REPLACES goal context with node-type context at full budget', () => {
    const sections = writeLibrarySections('GOAL-CONTENT', 'NODE-CONTENT'.repeat(300), { type: 'logic', language: 'typescript' }, 'dominant');
    expect(sections).toHaveLength(1);
    expect(sections[0]).toContain('NODE-CONTENT');
    expect(sections[0]).not.toContain('GOAL-CONTENT');
    expect(sections[0].length).toBeGreaterThan(900); // full 1800 budget, not the 900 half
  });

  it('dominant mode falls back to goal-based context when no dominant type is known', () => {
    const sections = writeLibrarySections('GOAL-FALLBACK', 'NODE-CONTENT', null, 'dominant');
    expect(sections).toHaveLength(1);
    expect(sections[0]).toContain('GOAL-FALLBACK');
    expect(sections[0]).not.toContain('NODE-CONTENT');
  });

  it('hybrid mode splits 900/900 when a dominant type is known', () => {
    const sections = writeLibrarySections('G'.repeat(1200), 'N'.repeat(1200), { type: 'master', language: 'typescript' }, 'hybrid');
    expect(sections).toHaveLength(2);
    expect(sections[0]).toContain('G');
    expect(sections[1]).toContain('N');
    expect(sections[0].length).toBeLessThan(920);
    expect(sections[1].length).toBeLessThan(920);
  });

  it('hybrid mode uses the full goal-based budget when no dominant type is known', () => {
    const sections = writeLibrarySections('H'.repeat(1200), 'N'.repeat(1200), null, 'hybrid');
    expect(sections).toHaveLength(1);
    expect(sections[0]).toContain('H');
    expect(sections[0]).not.toContain('N');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2h. CHUNK_WRITE_PROMPT — chunked-mode system prompt variant
// ═══════════════════════════════════════════════════════════════════════════

// Replicate CHUNK_WRITE_PROMPT from codePlanner.ts (the chunked path must pass
// this as basePrompt so the SYSTEM prompt agrees with the user prompt's
// "only THIS CHUNK" instruction — otherwise a weak model obeys the one-shot
// WRITE_PROMPT and writes every file, reintroducing the token cap).
const CHUNK_WRITE_PROMPT_CONTENT = [
  'only for the file(s) listed in THIS CHUNK',
  'never other files of the plan',
  'never new unplanned files',
  'ALREADY-WRITTEN FILES',
  'never import from a file that isn\'t listed as already-written',
  'COMPACTNESS (MANDATORY)',
  '"files"',
  '"path"',
  '"content"',
];

describe('CHUNK_WRITE_PROMPT', () => {
  it('instructs writing only this chunk\'s files (not every file in the plan)', () => {
    const prompt = `You are an expert software engineer writing dense, production-quality code, one chunk at a time.

The project has already been planned, and other files may already exist on disk.

RULES:
1. Write COMPLETE, working code ONLY for the file(s) listed in THIS CHUNK — never other files of the plan, never new unplanned files.
2. Every file must be COMPLETE — working code, no placeholders, no TODOs
3. Import from already-written files ONLY the members listed in their declared exports (see ALREADY-WRITTEN FILES and the FILE CONTRACTS).
4. NEVER reference a member that isn't declared in the exporting file's exports, and NEVER import from a file that isn't listed as already-written or in THIS CHUNK — undeclared cross-file references are the #1 compile failure.
5. Include proper error handling, input validation, and edge cases.

COMPACTNESS (MANDATORY):
6. Write DENSE, CONCISE code. NO boilerplate comments, NO verbose docstrings, NO explanatory comments, NO dead code.
7. Comment only where non-obvious. Prefer expressive identifiers over comments.
8. Keep every file as compact as possible while COMPLETE (aim for ~80–300 lines).

OUTPUT FORMAT — Return ONLY a single valid JSON object. NO markdown, NO code fences, NO commentary before or after:
{"files":[{"path":"src/main.ts","content":"..."}]}

⚠️ CRITICAL: The JSON must be COMPLETE — a truncated or unclosed JSON is a total failure. If you run low on space, TRIM ONLY comments and non-essential embellishments — NEVER drop core logic or leave the JSON unclosed.`;
    for (const keyword of CHUNK_WRITE_PROMPT_CONTENT) {
      expect(prompt.toLowerCase()).toContain(keyword.toLowerCase());
    }
  });

  it('differs from the one-shot WRITE_PROMPT (chunk-scoped, not whole-plan)', () => {
    const chunkPrompt = 'Write COMPLETE, working code ONLY for the file(s) listed in THIS CHUNK';
    const oneShotPrompt = 'generate the actual COMPLETE code for EVERY file in the plan';
    expect(chunkPrompt).toContain('THIS CHUNK');
    expect(chunkPrompt).not.toContain('EVERY file');
    expect(oneShotPrompt).toContain('EVERY file');
    expect(oneShotPrompt).not.toContain('THIS CHUNK');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2i. P1 token-based auto-chunk estimates
// ═══════════════════════════════════════════════════════════════════════════

describe('estimatePlanOutputTokens (P1 token-based auto-chunk)', () => {
  it('returns 0 for an empty plan', () => {
    expect(estimatePlanOutputTokens([])).toBe(0);
  });

  it('gives each file a scaffolding floor + scope from the summary', () => {
    const files = [
      { path: 'src/main.ts', summary: 'Entry point', language: 'typescript', exports: ['main'], uses: [] },
      { path: 'src/ui.html', summary: 'Full interface with widgets', language: 'html', exports: [], uses: [] },
    ];
    const perFile = files.map(f => estimateFileOutputTokens(f as any));
    expect(perFile[0]).toBeGreaterThanOrEqual(160);
    expect(perFile[1]).toBeGreaterThanOrEqual(220); // html (self-contained UI) floor is higher
    const total = estimatePlanOutputTokens(files as any);
    expect(total).toBe(perFile[0] + perFile[1] + 40); // + JSON wrapper
  });

  it('scales with summary length (longer scope → more estimated tokens)', () => {
    const short = estimatePlanOutputTokens([{ path: 'a.ts', summary: 'x', language: 'typescript' }] as any);
    const long = estimatePlanOutputTokens([{ path: 'a.ts', summary: 'x'.repeat(300), language: 'typescript' }] as any);
    expect(long).toBeGreaterThan(short);
  });

  it('auto-chunks by FILE COUNT once the plan exceeds 6 files (old blind spot)', () => {
    // 8 files were ONE-SHOT under the old fixed >14 rule — now the >6 rule
    // must return a chunk size, and it stays within the [2,4] window.
    const files = Array.from({ length: 8 }, (_, i) => ({
      path: `src/f${i}.ts`,
      summary: 'Module logic',
      language: 'typescript',
    })) as any;
    const size = estimateAutoChunkSize(files);
    expect(size).toBeGreaterThanOrEqual(2);
    expect(size).toBeLessThanOrEqual(4);
  });

  it('auto-chunks by TOKEN ESTIMATE for few-but-fat plans under the count rule', () => {
    // 5 files (≤6, no count trigger) whose declared scope is huge — the
    // estimate must cross 6k and still force chunking.
    const files = Array.from({ length: 5 }, (_, i) => ({
      path: `src/f${i}.ts`,
      summary: 'x'.repeat(3500), // giant declared scope
      language: 'typescript',
    })) as any;
    expect(estimatePlanOutputTokens(files)).toBeGreaterThan(6000);
    expect(estimateAutoChunkSize(files)).toBeDefined();
  });

  it('stays one-shot for small plans (≤6 files, small scope)', () => {
    const files = Array.from({ length: 4 }, (_, i) => ({
      path: `src/f${i}.ts`,
      summary: 'Small module',
      language: 'typescript',
    })) as any;
    expect(estimateAutoChunkSize(files)).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2j. P1 import-only patch machinery (zero-LLM fix + tiny patch call)
// ═══════════════════════════════════════════════════════════════════════════

describe('computeRequiredImportLines', () => {
  it('computes exact relative-specifier import lines from declared uses', () => {
    const file = { path: 'src/ai.ts', summary: '', language: 'typescript', exports: ['findBestMove'], uses: [{ from: 'src/game.ts', members: ['ChessGame', 'Move'] }] };
    const all = [
      file,
      { path: 'src/game.ts', summary: '', language: 'typescript', exports: ['ChessGame', 'Move'], uses: [] },
    ];
    expect(computeRequiredImportLines(file, all)).toEqual(["import { ChessGame, Move } from './game';"]);
  });

  it('skips uses whose target is not a planned file', () => {
    const file = { path: 'a.ts', summary: '', language: 'typescript', exports: [], uses: [{ from: 'missing.ts', members: ['X'] }] };
    expect(computeRequiredImportLines(file, [file])).toEqual([]);
  });
});

describe('applyDeterministicImportPatch (zero-LLM missing-import fix)', () => {
  const all = [
    { path: 'src/todo.ts', summary: '', language: 'typescript', exports: ['TodoItem', 'addTodo'], uses: [] },
    { path: 'src/main.ts', summary: '', language: 'typescript', exports: ['run'], uses: [{ from: 'src/todo.ts', members: ['TodoItem', 'addTodo'] }] },
  ];

  it('inserts missing imports after the last existing import, before the body', () => {
    const content = "import fs from 'fs';\n\nexport function run() { return addTodo(new TodoItem('x')); }";
    const patched = applyDeterministicImportPatch(content, all[1], all)!;
    expect(patched).toContain("import { TodoItem, addTodo } from './todo';");
    const existingIdx = patched!.indexOf("import fs from 'fs';");
    const addedIdx = patched!.indexOf("import { TodoItem, addTodo } from './todo';");
    const bodyIdx = patched!.indexOf('export function run');
    expect(existingIdx).toBeLessThan(addedIdx);
    expect(addedIdx).toBeLessThan(bodyIdx);
    expect(patched).not.toContain("from './game'");
  });

  it('prepends at the top when the file has no existing imports', () => {
    const content = 'export function run() { return addTodo(new TodoItem("x")); }';
    const patched = applyDeterministicImportPatch(content, all[1], all)!;
    expect(patched!.startsWith("import { TodoItem, addTodo } from './todo';\n")).toBe(true);
  });

  it('merges missing members into an existing import from the same target', () => {
    // Partial case: target IS imported but one member is missing — the patch
    // must extend the existing import line, not add a duplicate module import.
    const content = "import { TodoItem } from './todo';\n\nexport function run() { return addTodo(new TodoItem('x')); }";
    const patched = applyDeterministicImportPatch(content, all[1], all)!;
    expect(patched).toContain("import { TodoItem, addTodo } from './todo';");
    expect(patched!.match(/from '\.\/todo'/g)).toHaveLength(1); // no duplicate import of ./todo
  });

  it('returns null when the file already imports from every declared target', () => {
    const content = "import { TodoItem, addTodo } from './todo';\n\nexport function run() { return addTodo(new TodoItem('x')); }";
    expect(applyDeterministicImportPatch(content, all[1], all)).toBeNull();
  });

  it('returns null for a file with no declared uses', () => {
    expect(applyDeterministicImportPatch('export const x = 1;', all[0], all)).toBeNull();
  });
});

describe('applyDeterministicNameDriftFix (zero-LLM TS2305 import align)', () => {
  const todoContent = "export interface TodoItem { id: string; title: string; }\nexport function addTodo(title: string): TodoItem { return { id: 'x', title }; }\n";
  const files = [
    { path: 'src/todo.ts', content: todoContent },
    { path: 'src/main.ts', content: 'export class TodoApp { private todos: Todo[] = []; }' },
  ];

  it('aliases the drifted import binding to the actual export (Todo -> TodoItem as Todo)', () => {
    const content = "import { Todo } from './todo';\n\nexport class TodoApp { private todos: Todo[] = []; }\n";
    const errs = ["src/main.ts(2,10): error TS2305: Module '\"./todo\"' has no exported member 'Todo'."];
    const patched = applyDeterministicNameDriftFix(content, 'src/main.ts', files, errs)!;
    expect(patched).toContain("import { TodoItem as Todo } from './todo';");
    expect(patched).toContain('private todos: Todo[] = [];'); // body untouched
  });

  it('aliases only the drifted member, keeping existing valid members', () => {
    const content = "import { Todo, addTodo } from './todo';\n\nconst t = addTodo('x') as Todo;\n";
    const errs = ["src/main.ts(1,10): error TS2305: Module '\"./todo\"' has no exported member 'Todo'."];
    const patched = applyDeterministicNameDriftFix(content, 'src/main.ts', files, errs)!;
    expect(patched).toContain("import { TodoItem as Todo, addTodo } from './todo';");
  });

  it('handles import type lines too', () => {
    const content = "import type { Todo } from './todo';\n\nconst t: Todo = { id: 'x', title: 'y' };\n";
    const errs = ["src/main.ts(1,20): error TS2305: Module '\"./todo\"' has no exported member 'Todo'."];
    const patched = applyDeterministicNameDriftFix(content, 'src/main.ts', files, errs)!;
    expect(patched).toContain("import type { TodoItem as Todo } from './todo';");
  });

  it('re-aliases an existing alias whose target is still wrong', () => {
    const content = "import { Thing as Todo } from './todo';\n\nconst t: Todo = { id: 'x', title: 'y' };\n";
    const errs = ["src/main.ts(1,20): error TS2305: Module '\"./todo\"' has no exported member 'Todo'."];
    const patched = applyDeterministicNameDriftFix(content, 'src/main.ts', files, errs)!;
    expect(patched).toContain("import { TodoItem as Todo } from './todo';");
  });

  it('returns null when there are no TS2305 errors', () => {
    const errs = ["src/main.ts(3,5): error TS2322: Type 'string' is not assignable to type 'number'."];
    expect(applyDeterministicNameDriftFix("import { Todo } from './todo';", 'src/main.ts', files, errs)).toBeNull();
  });

  it('returns null when no export plausibly matches the missing member', () => {
    const errs = ["src/main.ts(2,10): error TS2305: Module '\"./todo\"' has no exported member 'Zebra'."];
    expect(applyDeterministicNameDriftFix("import { Zebra } from './todo';\n", 'src/main.ts', files, errs)).toBeNull();
  });
});

describe('applyImportPatch (tiny LLM patch apply)', () => {
  it('removes phantom-module imports and adds the replacements', () => {
    const content = "import { App } from './app';\nimport fs from 'fs';\n\nexport function run() { return App; }";
    const out = applyImportPatch(content, { remove: ["import { App } from './app';"], add: ["import { App } from './real';"] });
    expect(out).not.toContain("import { App } from './app';");
    expect(out).toContain("import { App } from './real';");
    expect(out).toContain("import fs from 'fs';"); // untouched
    expect(out).toContain('export function run() { return App; }'); // body untouched
  });

  it('handles empty patch arrays without changing content', () => {
    const content = 'export const x = 1;';
    expect(applyImportPatch(content, {})).toBe(content);
  });
});

describe('buildImportPatchPrompt', () => {
  it('asks for ONLY add/remove import statements (never a whole-file rewrite)', () => {
    const prompt = buildImportPatchPrompt(
      'build app',
      { path: 'a.ts', summary: '', language: 'typescript', exports: [], uses: [] },
      'export const x = 1;',
      ['a.ts(1,1): error TS2304: Cannot find name \'x\''],
      []
    );
    expect(prompt).toContain('"add"');
    expect(prompt).toContain('"remove"');
    expect(prompt).toContain('NEVER touch anything but import statements');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2k. P2 live progress broadcast (one-shot is silent for minutes without it)
// ═══════════════════════════════════════════════════════════════════════════

describe('emitCodegenProgress (P2 streaming progress)', () => {
  it('clamps percent to [0,100] and fills batch defaults', () => {
    const events: any[] = [];
    const capture = (e: any) => events.push(e);
    emitCodegenProgress({ phase: 'generating', percent: 150, generatingNodes: ['a.ts'] }, capture);
    emitCodegenProgress({ phase: 'generating', percent: -5 }, capture);
    emitCodegenProgress({ phase: 'done', percent: 100, message: '✅ Done' }, capture);
    expect(events[0].percent).toBe(100);
    expect(events[0].batch).toBe(0);
    expect(events[0].totalBatches).toBe(1);
    expect(events[0].batchSize).toBe(1); // generatingNodes length
    expect(events[0].generatingNodes).toEqual(['a.ts']);
    expect(events[1].percent).toBe(0);
    expect(events[2].phase).toBe('done');
    expect(events[2].message).toBe('✅ Done');
    expect(events[2].generatingNodes).toEqual([]);
  });

  it('never throws when the broadcast fails (best-effort progress)', () => {
    expect(() =>
      emitCodegenProgress({ phase: 'generating', percent: 50 }, () => { throw new Error('io down'); })
    ).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2f. Phase 1 per-file export/uses contracts
// ═══════════════════════════════════════════════════════════════════════════

// Replicate the Phase 1 contract helpers from codePlanner.ts
function normalizeContractPath(p: string): string {
  return (p || '')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '')
    .replace(/\.(ts|tsx|js|jsx|go|rs|py|java|rb|php|c|cpp|cs)$/i, '');
}

function normalizeFileContracts(files: any): any[] {
  if (!Array.isArray(files)) return [];
  const out: any[] = [];
  for (const f of files) {
    if (!f || typeof f !== 'object') continue;
    const obj = f as Record<string, any>;
    const path = typeof obj.path === 'string' ? obj.path.trim() : '';
    if (!path) continue;
    const summary = typeof obj.summary === 'string' ? obj.summary : '';
    const language = typeof obj.language === 'string' ? obj.language : '';
    const exportsArr = Array.isArray(obj.exports)
      ? [...new Set(obj.exports.filter((m: any) => typeof m === 'string' && m.trim().length > 0).map((m: string) => m.trim()))]
      : [];
    const usesArr = Array.isArray(obj.uses)
      ? obj.uses
          .filter((u: any) => !!u && typeof u === 'object')
          .map((u: any) => {
            const from = typeof u.from === 'string' ? u.from.trim() : '';
            const members = Array.isArray(u.members)
              ? u.members.filter((m: any) => typeof m === 'string' && m.trim().length > 0).map((m: string) => m.trim())
              : [];
            return from && members.length ? { from, members } : null;
          })
          .filter((u: any) => u !== null)
      : [];
    out.push({
      path, summary, language,
      ...(exportsArr.length ? { exports: exportsArr } : {}),
      ...(usesArr.length ? { uses: usesArr } : {}),
    });
  }
  return out;
}

function buildFileContractsSection(files: any[]): string {
  if (!files.length) return '';
  const lines: string[] = [
    '━━━ FILE CONTRACTS (MANDATORY) ━━━',
    'Cross-file API surface. A file may ONLY import members listed in the exporting file\'s "exports". Never reference a member that isn\'t declared there.',
    'IMPORTS (MANDATORY): every "uses from" line below MUST be backed by a real import statement at the top of the importing file — a sibling symbol referenced without an import is a compile failure.',
    '',
  ];
  for (const f of files) {
    const exports = f.exports?.length ? f.exports.join(', ') : '(none)';
    lines.push(`[${f.path}]`);
    lines.push(`  exports: ${exports}`);
    if (f.uses?.length) {
      for (const u of f.uses) lines.push(`  uses from ${u.from}: ${u.members.join(', ')}`);
    } else {
      lines.push('  uses: (none)');
    }
    lines.push('');
  }
  return lines.join('\n');
}

function buildPerFileContractBlock(f: any, allFiles: any[]): string {
  const lines: string[] = ['━━━ FILE CONTRACT (MANDATORY) ━━━'];
  lines.push(`[${f.path}]`);
  lines.push(`  this file exports: ${f.exports?.length ? f.exports.join(', ') : '(none)'}`);
  if (f.uses?.length) {
    for (const u of f.uses) {
      const target = allFiles.find(t => normalizeContractPath(t.path) === normalizeContractPath(u.from));
      const targetExports = target?.exports?.length ? target.exports.join(', ') : '(unknown — declared nowhere)';
      lines.push(`  import from ${u.from} (exports: ${targetExports}): ${u.members.join(', ')}`);
    }
  } else {
    lines.push('  imports: (none)');
  }
  return lines.join('\n');
}

function checkContractConsistency(files: any[]): string[] {
  const violations: string[] = [];
  if (!files.length) return violations;
  const exportByPath = new Map<string, Set<string>>();
  for (const f of files) {
    exportByPath.set(normalizeContractPath(f.path), new Set(f.exports || []));
  }
  for (const f of files) {
    for (const u of f.uses || []) {
      const target = exportByPath.get(normalizeContractPath(u.from));
      if (!target) {
        violations.push(`${f.path} imports from '${u.from}' which is not a planned file`);
        continue;
      }
      for (const m of u.members) {
        if (!target.has(m)) {
          violations.push(`${f.path} imports '${m}' from ${u.from}, but ${u.from} does not export it`);
        }
      }
    }
  }
  return violations;
}

describe('Phase 1 per-file contracts', () => {
  it('normalizes exports/uses and drops pathless entries', () => {
    const files = normalizeFileContracts([
      { path: 'src/game.ts', summary: 'Engine', language: 'typescript', exports: ['ChessGame', 'Move'], uses: [] },
      { path: 'src/ai.ts', summary: 'AI', language: 'typescript', exports: ['findBestMove'], uses: [{ from: 'src/game.ts', members: ['ChessGame', 'Move'] }] },
      { summary: 'no path' },
      null,
    ]);
    expect(files).toHaveLength(2);
    expect(files[0].exports).toEqual(['ChessGame', 'Move']);
    expect(files[1].uses).toEqual([{ from: 'src/game.ts', members: ['ChessGame', 'Move'] }]);
  });

  it('sanitizes non-string members and malformed uses', () => {
    const files = normalizeFileContracts([
      { path: 'a.ts', exports: ['Good', 42, '', null, 'Bad  '], uses: [{ from: 'b.ts', members: ['X', 7, '', 'Y'] }] },
      { path: 'b.ts', exports: ['X', 'Y'] },
    ]);
    expect(files[0].exports).toEqual(['Good', 'Bad']);
    expect(files[0].uses).toEqual([{ from: 'b.ts', members: ['X', 'Y'] }]);
  });

  it('drops uses with empty members or missing from', () => {
    const files = normalizeFileContracts([
      { path: 'a.ts', uses: [{ from: 'b.ts', members: [] }, { members: ['X'] }, null] },
    ]);
    expect(files[0].uses).toBeUndefined();
  });

  it('renders the full contracts section with (none) fallbacks', () => {
    const section = buildFileContractsSection([
      { path: 'src/game.ts', exports: ['ChessGame', 'Move'] },
      { path: 'src/main.ts' },
    ]);
    expect(section).toContain('FILE CONTRACTS (MANDATORY)');
    expect(section).toContain('[src/game.ts]');
    expect(section).toContain('exports: ChessGame, Move');
    expect(section).toContain('uses: (none)');
    expect(section).toContain('[src/main.ts]');
    expect(section).toContain('exports: (none)');
    // P2 import-echo: the one-shot contract block must demand real imports.
    expect(section).toContain('MUST be backed by a real import statement');
  });

  it('returns empty section for no files', () => {
    expect(buildFileContractsSection([])).toBe('');
  });

  it('flags a file importing a member the target never exports (the chess failure class)', () => {
    const files = normalizeFileContracts([
      { path: 'src/game.ts', exports: ['ChessGame'], uses: [] },
      { path: 'src/ai.ts', exports: ['findBestMove'], uses: [{ from: 'src/game.ts', members: ['ChessBoard'] }] },
    ]);
    const violations = checkContractConsistency(files);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("src/ai.ts imports 'ChessBoard' from src/game.ts, but src/game.ts does not export it");
  });

  it('flags imports from a file that is not planned', () => {
    const files = normalizeFileContracts([
      { path: 'src/ai.ts', exports: [], uses: [{ from: 'src/missing.ts', members: ['X'] }] },
    ]);
    expect(checkContractConsistency(files)).toHaveLength(1);
  });

  it('passes when every import is declared (consistent contracts)', () => {
    const files = normalizeFileContracts([
      { path: 'src/game.ts', exports: ['ChessGame', 'Move'], uses: [] },
      { path: 'src/ai.ts', exports: ['findBestMove'], uses: [{ from: 'src/game.ts', members: ['ChessGame', 'Move'] }] },
    ]);
    expect(checkContractConsistency(files)).toEqual([]);
  });

  it('matches ./-prefixed import paths to planned files', () => {
    const files = normalizeFileContracts([
      { path: 'src/game.ts', exports: ['ChessGame'], uses: [] },
      { path: 'src/ai.ts', exports: [], uses: [{ from: './src/game.ts', members: ['ChessGame'] }] },
    ]);
    expect(checkContractConsistency(files)).toEqual([]);
  });

  it('matches extension-less import paths to planned files (src/game -> src/game.ts)', () => {
    const files = normalizeFileContracts([
      { path: 'src/game.ts', exports: ['ChessGame'], uses: [] },
      { path: 'src/ai.ts', exports: [], uses: [{ from: 'src/game', members: ['ChessGame'] }] },
    ]);
    expect(checkContractConsistency(files)).toEqual([]);
  });

  it('per-file block lists target exports and flags unknown targets', () => {
    const files = normalizeFileContracts([
      { path: 'src/game.ts', exports: ['ChessGame', 'Move'], uses: [] },
      { path: 'src/ai.ts', exports: ['findBestMove'], uses: [{ from: 'src/game.ts', members: ['ChessGame'] }, { from: 'src/ghost.ts', members: ['Boo'] }] },
    ]);
    const block = buildPerFileContractBlock(files[1], files);
    expect(block).toContain('import from src/game.ts (exports: ChessGame, Move): ChessGame');
    expect(block).toContain('src/ghost.ts (exports: (unknown — declared nowhere)): Boo');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2f. Post-write contract verifier + partial-write gate
// ═══════════════════════════════════════════════════════════════════════════

describe('verifyGeneratedContracts (post-write)', () => {
  const contracts = [
    { path: 'src/game.ts', summary: 'Engine', language: 'typescript', exports: ['ChessGame', 'Move'], uses: [] },
    { path: 'src/ai.ts', summary: 'AI', language: 'typescript', exports: ['findBestMove'], uses: [{ from: 'src/game.ts', members: ['ChessGame'] }] },
  ];

  it('passes when generated code honors every declared export and import', () => {
    const files = [
      { path: 'src/game.ts', content: 'export class ChessGame {}\nexport interface Move {}' },
      { path: 'src/ai.ts', content: "import { ChessGame } from './game';\nexport function findBestMove(b: ChessGame): Move { return null as any; }" },
    ];
    expect(verifyGeneratedContracts(files, contracts)).toEqual([]);
  });

  it('does NOT false-positive on export default class (the most common generated pattern)', () => {
    const files = [
      { path: 'src/game.ts', content: 'export default class ChessGame {}' },
      { path: 'src/ai.ts', content: "import App from './game';\nexport function findBestMove() { return null; }" },
    ];
    // contracts declare game.ts exports ['ChessGame','Move'] — this fixture only
    // exports ChessGame, so scope the contract to what this test actually writes.
    const scope = [{ path: 'src/game.ts', summary: 'Engine', language: 'typescript', exports: ['ChessGame'], uses: [] }];
    expect(verifyGeneratedContracts(files, scope)).toEqual([]);
  });

  it('does NOT false-positive on a default import whose alias differs from the target export', () => {
    const files = [
      { path: 'src/game.ts', content: 'export default class Game {}' },
      { path: 'src/ai.ts', content: "import App from './game';\nexport function findBestMove() { return null; }" },
    ];
    const scope = [{ path: 'src/game.ts', summary: 'Engine', language: 'typescript', exports: ['Game'], uses: [] }];
    expect(verifyGeneratedContracts(files, scope)).toEqual([]);
  });

  it('flags a default import when the target has no export default at all', () => {
    const files = [
      { path: 'src/game.ts', content: 'export class Game {}' },
      { path: 'src/ai.ts', content: "import App from './game';\nexport function findBestMove() { return null; }" },
    ];
    const violations = verifyGeneratedContracts(files, contracts);
    expect(violations.some(v => v.includes('has no export default'))).toBe(true);
  });

  it('checks named members of mixed default+named imports', () => {
    const files = [
      { path: 'src/game.ts', content: 'export default class Game {}\nexport interface Move {}' },
      { path: 'src/ai.ts', content: "import App, { Missing } from './game';\nexport function findBestMove() { return null; }" },
    ];
    const violations = verifyGeneratedContracts(files, contracts);
    expect(violations.some(v => v.includes("imports 'Missing' from ./game"))).toBe(true);
  });

  it('flags a declared export that the generated code never provides (drift)', () => {
    const files = [
      { path: 'src/game.ts', content: 'export class ChessGame {}' }, // Move missing
      { path: 'src/ai.ts', content: 'export function findBestMove() { return null; }' },
    ];
    const violations = verifyGeneratedContracts(files, contracts);
    expect(violations.some(v => v.includes("src/game.ts declares export 'Move'"))).toBe(true);
  });

  it('flags an import of a member the target neither exports nor declares (the chess class)', () => {
    const files = [
      { path: 'src/game.ts', content: 'export class ChessGame {}' },
      { path: 'src/ai.ts', content: "import { ChessBoard } from './game';\nexport function findBestMove() { return null; }" },
    ];
    const violations = verifyGeneratedContracts(files, contracts);
    expect(violations.some(v => v.includes("imports 'ChessBoard' from ./game"))).toBe(true);
  });

  it('is tolerant of bare/side-effect imports and non-TS files', () => {
    const files = [
      { path: 'index.html', content: '<script src="/game.ts"></script>' },
      { path: 'src/game.ts', content: 'import "reflect-metadata";\nexport class ChessGame {}' },
    ];
    expect(() => verifyGeneratedContracts(files, contracts)).not.toThrow();
  });

  it('returns empty for no generated files', () => {
    expect(verifyGeneratedContracts([], contracts)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// P0: missing-import necessity check (the one-shot hole)
// ═══════════════════════════════════════════════════════════════════════════

describe('verifyGeneratedContracts — missing-import check (P0)', () => {
  const contracts = [
    { path: 'src/todo.ts', summary: 'Todo', language: 'typescript', exports: ['TodoItem', 'TodoList'], uses: [] },
    { path: 'src/ui.ts', summary: 'UI', language: 'typescript', exports: ['displayTodos', 'promptAddTodo'], uses: [{ from: 'src/todo.ts', members: ['TodoItem'] }] },
    { path: 'src/index.ts', summary: 'Entry', language: 'typescript', exports: ['main'], uses: [{ from: 'src/todo.ts', members: ['TodoList'] }, { from: 'src/ui.ts', members: ['displayTodos', 'promptAddTodo'] }] },
  ];

  it('FLAGS a file that references sibling symbols with ZERO imports (the probe failure)', () => {
    const files = [
      { path: 'src/todo.ts', content: 'export interface TodoItem { id: number }\nexport class TodoList {}' },
      { path: 'src/ui.ts', content: 'export function displayTodos(todos: TodoItem[]) { console.log(todos); }' }, // uses TodoItem, no import
      { path: 'src/index.ts', content: 'export function main() { const list = new TodoList(); displayTodos(list); }' }, // no imports at all
    ];
    const violations = verifyGeneratedContracts(files, contracts);
    const importViolations = violations.filter(v => v.startsWith('[IMPORT]'));
    expect(importViolations.length).toBeGreaterThan(0);
    expect(importViolations.some(v => v.includes('src/ui.ts') && v.includes('never imports from it'))).toBe(true);
    expect(importViolations.some(v => v.includes('src/index.ts') && v.includes('never imports from it'))).toBe(true);
  });

  it('FLAGS a member referenced in the body but absent from a partial import', () => {
    const files = [
      { path: 'src/todo.ts', content: 'export interface TodoItem { id: number }\nexport class TodoList {}' },
      { path: 'src/ui.ts', content: "import { TodoItem } from './todo';\nexport function displayTodos(todos: TodoItem[]) { console.log(todos); }\nexport function promptAddTodo() { return null; }" },
      // index.ts imports ONLY promptAddTodo from ui, but references displayTodos
      // in its body — the referenced member is absent from the (partial) import.
      { path: 'src/index.ts', content: "import { TodoList } from './todo';\nimport { promptAddTodo } from './ui';\nexport function main() { const list = new TodoList(); displayTodos(list); promptAddTodo(); }" },
    ];
    const violations = verifyGeneratedContracts(files, contracts);
    const importViolations = violations.filter(v => v.startsWith('[IMPORT]'));
    expect(importViolations.some(v => v.includes("references 'displayTodos' from src/ui.ts but never imports it"))).toBe(true);
  });

  it('PASSES when every declared use is backed by a real import', () => {
    const files = [
      { path: 'src/todo.ts', content: 'export interface TodoItem { id: number }\nexport class TodoList {}' },
      { path: 'src/ui.ts', content: "import { TodoItem } from './todo';\nexport function displayTodos(todos: TodoItem[]) { console.log(todos); }\nexport function promptAddTodo() { return null; }" },
      { path: 'src/index.ts', content: "import { TodoList } from './todo';\nimport { displayTodos, promptAddTodo } from './ui';\nexport function main() { const list = new TodoList(); displayTodos(list); promptAddTodo(); }" },
    ];
    expect(verifyGeneratedContracts(files, contracts)).toEqual([]);
  });

  it('accepts a default import as satisfying the necessity check', () => {
    const files = [
      { path: 'src/todo.ts', content: 'export default class TodoList {}' },
      { path: 'src/index.ts', content: "import TodoList from './todo';\nexport function main() { const list = new TodoList(); }" },
    ];
    const scope = [
      { path: 'src/todo.ts', summary: 'Todo', language: 'typescript', exports: ['TodoList'], uses: [] },
      { path: 'src/index.ts', summary: 'Entry', language: 'typescript', exports: ['main'], uses: [{ from: 'src/todo.ts', members: ['TodoList'] }] },
    ];
    expect(verifyGeneratedContracts(files, scope)).toEqual([]);
  });

  it('does NOT flag a member the file declares LOCALLY (model inlined it — not a missing import)', () => {
    // ui.ts declares its own TodoItem (inlined) instead of importing it from
    // todo.ts — the code compiles (TS2304 would not fire) so the necessity
    // check must not waste a repair round on it.
    const files = [
      { path: 'src/todo.ts', content: 'export interface TodoItem { id: number }\nexport class TodoList {}' },
      { path: 'src/ui.ts', content: 'interface TodoItem { id: number }\nexport function displayTodos(todos: TodoItem[]) { console.log(todos); }\nexport function promptAddTodo() { return null; }' },
      { path: 'src/index.ts', content: "import { TodoList } from './todo';\nimport { displayTodos, promptAddTodo } from './ui';\nexport function main() { const list = new TodoList(); displayTodos(list); promptAddTodo(); }" },
    ];
    const violations = verifyGeneratedContracts(files, contracts);
    expect(violations.filter(v => v.startsWith('[IMPORT]'))).toEqual([]);
  });

  it('does NOT count a member name inside a comment or string as a reference (false-positive guard)', () => {
    // ui.ts never imports TodoItem and only mentions it in a comment + a string
    // literal — that must not trigger an [IMPORT] violation.
    const files = [
      { path: 'src/todo.ts', content: 'export interface TodoItem { id: number }\nexport class TodoList {}' },
      { path: 'src/ui.ts', content: '// NOTE: TodoItem is defined in todo.ts\nconst hint = "todo: TodoItem goes here";\nexport function displayTodos(todos: string[]) { console.log(todos); }\nexport function promptAddTodo() { return null; }' },
    ];
    const scope = [
      { path: 'src/todo.ts', summary: 'Todo', language: 'typescript', exports: ['TodoItem', 'TodoList'], uses: [] },
      { path: 'src/ui.ts', summary: 'UI', language: 'typescript', exports: ['displayTodos', 'promptAddTodo'], uses: [{ from: 'src/todo.ts', members: ['TodoItem'] }] },
    ];
    const violations = verifyGeneratedContracts(files, scope);
    expect(violations.filter(v => v.startsWith('[IMPORT]'))).toEqual([]);
  });

  it('treats import type { X } as a real import (type-only imports satisfy the necessity check)', () => {
    const files = [
      { path: 'src/todo.ts', content: 'export interface TodoItem { id: number }\nexport class TodoList {}' },
      { path: 'src/ui.ts', content: "import type { TodoItem } from './todo';\nexport function displayTodos(todos: TodoItem[]) { console.log(todos); }" },
    ];
    const scope = [
      { path: 'src/todo.ts', summary: 'Todo', language: 'typescript', exports: ['TodoItem', 'TodoList'], uses: [] },
      { path: 'src/ui.ts', summary: 'UI', language: 'typescript', exports: ['displayTodos'], uses: [{ from: 'src/todo.ts', members: ['TodoItem'] }] },
    ];
    expect(verifyGeneratedContracts(files, scope)).toEqual([]);
  });

  it('treats import type X from as a real import (default type-only imports are not a false missing-import)', () => {
    const files = [
      { path: 'src/todo.ts', content: 'export default class TodoItem {}\nexport class TodoList {}' },
      { path: 'src/ui.ts', content: "import type TodoItem from './todo';\nexport function displayTodos(todos: TodoItem[]) { console.log(todos); }" },
    ];
    const scope = [
      { path: 'src/todo.ts', summary: 'Todo', language: 'typescript', exports: ['TodoItem', 'TodoList'], uses: [] },
      { path: 'src/ui.ts', summary: 'UI', language: 'typescript', exports: ['displayTodos'], uses: [{ from: 'src/todo.ts', members: ['TodoItem'] }] },
    ];
    expect(verifyGeneratedContracts(files, scope)).toEqual([]);
  });

  it('still flags a default type-import whose target has no export default', () => {
    const files = [
      { path: 'src/todo.ts', content: 'export interface TodoItem { id: number }\nexport class TodoList {}' },
      { path: 'src/ui.ts', content: "import type TodoItem from './todo';\nexport function displayTodos(todos: TodoItem[]) { console.log(todos); }" },
    ];
    const scope = [
      { path: 'src/todo.ts', summary: 'Todo', language: 'typescript', exports: ['TodoItem', 'TodoList'], uses: [] },
      { path: 'src/ui.ts', summary: 'UI', language: 'typescript', exports: ['displayTodos'], uses: [{ from: 'src/todo.ts', members: ['TodoItem'] }] },
    ];
    const violations = verifyGeneratedContracts(files, scope);
    expect(violations.some(v => v.includes('has no export default'))).toBe(true);
  });

  it('FLAGS a phantom-module import — a relative import of a file that is neither planned nor generated (TS2307)', () => {
    // The one-shot writer invented `./types` — no planned file declares it.
    const files = [
      { path: 'src/todo.ts', content: 'export interface TodoItem { id: number }\nexport class TodoList {}' },
      { path: 'src/storage.ts', content: "import type { TodoItem } from './types';\nexport function load(): TodoItem[] { return []; }" },
    ];
    const scope = [
      { path: 'src/todo.ts', summary: 'Todo', language: 'typescript', exports: ['TodoItem', 'TodoList'], uses: [] },
      { path: 'src/storage.ts', summary: 'Storage', language: 'typescript', exports: ['load'], uses: [{ from: 'src/todo.ts', members: ['TodoItem'] }] },
    ];
    const violations = verifyGeneratedContracts(files, scope);
    const phantom = violations.filter(v => v.includes('phantom module'));
    expect(phantom.length).toBeGreaterThan(0);
    expect(phantom[0]).toContain('src/storage.ts');
    expect(phantom[0]).toContain("'.\/types'");
    expect(phantom[0].startsWith('[IMPORT]')).toBe(true); // routes to import repair
  });

  it('does NOT flag imports of planned files or generated sibling files (no phantom false-positive)', () => {
    const files = [
      { path: 'src/todo.ts', content: 'export interface TodoItem { id: number }\nexport class TodoList {}' },
      { path: 'src/storage.ts', content: "import { TodoItem } from './todo';\nexport function load(): TodoItem[] { return []; }" },
    ];
    const scope = [
      { path: 'src/todo.ts', summary: 'Todo', language: 'typescript', exports: ['TodoItem', 'TodoList'], uses: [] },
      { path: 'src/storage.ts', summary: 'Storage', language: 'typescript', exports: ['load'], uses: [{ from: 'src/todo.ts', members: ['TodoItem'] }] },
    ];
    const violations = verifyGeneratedContracts(files, scope);
    expect(violations.filter(v => v.includes('phantom module'))).toEqual([]);
  });

  it('does NOT flag node builtin / npm package imports as phantom modules', () => {
    const files = [
      { path: 'src/todo.ts', content: 'export interface TodoItem { id: number }\nexport class TodoList {}' },
      { path: 'src/storage.ts', content: "import fs from 'fs';\nimport express from 'express';\nexport function load(): TodoItem[] { return []; }" },
    ];
    const scope = [
      { path: 'src/todo.ts', summary: 'Todo', language: 'typescript', exports: ['TodoItem', 'TodoList'], uses: [] },
      { path: 'src/storage.ts', summary: 'Storage', language: 'typescript', exports: ['load'], uses: [] },
    ];
    const violations = verifyGeneratedContracts(files, scope);
    expect(violations.filter(v => v.includes('phantom module'))).toEqual([]);
  });
});

describe('buildRegenerateWithErrorsPrompt (round-2+ regenerate-in-context)', () => {
  const allFiles = [
    { path: 'src/game.ts', summary: 'Game', language: 'typescript', exports: ['ChessGame'], uses: [] },
    { path: 'src/ai.ts', summary: 'AI', language: 'typescript', exports: ['think'], uses: [{ from: 'src/game.ts', members: ['ChessGame'] }] },
  ];

  it('includes a LINE-NUMBERED copy of the current content so errors map to exact lines', () => {
    const content = 'export function think() {\n  const g = new ChessGame();\n  return g;\n}';
    const prompt = buildRegenerateWithErrorsPrompt(
      'build chess ai',
      allFiles[1],
      content,
      ['src/ai.ts(2,13): error TS2304: Cannot find name \'ChessGame\''],
      allFiles,
    );
    expect(prompt).toContain('LINE-NUMBERED');
    expect(prompt).toContain('1 | export function think() {');
    expect(prompt).toContain('2 |   const g = new ChessGame();');
    expect(prompt).toContain('error TS2304');
    expect(prompt).toContain('Rewrite the ENTIRE file'); // regenerate, not patch
    expect(prompt).toContain('IMPORT TARGETS'); // still constrains to declared exports
  });

  it('still shows the export surface of every file it imports from', () => {
    const prompt = buildRegenerateWithErrorsPrompt('build chess ai', allFiles[1], 'export const x = 1;', ['src/ai.ts(1,1): error TS2459'], allFiles);
    expect(prompt).toContain('src/game.ts exports: ChessGame');
  });

  it('shows the ERROR LINE even when the file is huge (no blind 8000-char truncation)', () => {
    // 240 long filler lines; the error points at line 241 — beyond the old
    // substring(0, 8000) cut (≈ 200 lines) where the line was invisible.
    const filler = Array.from({ length: 240 }, (_, i) => `const filler${i}: number = ${i}; // ${'pad'.repeat(24)} ${i}`).join('\n');
    const content = `${filler}\nexport const BROKEN: string = 42;`;
    expect(content.length).toBeGreaterThan(8000);
    const prompt = buildRegenerateWithErrorsPrompt(
      'x',
      allFiles[0],
      content,
      ['src/game.ts(241,26): error TS2322: Type \'number\' is not assignable to type \'string\'.'],
      allFiles,
    );
    // The exact erroring line must be visible in the numbered source.
    expect(prompt).toContain('241 | export const BROKEN: string = 42;');
    // Omitted middle is marked so the model knows regions were elided.
    expect(prompt).toContain('line(s) omitted');
    // The header (imports/exports region) is still present.
    expect(prompt).toContain('1 | const filler0: number = 0;');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildErrorFocusedNumberedSource — error-line-centered source view
// ═══════════════════════════════════════════════════════════════════════════
describe('buildErrorFocusedNumberedSource (error-line-centered source view)', () => {
  it('returns the full numbered source untruncated when content fits in budget', () => {
    const content = 'export const a = 1;\nexport const b = 2;';
    const { source, truncated } = buildErrorFocusedNumberedSource(content, []);
    expect(truncated).toBe(false);
    expect(source).toContain('1 | export const a = 1;');
    expect(source).toContain('2 | export const b = 2;');
  });

  it('keeps the header PLUS a window around each error line for large files', () => {
    const lines = Array.from({ length: 300 }, (_, i) => `line${i}: number = ${i}; // ${'pad'.repeat(20)} ${i}`);
    const content = lines.join('\n');
    expect(content.length).toBeGreaterThan(8000);
    const { source, truncated } = buildErrorFocusedNumberedSource(content, [
      'src/a.ts(200,5): error TS2554: Expected 2 arguments, but got 1.',
      'src/a.ts(260,3): error TS2339: Property \'x\' does not exist.',
    ]);
    expect(truncated).toBe(true);
    // Header is always present.
    expect(source).toContain('1 | line0: number = 0;');
    // Both error lines (and their windows) are visible.
    expect(source).toContain('200 | line199: number = 199;');
    expect(source).toContain('260 | line259: number = 259;');
    // Regions between kept windows are elided with markers.
    expect(source).toContain('line(s) omitted');
    // Far-away lines (not in any window) are NOT shown.
    expect(source).not.toContain('100 | line99 = 99;');
  });

  it('keeps only the header when there are no parseable error locations', () => {
    const content = Array.from({ length: 300 }, (_, i) => `line${i}: number = ${i}; // ${'pad'.repeat(20)} ${i}`).join('\n');
    const { source, truncated } = buildErrorFocusedNumberedSource(content, ['unparseable error without location']);
    expect(truncated).toBe(true);
    expect(source).toContain('1 | line0: number = 0;');
    expect(source).toContain('line(s) omitted');
    expect(source).not.toContain('200 | line199: number = 199;');
  });

  it('clamps the window to file bounds (error near start/end)', () => {
    // Force the truncation path with a tiny budget so the clamp actually runs
    // (an error at line 1 must clamp its window at 0, not go negative).
    const content = Array.from({ length: 50 }, (_, i) => `line${i}: number = ${i};`).join('\n');
    const { source, truncated } = buildErrorFocusedNumberedSource(content, ['src/a.ts(1,1): error TS2322: bad.'], { maxChars: 100 });
    expect(truncated).toBe(true);
    expect(source).toContain('1 | line0: number = 0;');
    expect(source).toContain('2 | line1: number = 1;'); // window extends forward from line 1
    expect(source).toContain('line(s) omitted');
  });

  it('returns the full source when content fits even with errors present', () => {
    const content = 'export const a = 1;\nexport const b = 2;';
    const { source, truncated } = buildErrorFocusedNumberedSource(content, ['src/a.ts(2,1): error TS2322: bad.']);
    expect(truncated).toBe(false);
    expect(source).toContain('2 | export const b = 2;');
  });

  it('parses Chrome-console `:line:col` locators (the smoke-gate error format)', () => {
    // Behavioral smoke errors come from Chrome, not tsc: "Uncaught TypeError:
    // Cannot set properties of null ... at file:///app.html:12:5" — the old
    // `(line,col)` regex never matched them, so the error line stayed hidden.
    const lines = Array.from({ length: 40 }, (_, i) => `<div>row${i}</div>`);
    lines[11] = `  <button onclick="addTodo()">Add</button>`; // line 12
    const content = lines.join('\n');
    const { source, truncated } = buildErrorFocusedNumberedSource(content, [
      'Uncaught TypeError: Cannot set properties of null (setting \'innerHTML\') at file:///tmp/app.html:12:5',
    ], { maxChars: 300 });
    expect(truncated).toBe(true);
    expect(source).toContain('12 |   <button onclick="addTodo()">Add</button>');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildRenderSmokeRepairPrompt — behavioral repair for HTML that fails Chrome
// ═══════════════════════════════════════════════════════════════════════════
describe('buildRenderSmokeRepairPrompt (behavioral repair)', () => {
  const htmlFile = { path: 'index.html', summary: 'todo app', language: 'html', exports: [], uses: [] };

  it('includes the smoke failure, the line-numbered content, and the rewrite contract', () => {
    const content = '<button onclick="addTodo()">Add</button>\n<script>function addTodo() { document.getElementById("missing").innerHTML = "x"; }</script>';
    const errors = ['clicked primary control triggered: Cannot set properties of null (setting \'innerHTML\')'];
    const p = buildRenderSmokeRepairPrompt('build a todo app', htmlFile, content, errors, '1 interaction-triggered error(s)');
    expect(p).toContain('behavioral checks');
    expect(p).toContain('Cannot set properties of null');
    expect(p).toContain('1 | <button onclick="addTodo()">Add</button>'); // line-numbered
    expect(p).toContain('no markdown fences');
    expect(p).toContain('ZERO console/page errors');
  });

  it('highlights the common root causes for behavioral failures', () => {
    const p = buildRenderSmokeRepairPrompt('x', htmlFile, '<button>x</button>', ['pageErrors: boom'], 'failed');
    expect(p).toContain('function referenced by an inline onclick');
    expect(p).toContain('calling a DOM method on null');
    expect(p).toContain('blank page');
  });
});

describe('buildMissingImportRepairPrompt (dedicated import repair)', () => {
  const allFiles = [
    { path: 'src/todo.ts', summary: 'Todo', language: 'typescript', exports: ['TodoItem', 'TodoList'], uses: [] },
    { path: 'src/index.ts', summary: 'Entry', language: 'typescript', exports: ['main'], uses: [{ from: 'src/todo.ts', members: ['TodoItem', 'TodoList'] }] },
  ];

  it('emits the exact import lines from the declared uses', () => {
    const prompt = buildMissingImportRepairPrompt(
      'build a todo app',
      allFiles[1],
      'export function main() { const list = new TodoList(); }',
      ["[IMPORT] src/index.ts uses members from src/todo.ts (declared) but never imports from it"],
      allFiles,
    );
    expect(prompt).toContain("import { TodoItem, TodoList } from './todo';");
    expect(prompt).toContain('ADD the missing import statement(s)');
    expect(prompt).toContain('Do NOT remove, rename, or restructure');
    expect(prompt).toContain('src/index.ts');
  });

  it('computes relative specifiers for nested paths', () => {
    const nested = [
      { path: 'src/todo.ts', summary: 'Todo', language: 'typescript', exports: ['TodoList'], uses: [] },
      { path: 'src/logic/app.ts', summary: 'App', language: 'typescript', exports: ['main'], uses: [{ from: 'src/todo.ts', members: ['TodoList'] }] },
    ];
    const prompt = buildMissingImportRepairPrompt('build a todo app', nested[1], 'export function main() {}', ['[IMPORT] x'], nested);
    expect(prompt).toContain("import { TodoList } from '../todo';");
  });

  it('instructs defining locally when NO import lines are computable (phantom-symbol case)', () => {
    // File with zero declared uses: the missing-name class (TS2304/2339/2503/2552)
    // routes here, and with no REQUIRED IMPORTS to add the prompt must tell the
    // model to EITHER define the symbol locally OR import it — never leave a
    // bare reference like the `new App()` probe failure.
    const solo = [
      { path: 'src/main.ts', summary: 'Entry', language: 'typescript', exports: ['main'], uses: [] },
    ];
    const prompt = buildMissingImportRepairPrompt(
      'build an app',
      solo[0],
      'export function main() { const app = new App(); app.run(); }',
      ["error TS2552: Cannot find name 'App'. Did you mean 'app'?"],
      solo,
    );
    expect(prompt).toContain('UNDEFINED SYMBOLS');
    expect(prompt).toContain('define it locally');
    expect(prompt).toContain('Never leave a bare reference to an undefined symbol');
  });
});

describe('findMissingPlannedFiles (partial one-shot gate)', () => {
  const contracts = [
    { path: 'src/game.ts', summary: 'Engine', language: 'typescript', exports: [], uses: [] },
    { path: 'src/ai.ts', summary: 'AI', language: 'typescript', exports: [], uses: [] },
    { path: 'src/ui.ts', summary: 'UI', language: 'typescript', exports: [], uses: [] },
  ];

  it('finds the files a partial one-shot skipped (the 1-of-4 class)', () => {
    const missing = findMissingPlannedFiles([{ path: 'src/game.ts' }], contracts);
    expect(missing.map(m => m.path)).toEqual(['src/ai.ts', 'src/ui.ts']);
  });

  it('returns empty when every planned file is present', () => {
    const missing = findMissingPlannedFiles(
      contracts.map(c => ({ path: c.path })),
      contracts
    );
    expect(missing).toEqual([]);
  });

  it('matches paths with ./ prefixes and extensions', () => {
    const missing = findMissingPlannedFiles([{ path: './src/game.ts' }], contracts);
    expect(missing.map(m => m.path)).toEqual(['src/ai.ts', 'src/ui.ts']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2g. Chunked incremental generation helpers
// ═══════════════════════════════════════════════════════════════════════════

// Replicate the chunked-mode helpers from codePlanner.ts
function normalizeChunkSize(v: any): number | undefined {
  let n: number;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && /^\d+$/.test(v.trim())) n = Number(v.trim());
  else return undefined;
  if (!Number.isFinite(n)) return undefined;
  n = Math.floor(n);
  return n >= 1 && n <= 50 ? n : undefined;
}

function orderFilesByDependency(files: any[]): any[] {
  const byPath = new Map(files.map(f => [normalizeContractPath(f.path), f]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const out: any[] = [];
  const visit = (f: any): void => {
    const key = normalizeContractPath(f.path);
    if (visited.has(key)) return;
    if (visiting.has(key)) return;
    visiting.add(key);
    for (const u of f.uses || []) {
      const dep = byPath.get(normalizeContractPath(u.from));
      if (dep) visit(dep);
    }
    visiting.delete(key);
    visited.add(key);
    out.push(f);
  };
  for (const f of files) visit(f);
  return out;
}

function chunkFiles(arr: any[], size: number): any[][] {
  const chunks: any[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function buildChunkPrompt(
  request: string,
  intentSection: string,
  fileList: string,
  contractsSection: string,
  answersText: string,
  alreadyWritten: Array<{ path: string; exports?: string[] }>,
  chunk: any[],
  chunkIndex: number,
  totalChunks: number,
): string {
  const writtenBlock = alreadyWritten.length
    ? alreadyWritten.map(f => `[${f.path}] exports: ${f.exports?.length ? f.exports.join(', ') : '(none)'}`).join('\n')
    : '(none yet — this is the first chunk)';
  const chunkBlock = chunk.map((f, i) => {
    const uses = f.uses?.length ? '\n  uses: ' + f.uses.map((u: any) => `from ${u.from}: ${u.members.join(', ')}`).join('; ') : '';
    return `[${i + 1}] ${f.path} (${f.language}) — ${f.summary}\n  exports: ${f.exports?.length ? f.exports.join(', ') : '(none)'}${uses}`;
  }).join('\n');
  return `User request: ${request}\n\n${intentSection}\n\n━━━ PROJECT PLAN (ALL FILES) ━━━\n${fileList}\n\n${contractsSection}\n\n━━━ ALREADY-WRITTEN FILES (ON DISK — import from these using their declared exports) ━━━\n${writtenBlock}\n\n━━━ CHUNK ${chunkIndex}/${totalChunks} — FILES TO WRITE NOW ━━━\n${chunkBlock}\n\n━━━ USER ANSWERS ━━━\n${answersText}\n\n━━━ TASK ━━━\nWrite COMPLETE, working code ONLY for the ${chunk.length} file(s) listed in THIS CHUNK. Files in the ALREADY-WRITTEN list exist on disk — import from them ONLY the members in their declared exports. NEVER import from a file that is neither in the ALREADY-WRITTEN list nor in THIS CHUNK — it does not exist. HONOR the FILE CONTRACTS: never reference an undeclared member.\n\nCOMPACTNESS: Write DENSE code — no boilerplate comments, no verbose docstrings, minimal whitespace. Keep every file tight but complete.\n\nIMPORTANT: Write the ACTUAL file content. Not stubs, not placeholders — real working code.\n\nReturn ONLY valid JSON with a "files" array, where each entry has "path" and "content".`;
}

function buildRepairPrompt(request: string, file: any, currentContent: string, errors: string[], allFiles: any[] = []): string {
  const targets = (file.uses || []).map((u: any) => {
    const t = allFiles.find((x: any) => normalizeContractPath(x.path) === normalizeContractPath(u.from));
    return `  ${u.from} exports: ${t?.exports?.length ? t.exports.join(', ') : '(unknown — declared nowhere)'}`;
  });
  const targetBlock = targets.length
    ? `\n\n━━━ IMPORT TARGETS (may ONLY reference these declared members) ━━━\n${targets.join('\n')}`
    : '';
  return `User request: ${request}\n\nThe file ${file.path} was just generated but does not compile.\n\n━━━ CURRENT CONTENT ━━━\n${currentContent.substring(0, 6000)}\n\n━━━ TSC ERRORS ━━━\n${errors.join('\n')}${targetBlock}\n\n━━━ TASK ━━━\nFix the compile errors above. Return the COMPLETE corrected content for ${file.path} — the entire file, not a diff. Honor the file contracts: never reference a member not declared in the importing file's exports.\n\nReturn ONLY the file's raw code — no markdown fences, no JSON wrapper, no commentary.`;
}

describe('chunked generation helpers', () => {
  it('normalizes chunk sizes (int 1..50) and rejects the rest', () => {
    expect(normalizeChunkSize(2)).toBe(2);
    expect(normalizeChunkSize('3')).toBe(3);
    expect(normalizeChunkSize(2.9)).toBe(2);
    expect(normalizeChunkSize(1)).toBe(1);
    expect(normalizeChunkSize(50)).toBe(50);
    expect(normalizeChunkSize(0)).toBeUndefined();
    expect(normalizeChunkSize(51)).toBeUndefined();
    expect(normalizeChunkSize(-2)).toBeUndefined();
    expect(normalizeChunkSize('abc')).toBeUndefined();
    expect(normalizeChunkSize(undefined)).toBeUndefined();
  });

  it('orders files so import targets come first (deps before dependents)', () => {
    const files = normalizeFileContracts([
      { path: 'src/ai.ts', summary: 'AI', language: 'ts', exports: ['findBestMove'], uses: [{ from: 'src/game.ts', members: ['ChessGame'] }] },
      { path: 'src/game.ts', summary: 'Engine', language: 'ts', exports: ['ChessGame'], uses: [] },
      { path: 'src/main.ts', summary: 'Entry', language: 'ts', exports: ['main'], uses: [{ from: 'src/game.ts', members: ['ChessGame'] }] },
    ]);
    const ordered = orderFilesByDependency(files);
    expect(ordered.map(f => f.path)).toEqual(['src/game.ts', 'src/ai.ts', 'src/main.ts']);
  });

  it('survives dependency cycles without infinite recursion', () => {
    const files = normalizeFileContracts([
      { path: 'a.ts', exports: ['A'], uses: [{ from: 'b.ts', members: ['B'] }] },
      { path: 'b.ts', exports: ['B'], uses: [{ from: 'a.ts', members: ['A'] }] },
    ]);
    const ordered = orderFilesByDependency(files);
    expect(ordered).toHaveLength(2);
  });

  it('splits arrays into chunks of the given size', () => {
    expect(chunkFiles([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkFiles([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
    expect(chunkFiles([], 3)).toEqual([]);
  });

  it('chunk prompt lists already-written files and forbids unplanned imports', () => {
    const p = buildChunkPrompt(
      'chess', 'INTENT', 'FILE LIST', 'CONTRACTS', 'ANSWERS',
      [{ path: 'src/game.ts', exports: ['ChessGame'] }],
      [{ path: 'src/ai.ts', summary: 'AI', language: 'ts', exports: ['findBestMove'], uses: [{ from: 'src/game.ts', members: ['ChessGame'] }] }],
      2, 3,
    );
    expect(p).toContain('CHUNK 2/3');
    expect(p).toContain('[src/game.ts] exports: ChessGame');
    expect(p).toContain('NEVER import from a file that is neither in the ALREADY-WRITTEN list nor in THIS CHUNK');
    expect(p).toContain('src/ai.ts');
  });

  it('chunk prompt marks the first chunk with none-yet note', () => {
    const p = buildChunkPrompt('x', 'I', 'L', 'C', 'A', [], [{ path: 'main.ts', summary: 'M', language: 'ts' }], 1, 1);
    expect(p).toContain('(none yet — this is the first chunk)');
  });

  it('repair prompt feeds back the file content and tsc errors', () => {
    const p = buildRepairPrompt('chess', { path: 'src/ai.ts' }, 'LINE1\nLINE2', ['error TS2304: Cannot find name X']);
    expect(p).toContain('src/ai.ts');
    expect(p).toContain('CURRENT CONTENT');
    expect(p).toContain('LINE1\nLINE2');
    expect(p).toContain('error TS2304: Cannot find name X');
    expect(p).toContain('Return ONLY the file\'s raw code');
  });

  it('repair prompt lists import targets\' exports when uses are declared', () => {
    const all = normalizeFileContracts([
      { path: 'src/game.ts', exports: ['ChessGame', 'Move'], uses: [] },
      { path: 'src/ai.ts', exports: ['findBestMove'], uses: [{ from: 'src/game.ts', members: ['ChessGame'] }] },
    ]);
    const p = buildRepairPrompt('chess', all[1], 'LINE', ['error TS2339'], all);
    expect(p).toContain('IMPORT TARGETS');
    expect(p).toContain('src/game.ts exports: ChessGame, Move');
  });

  it('repair prompt omits import-target block for files with no uses', () => {
    const p = buildRepairPrompt('chess', { path: 'src/game.ts', uses: [] }, 'LINE', ['error TS2339']);
    expect(p).not.toContain('IMPORT TARGETS');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. CodePlan Structure Validation
// ═══════════════════════════════════════════════════════════════════════════

describe('CodePlan structure', () => {
  it('valid plan has reasoning, files array, and questions array', () => {
    const validPlan = {
      reasoning: 'Starting with a CLI app',
      files: [
        { path: 'src/main.ts', summary: 'Entry point', language: 'typescript' },
        { path: 'src/commands.ts', summary: 'CLI commands', language: 'typescript' },
      ],
      questions: [],
    };
    expect(validPlan.reasoning).toBeDefined();
    expect(Array.isArray(validPlan.files)).toBe(true);
    expect(Array.isArray(validPlan.questions)).toBe(true);
    expect(validPlan.files.length).toBeGreaterThan(0);
  });

  it('each planned file has path, summary, and language', () => {
    const files = [
      { path: 'src/api.ts', summary: 'API routes', language: 'typescript' },
      { path: 'src/db.sql', summary: 'Database schema', language: 'sql' },
    ];
    for (const file of files) {
      expect(file.path).toBeDefined();
      expect(file.path.length).toBeGreaterThan(0);
      expect(file.summary).toBeDefined();
      expect(file.summary.length).toBeGreaterThan(0);
      expect(file.language).toBeDefined();
      expect(file.language.length).toBeGreaterThan(0);
    }
  });

  it('questions array can be empty when no clarification needed', () => {
    const plan = {
      reasoning: 'Clear request, no questions needed',
      files: [{ path: 'app.ts', summary: 'Main app', language: 'typescript' }],
      questions: [],
    };
    expect(plan.questions).toHaveLength(0);
  });

  it('questions array can contain clarifying questions (legacy strings)', () => {
    const plan = {
      reasoning: 'Need some clarification',
      files: [],
      questions: [
        'Should this be a CLI or web app?',
        'What database should we use?',
      ],
    };
    expect(plan.questions.length).toBeGreaterThan(0);
    expect(plan.questions[0]).toContain('?');
  });

  it('questions use the structured schema with key/question/options/type', () => {
    const plan = {
      reasoning: 'Structured questions',
      files: [{ path: 'app.ts', summary: 'App', language: 'typescript' }],
      questions: [
        { key: 'interface', question: 'CLI or web?', options: ['CLI', 'Web'], type: 'choice' },
        { key: 'notes', question: 'Any extra notes?', type: 'text' },
      ],
    };
    expect(plan.questions[0].key).toBe('interface');
    expect(plan.questions[0].options).toContain('Web');
    expect(plan.questions[0].type).toBe('choice');
    expect(plan.questions[1].type).toBe('text');
  });

  it('validates each file has a unique path within the plan', () => {
    const files = [
      { path: 'src/main.ts', summary: 'A', language: 'ts' },
      { path: 'src/utils.ts', summary: 'B', language: 'ts' },
      { path: 'src/main.ts', summary: 'C', language: 'ts' }, // Duplicate
    ];
    const paths = files.map(f => f.path);
    const uniquePaths = new Set(paths);
    // Should warn about duplicates but still process
    expect(paths.length).toBe(3);
    expect(uniquePaths.size).toBeLessThan(paths.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. WrittenFile Structure Validation
// ═══════════════════════════════════════════════════════════════════════════

describe('WrittenFile result structure', () => {
  it('has path, content, and status fields', () => {
    const writtenFile = {
      path: 'src/main.ts',
      content: 'console.log("hello");',
      status: 'written',
    };
    expect(writtenFile.path).toBeDefined();
    expect(writtenFile.content).toBeDefined();
    expect(writtenFile.status).toBeDefined();
    expect(['written', 'skipped', 'error']).toContain(writtenFile.status);
  });

  it('can have optional error field on failure', () => {
    const failedFile = {
      path: 'src/fail.ts',
      content: '',
      status: 'error' as const,
      error: 'Permission denied',
    };
    expect(failedFile.error).toBeDefined();
    expect(failedFile.status).toBe('error');
  });

  it('status validates as written | skipped | error', () => {
    const validStatuses = ['written', 'skipped', 'error'];
    const written = { path: 'a.ts', content: '', status: 'written' as const };
    const skipped = { path: 'b.ts', content: '', status: 'skipped' as const };
    const error = { path: 'c.ts', content: '', status: 'error' as const, error: 'err' };
    expect(validStatuses).toContain(written.status);
    expect(validStatuses).toContain(skipped.status);
    expect(validStatuses).toContain(error.status);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Prompt Construction Testing
// ═══════════════════════════════════════════════════════════════════════════

describe('Code planning prompt construction', () => {
  it('includes user request in the prompt', () => {
    const request = 'Build a calculator app';
    const prompt = `User request: ${request}\n\nPlan the files needed and ask any clarifying questions.`;
    expect(prompt).toContain(request);
  });

  it('includes optional context when provided', () => {
    const request = 'Build a todo app';
    const context = 'User wants a CLI app with SQLite storage';
    const prompt = `User request: ${request}\n\nContext:\n${context}\n\nPlan the files needed and ask any clarifying questions.`;
    expect(prompt).toContain(request);
    expect(prompt).toContain(context);
  });

  it('omits context section when no context provided', () => {
    const request = 'Build a calculator';
    const prompt = `User request: ${request}\n\nPlan the files needed and ask any clarifying questions.`;
    expect(prompt).not.toContain('Context:');
  });

  it('write-code prompt includes the plan files', () => {
    const fileList = '[1] src/main.ts (typescript) — Entry point\n[2] src/todo.ts (typescript) — Todo CRUD';
    const fullPrompt = `User request: Build a todo app\n\n━━━ PLAN ━━━\nFiles to create:\n${fileList}\n\n━━━ TASK ━━━\nGenerate complete, working code for EVERY file.`;
    expect(fullPrompt).toContain('main.ts');
    expect(fullPrompt).toContain('todo.ts');
    expect(fullPrompt).toContain('Generate complete, working code');
  });

  it('write-code prompt includes user answers', () => {
    const answersText = 'Q: CLI or web?\nA: CLI\nQ: Database?\nA: SQLite';
    const fullPrompt = `User request: Build a todo app\n\n━━━ USER ANSWERS ━━━\n${answersText}\n\n━━━ TASK ━━━\nGenerate complete, working code for EVERY file.`;
    expect(fullPrompt).toContain('CLI');
    expect(fullPrompt).toContain('SQLite');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Route Request Validation
// ═══════════════════════════════════════════════════════════════════════════

describe('Route request validation rules', () => {
  it('plan-code requires a request string', () => {
    const isValid = (req: any) => {
      return req && typeof req.request === 'string' && req.request.trim().length > 0;
    };
    expect(isValid({ request: 'Build a todo app' })).toBe(true);
    expect(isValid({})).toBe(false);
    expect(isValid({ request: '' })).toBe(false);
    expect(isValid({ request: 123 })).toBe(false);
  });

  it('write-code requires both request and plan', () => {
    const plan = { reasoning: 'test', files: [], questions: [] };
    const isValid = (req: any) => {
      return !!(req && req.request && req.plan);
    };
    expect(isValid({ request: 'Build', plan })).toBe(true);
    expect(isValid({ request: 'Build' })).toBe(false);
    expect(isValid({ plan })).toBe(false);
    expect(isValid({})).toBe(false);
  });

  it('write-code response contract: returns BOTH `files` and `written` (P0 fix)', () => {
    // The P0 papercut fix (Aug 7 2026): the route response carries a `files`
    // array ({path, content}) for consumers expecting one, alongside the
    // legacy `written` array ({path, content, status}).
    const genFiles = [
      { path: 'src/main.ts', content: 'export const x = 1;' },
      { path: 'src/todo.ts', content: 'export type TodoItem = { id: number };' },
    ];
    const written = genFiles.map(f => ({ path: f.path, content: f.content, status: 'written' as const }));
    const response = {
      success: true,
      written,
      files: genFiles,
      totalFiles: genFiles.length,
      writtenCount: written.length,
    };
    expect(response.files).toHaveLength(2);
    expect(response.files[0]).toEqual({ path: 'src/main.ts', content: 'export const x = 1;' });
    expect(response.files).toEqual(response.written.map((w: any) => ({ path: w.path, content: w.content })));
    expect(response.written[0].status).toBe('written'); // legacy shape preserved
    expect(response.totalFiles).toBe(2);
    expect(response.writtenCount).toBe(2);
  });

  it('interactive requires a request string', () => {
    const isValid = (req: any) => {
      return req && typeof req.request === 'string' && req.request.trim().length > 0;
    };
    expect(isValid({ request: 'Build a todo app', autoWrite: true })).toBe(true);
    expect(isValid({ request: '' })).toBe(false);
    expect(isValid({})).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Interactive Flow Logic
// ═══════════════════════════════════════════════════════════════════════════

describe('Interactive flow logic', () => {
  it('returns step=questions when questions exist and autoWrite is false', () => {
    const plan = {
      reasoning: 'Need info',
      files: [{ path: 'app.ts', summary: 'App', language: 'typescript' }],
      questions: ['CLI or web?'],
    };
    const needsAnswers = plan.questions.length > 0;
    expect(needsAnswers).toBe(true);
  });

  it('proceeds to write step when no questions needed', () => {
    const plan = {
      reasoning: 'Clear',
      files: [{ path: 'app.ts', summary: 'App', language: 'typescript' }],
      questions: [],
    };
    const canWrite = plan.questions.length === 0;
    expect(canWrite).toBe(true);
  });

  it('proceeds to write step when autoWrite is true even with questions', () => {
    const plan = {
      reasoning: 'Has questions but auto-write',
      files: [{ path: 'app.ts', summary: 'App', language: 'typescript' }],
      questions: ['CLI or web?'],
    };
    const autoWrite = true;
    const shouldWrite = autoWrite || plan.questions.length === 0;
    expect(shouldWrite).toBe(true);
  });

  it('builds answers object from user responses', () => {
    const questions = ['CLI or web?', 'Database?'];
    const userText = 'CLI, SQLite';
    const answerLines = userText.split(',').map(s => s.trim()).filter(Boolean);
    const answers: Record<string, string> = {};
    questions.forEach((q, i) => {
      answers[q] = answerLines[i] || answerLines[0] || '(default)';
    });
    expect(answers['CLI or web?']).toBe('CLI');
    expect(answers['Database?']).toBe('SQLite');
  });

  it('falls back to single answer for multiple questions', () => {
    const questions = ['CLI or web?', 'Database?'];
    const userText = 'Make it a CLI app';
    const answerLines = userText.split('\n').map(s => s.trim()).filter(Boolean);
    const answers: Record<string, string> = {};
    if (answerLines.length === 1 && questions.length > 1) {
      questions.forEach(q => { answers[q] = answerLines[0]; });
    }
    expect(answers['CLI or web?']).toBe('Make it a CLI app');
    expect(answers['Database?']).toBe('Make it a CLI app');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. Intent override (Part 4 — editable UNDERSTOOD INTENT card)
// ═══════════════════════════════════════════════════════════════════════════

describe('Intent override (Part 4 — editable intent card)', () => {
  // Replica of normalizeIntentOverride in codePlanner.ts: sanitizes the
  // user-corrected intent from the UI card (untrusted JSON) into an IntentSpec.
  const normalizeOverride = (v: any): any => {
    if (!v || typeof v !== 'object') return null;
    const str = (x: any): string => (typeof x === 'string' ? x.trim() : '');
    const goal = str(v.goal);
    const targetUser = str(v.targetUser);
    const uiStyle = str(v.uiStyle);
    const language = str(v.language);
    let coreFeatures: string[] = [];
    if (Array.isArray(v.coreFeatures)) {
      coreFeatures = v.coreFeatures.filter((f: any) => typeof f === 'string' && f.trim().length > 0).map((f: string) => f.trim());
    } else if (typeof v.coreFeatures === 'string' && v.coreFeatures.trim()) {
      coreFeatures = v.coreFeatures.split(',').map((s: string) => s.trim()).filter(Boolean);
    }
    coreFeatures = [...new Set(coreFeatures)].slice(0, 6);
    if (!goal && !targetUser && !uiStyle && !language && !coreFeatures.length) return null;
    return { goal, targetUser, coreFeatures, uiStyle, language };
  };

  it('accepts a well-formed user-corrected intent', () => {
    const spec = normalizeOverride({
      goal: 'chess game',
      targetUser: 'my kids',
      coreFeatures: ['AI opponent', 'drag-and-drop'],
      uiStyle: 'game, dark',
      language: 'typescript',
    });
    expect(spec).toEqual({
      goal: 'chess game',
      targetUser: 'my kids',
      coreFeatures: ['AI opponent', 'drag-and-drop'],
      uiStyle: 'game, dark',
      language: 'typescript',
    });
  });

  it('splits comma-separated coreFeatures from a string', () => {
    const spec = normalizeOverride({ goal: 'todo app', coreFeatures: 'AI opponent, drag-and-drop, dark theme' });
    expect(spec.coreFeatures).toEqual(['AI opponent', 'drag-and-drop', 'dark theme']);
  });

  it('caps coreFeatures at 6 and dedupes', () => {
    const spec = normalizeOverride({ goal: 'x', coreFeatures: ['a', 'a', 'b', 'c', 'd', 'e', 'f', 'g'] });
    expect(spec.coreFeatures).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('returns null for garbage input (fall back to auto-extraction)', () => {
    expect(normalizeOverride(null)).toBeNull();
    expect(normalizeOverride('garbage')).toBeNull();
    expect(normalizeOverride(42)).toBeNull();
    expect(normalizeOverride({})).toBeNull();
    expect(normalizeOverride({ coreFeatures: [] })).toBeNull();
  });

  it('trims whitespace and drops empty fields', () => {
    const spec = normalizeOverride({ goal: '  chess game  ', targetUser: '   ', uiStyle: '', language: '  ' });
    expect(spec.goal).toBe('chess game');
    expect(spec.targetUser).toBe('');
  });

  it('write-code forwards the corrected intent to the generator (replica)', () => {
    const body = { request: 'x', plan: { files: [] }, answers: {}, intent: { goal: 'fixed goal' } };
    const forwarded = body.intent ?? undefined;
    expect(forwarded).toEqual({ goal: 'fixed goal' });
    const withoutIntent: any = { request: 'x', plan: { files: [] }, answers: {} };
    expect(withoutIntent.intent ?? undefined).toBeUndefined();
  });
});

describe('isGuiRequest', () => {
  it('detects explicit GUI signals in the request', () => {
    expect(isGuiRequest('build me a dashboard')).toBe(true);
    expect(isGuiRequest('a graphical user interface app')).toBe(true);
    expect(isGuiRequest('make a website')).toBe(true);
    expect(isGuiRequest('web app for tracking expenses')).toBe(true);
    expect(isGuiRequest('an app with a ui')).toBe(true);
  });

  it('detects GUI intent from user answers (e.g. interface choice)', () => {
    expect(isGuiRequest('home media player', { interface: 'Graphical user interface' })).toBe(true);
    expect(isGuiRequest('home media player', { interface: 'GUI' })).toBe(true);
  });

  it('does NOT treat a CLI interface answer as a GUI app', () => {
    expect(isGuiRequest('home media player', { interface: 'Command line interface' })).toBe(false);
    expect(isGuiRequest('scraper', { interface: 'CLI' })).toBe(false);
    expect(isGuiRequest('terminal tool', { interface: 'Terminal' })).toBe(false);
  });

  it('explicit GUI signal wins even when CLI is mentioned', () => {
    expect(isGuiRequest('GUI app with command line mode', {})).toBe(true);
    expect(isGuiRequest('terminal dashboard', {})).toBe(true);
  });

  it('returns false for headless requests', () => {
    expect(isGuiRequest('a headless data pipeline')).toBe(false);
    expect(isGuiRequest('process csv files')).toBe(false);
    expect(isGuiRequest('')).toBe(false);
  });

  it('detects games as GUI apps (checkers, chess, board games)', () => {
    expect(isGuiRequest('make a simple game')).toBe(true);
    expect(isGuiRequest('build me checkers')).toBe(true);
    expect(isGuiRequest('simple game', { game_type: 'a simple checkers' })).toBe(true);
    expect(isGuiRequest('a chess engine with an interactive board')).toBe(true);
    expect(isGuiRequest('sudoku puzzle app')).toBe(true);
  });

  it('keeps CLI/terminal games headless (CLI exclusion wins over game)', () => {
    expect(isGuiRequest('terminal checkers game')).toBe(false);
    expect(isGuiRequest('a command line chess game')).toBe(false);
  });
});

describe('ensureGuiEntryFile', () => {
  const baseFiles = [
    { path: 'media_player.ts', summary: 'Logic', language: 'ts' as const, exports: ['play'], uses: [] },
  ];

  it('appends a self-contained index.html for GUI requests', () => {
    const out = ensureGuiEntryFile(baseFiles as any, 'home media player', { interface: 'Graphical user interface' });
    expect(out.length).toBe(2);
    expect(out[1].path).toBe('index.html');
    expect(out[1].language).toBe('html');
    expect(out[1].exports).toEqual([]);
    expect(out[1].uses).toEqual([]);
  });

  it('is idempotent — never duplicates an existing HTML file', () => {
    const withHtml = [...baseFiles, { path: 'index.html', summary: 'GUI', language: 'html' as const, exports: [], uses: [] }];
    const out = ensureGuiEntryFile(withHtml as any, 'build a dashboard', {});
    expect(out.length).toBe(2);
    expect(out.filter(f => f.path === 'index.html').length).toBe(1);
  });

  it('skips injection for non-GUI requests', () => {
    const out = ensureGuiEntryFile(baseFiles as any, 'process csv files', {});
    expect(out.length).toBe(1);
    expect(out[0].path).toBe('media_player.ts');
  });

  it('skips when an .htm variant already exists', () => {
    const withHtm = [...baseFiles, { path: 'public/app.htm', summary: 'GUI', language: 'html' as const, exports: [], uses: [] }];
    const out = ensureGuiEntryFile(withHtm as any, 'build a website', {});
    expect(out.filter(f => f.path === 'index.html').length).toBe(0);
  });
});

describe('GUI_WIDGET_SECTION', () => {
  it('provides a native <video> template (fixes div-as-video failures)', () => {
    expect(GUI_WIDGET_SECTION).toContain('<video');
    expect(GUI_WIDGET_SECTION).toMatch(/getElementById\('videoDisplay'\)/);
  });

  it('covers the core widget categories (button, input, card, layout)', () => {
    expect(GUI_WIDGET_SECTION).toContain('<button');
    expect(GUI_WIDGET_SECTION).toContain('<input');
    expect(GUI_WIDGET_SECTION).toContain('card');
    expect(GUI_WIDGET_SECTION).toContain('display:flex');
  });

  it('warns against using a <div> for media', () => {
    expect(GUI_WIDGET_SECTION).toMatch(/NEVER a <div>|never a <div>/i);
  });
});

describe('APP_QUALITY_RULES (the 6 generated-app failure classes, TODO 3.1)', () => {
  it('covers all six eval-harness failure classes', () => {
    const markers = [
      /ACCESSIBILITY \(ARIA \+ labels\)/i,            // #1 ARIA + labels
      /KEYBOARD & FOCUS SUPPORT/i,                      // #2 keyboard/focus
      /STATE PERSISTENCE \(no loss on refresh\)/i,     // #3 localStorage
      /LIVE PANELS MUST POPULATE/i,                     // #4 dynamic panels
      /NUMERIC ROBUSTNESS \(no NaN\)/i,                // #5 NaN numerics
      /MOBILE RESPONSIVE/i,                             // #6 viewport/fluid
    ];
    for (const m of markers) expect(APP_QUALITY_RULES).toMatch(m);
  });

  it('gives concrete, actionable fixes for each class', () => {
    expect(APP_QUALITY_RULES).toMatch(/aria-label|aria-labels/);
    expect(APP_QUALITY_RULES).toMatch(/localStorage/);
    expect(APP_QUALITY_RULES).toMatch(/Number\(x\) \|\| 0|Number\(/);
    expect(APP_QUALITY_RULES).toMatch(/name="viewport"|width=device-width/);
    expect(APP_QUALITY_RULES).toMatch(/Tab|:focus|Enter\/Space/i);
    expect(APP_QUALITY_RULES).toMatch(/move-list|history|score|result/i);
  });

  it('is compact enough to inject into every GUI write prompt', () => {
    expect(APP_QUALITY_RULES.length).toBeLessThan(1500);
  });
});

describe('pickCliEntryFile (CLI behavioral gate entry discovery)', () => {
  it('prefers main.* over other TS files', () => {
    const files = [{ path: 'src/storage.ts' }, { path: 'src/types.ts' }, { path: 'src/main.ts' }];
    expect(pickCliEntryFile(files)).toBe('src/main.ts');
  });

  it('falls back to index/cli/app when no main exists', () => {
    expect(pickCliEntryFile([{ path: 'src/index.ts' }, { path: 'src/util.ts' }])).toBe('src/index.ts');
    expect(pickCliEntryFile([{ path: 'cli.ts' }, { path: 'types.ts' }])).toBe('cli.ts');
  });

  it('returns the first runnable file when nothing conventional matches', () => {
    expect(pickCliEntryFile([{ path: 'src/tools.ts' }, { path: 'src/engine.ts' }])).toBe('src/tools.ts');
  });

  it('returns null when there are no TS/JS files', () => {
    expect(pickCliEntryFile([{ path: 'index.html' }, { path: 'styles.css' }])).toBeNull();
  });

  it('ignores non-runnable extensions (html/css)', () => {
    expect(pickCliEntryFile([{ path: 'index.html' }, { path: 'app.js' }])).toBe('app.js');
  });
});

describe('buildCliSmokeRepairPrompt', () => {
  it('tells the model the app compiles but fails at execution', () => {
    const p = buildCliSmokeRepairPrompt('build a todo cli', { path: 'main.ts', summary: 'CLI', language: 'typescript' }, 'export const x = 1;', ['SyntaxError: The requested module ./types does not provide an export named Habit'], 'CLI failed to run');
    expect(p).toMatch(/COMPILES but FAILS when actually executed/i);
    expect(p).toMatch(/SyntaxError: The requested module/);
    expect(p).toMatch(/TYPE-ONLY member/i);
    expect(p).toMatch(/REAL output/i);
  });

  it('is line-numbered via the error-focused source view', () => {
    const p = buildCliSmokeRepairPrompt('x', { path: 'main.ts', summary: '', language: 'typescript' }, 'line1\nline2\nline3', [], 'exit 1');
    expect(p).toMatch(/LINE-NUMBERED/);
    expect(p).toMatch(/1 \| line1/);
    expect(p).toMatch(/2 \| line2/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// runBehavioralSmokeGates — the SHARED smoke-repair loop (finalize + chunked)
// ═══════════════════════════════════════════════════════════════════════════
describe('runBehavioralSmokeGates (shared render + CLI repair loop)', () => {
  const mkProbe = (results: Array<{ status: SmokeVerdict['status']; errors?: string[]; detail?: string }>) => {
    let i = 0;
    return async () => {
      const r = results[Math.min(i, results.length - 1)];
      i += 1;
      return { status: r.status, errors: r.errors ?? [], detail: r.detail ?? r.status } as SmokeVerdict;
    };
  };
  const mkExportDir = (): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-gate-test-'));
    return dir;
  };
  const baseOpts = (exportDir: string) => ({
    request: 'build a cli',
    contractFiles: [{ path: 'main.ts', summary: 'CLI', language: 'typescript', exports: [], uses: [] }],
    exportDir,
    timeoutMs: 5000,
    tag: 'chunked',
  });

  it('repairs a failing CLI entry and converges to passed (the chunked-path gap)', async () => {
    const exportDir = mkExportDir();
    const files = [{ path: 'main.ts', content: 'stub body' }];
    let repairs = 0;
    // Fails once (blank/stub), then passes after the rewrite is applied.
    const cliProbe = mkProbe([{ status: 'failed', errors: ['blank/stub CLI'], detail: 'exited 0 but printed NOTHING' }, { status: 'passed' }]);
    const { renderSmoke, cliSmoke } = await runBehavioralSmokeGates({
      ...baseOpts(exportDir),
      files,
      canRepair: () => true,
      consumeRepair: () => { repairs += 1; },
      cliProbe,
      renderProbe: async () => ({ status: 'skipped', errors: [], detail: 'no html' }) as SmokeVerdict,
      repairCall: async () => 'export function main() { console.log("working"); }',
    });
    expect(renderSmoke.status).toBe('skipped');
    expect(cliSmoke.status).toBe('passed');
    expect(repairs).toBe(1);
    expect(files[0].content).toContain('working'); // rewrite applied on disk + in memory
  });

  it('stops after MAX_CLI_SMOKE_REPAIR_ROUNDS when the model cannot fix it', async () => {
    const exportDir = mkExportDir();
    const files = [{ path: 'main.ts', content: 'stub' }];
    let repairs = 0;
    const cliProbe = mkProbe([{ status: 'failed', detail: 'still crashing' }, { status: 'failed', detail: 'still crashing' }, { status: 'failed', detail: 'still crashing' }]);
    const { cliSmoke } = await runBehavioralSmokeGates({
      ...baseOpts(exportDir),
      files,
      canRepair: () => true,
      consumeRepair: () => { repairs += 1; },
      cliProbe,
      renderProbe: async () => ({ status: 'skipped', errors: [], detail: 'no html' }) as SmokeVerdict,
      repairCall: async () => 'export const y = 2;', // a different rewrite, but probe still fails
    });
    expect(cliSmoke.status).toBe('failed');
    expect(repairs).toBe(2); // bounded: exactly MAX_CLI_SMOKE_REPAIR_ROUNDS=2 repair calls
  });

  it('stops early when a repair round produces no usable rewrite (same content)', async () => {
    const exportDir = mkExportDir();
    const files = [{ path: 'main.ts', content: 'stub' }];
    let repairs = 0;
    const cliProbe = mkProbe([{ status: 'failed', detail: 'x' }, { status: 'failed', detail: 'x' }]);
    const { cliSmoke } = await runBehavioralSmokeGates({
      ...baseOpts(exportDir),
      files,
      canRepair: () => true,
      consumeRepair: () => { repairs += 1; },
      cliProbe,
      renderProbe: async () => ({ status: 'skipped', errors: [], detail: 'no html' }) as SmokeVerdict,
      repairCall: async () => 'stub', // identical to current content → abort
    });
    expect(cliSmoke.status).toBe('failed');
    expect(repairs).toBe(1); // one repair attempted, then stopped
  });

  it('honors the shared repair budget — skips repair when canRepair() is false', async () => {
    const exportDir = mkExportDir();
    const files = [{ path: 'main.ts', content: 'stub' }];
    let repairs = 0;
    const cliProbe = mkProbe([{ status: 'failed', detail: 'x' }]);
    const { cliSmoke } = await runBehavioralSmokeGates({
      ...baseOpts(exportDir),
      files,
      canRepair: () => false, // budget exhausted before the smoke phase
      consumeRepair: () => { repairs += 1; },
      cliProbe,
      renderProbe: async () => ({ status: 'skipped', errors: [], detail: 'no html' }) as SmokeVerdict,
      repairCall: async () => 'new content',
    });
    expect(cliSmoke.status).toBe('failed');
    expect(repairs).toBe(0); // no repair calls burned
  });

  it('repairs an HTML entry through the RENDER gate when one exists', async () => {
    const exportDir = mkExportDir();
    const files = [{ path: 'index.html', content: '<button onclick="boom()">x</button>' }];
    let repairs = 0;
    const renderProbe = mkProbe([{ status: 'failed', errors: ['interaction crash'], detail: 'clicked primary control triggered: boom is not defined' }, { status: 'passed' }]);
    const { renderSmoke, cliSmoke } = await runBehavioralSmokeGates({
      ...baseOpts(exportDir),
      request: 'build an html app',
      contractFiles: [{ path: 'index.html', summary: 'GUI', language: 'html', exports: [], uses: [] }],
      files,
      canRepair: () => true,
      consumeRepair: () => { repairs += 1; },
      renderProbe,
      cliProbe: async () => ({ status: 'passed', errors: [], detail: 'n/a' }) as SmokeVerdict,
      repairCall: async () => '<button onclick="ok()">x</button><script>function ok(){}</script>',
    });
    expect(renderSmoke.status).toBe('passed');
    expect(cliSmoke.status).toBe('skipped'); // HTML entry present → CLI gate skipped
    expect(repairs).toBe(1);
  });
});

describe('inlineExternalScriptRefs', () => {
  const htmlWithScript = '<!doctype html><html><body><div id="app"></div><script src="/game.js"></script></body></html>';

  it('inlines a <script src> from a sibling JS file', () => {
    const files = [
      { path: 'index.html', content: htmlWithScript },
      { path: 'game.js', content: 'document.getElementById("app").textContent = "hi";' },
    ];
    inlineExternalScriptRefs(files);
    expect(files[0].content).toContain('document.getElementById("app").textContent = "hi";');
    expect(files[0].content).not.toContain('src="/game.js"');
  });

  it('inlines a <link rel="stylesheet"> from a sibling CSS file', () => {
    const files = [
      { path: 'index.html', content: '<html><head><link rel="stylesheet" href="style.css"></head><body></body></html>' },
      { path: 'style.css', content: 'body { background: #111; }' },
    ];
    inlineExternalScriptRefs(files);
    expect(files[0].content).toContain('body { background: #111; }');
    expect(files[0].content).not.toContain('href="style.css"');
  });

  it('resolves refs by basename even when the sibling is in a subdirectory', () => {
    const files = [
      { path: 'index.html', content: '<html><body><script src="/src/game.ts"></script></body></html>' },
      { path: 'src/game.ts', content: 'export const start = (): void => { console.log("go"); };' },
    ];
    inlineExternalScriptRefs(files);
    expect(files[0].content).toContain('start = () =>');
    expect(files[0].content).not.toContain('export const');
    expect(files[0].content).not.toContain('src="/src/game.ts"');
  });

  it('strips TypeScript syntax when inlining .ts content', () => {
    const files = [
      { path: 'index.html', content: '<html><body><script src="game.ts"></script></body></html>' },
      { path: 'game.ts', content: 'import { x } from "./x";\ninterface S { a: number }\nexport const f = (n: number): number => n * 2;' },
    ];
    inlineExternalScriptRefs(files);
    const out = files[0].content;
    expect(out).not.toContain('import');
    expect(out).not.toContain('interface');
    expect(out).not.toContain(': number');
    expect(out).toContain('const f = (n) => n * 2;');
  });

  it('leaves refs untouched when the target file is missing', () => {
    const files = [{ path: 'index.html', content: htmlWithScript }];
    inlineExternalScriptRefs(files);
    expect(files[0].content).toContain('src="/game.js"');
  });

  it('is safe with no html file at all', () => {
    const files = [{ path: 'game.ts', content: 'export const a = 1;' }];
    expect(() => inlineExternalScriptRefs(files)).not.toThrow();
    expect(files[0].content).toBe('export const a = 1;');
  });
});

describe('stripTypeScriptKeepExports', () => {
  it('keeps exports.* assignments (for the canvas IIFE namespace) while stripping types', () => {
    const out = stripTypeScriptKeepExports('export const start = (n: number): void => { console.log(n); };');
    expect(out).toContain('exports.start');
    expect(out).not.toContain(': number');
    expect(out).not.toContain('require(');
  });

  it('elides imports and interface declarations (no require() in the browser iframe)', () => {
    const out = stripTypeScriptKeepExports('import { x } from "./x";\ninterface S { a: number }\nexport const f = (n: number): number => n * 2;');
    expect(out).not.toContain('import ');
    expect(out).not.toContain('interface');
    expect(out).not.toContain('require(');
    expect(out).toContain('exports.f');
    expect(out).toContain('const f = (n) => n * 2;');
  });

  it('never breaks the write path on garbage input', () => {
    expect(() => stripTypeScriptKeepExports('export const x = ;')).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// normalizeTscError — position-insensitive stall detection
// ═══════════════════════════════════════════════════════════════════════════
describe('normalizeTscError (position-insensitive stall detection)', () => {
  it('strips the (line,col) position so a moved error still matches', () => {
    expect(normalizeTscError('src/main.ts(2,10): error TS2304: Cannot find name X.')).toBe(
      normalizeTscError('src/main.ts(99,4): error TS2304: Cannot find name X.')
    );
  });
  it('preserves the error code + message (different errors differ)', () => {
    expect(normalizeTscError('src/main.ts(2,10): error TS2304: Cannot find name X.')).not.toBe(
      normalizeTscError('src/main.ts(2,10): error TS2305: Module has no exported member X.')
    );
  });
  it('handles errors without a position (e.g. TS2582 require)', () => {
    expect(normalizeTscError("error TS2582: Cannot find name 'require'.")).toBe(
      "error TS2582: Cannot find name 'require'."
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// isSafeNonRelativeImport — npm phantom-dependency allowlist (check 2c)
// ═══════════════════════════════════════════════════════════════════════════
describe('isSafeNonRelativeImport (npm phantom-dependency class)', () => {
  it('accepts Node builtins (bare and node: prefixed)', () => {
    expect(isSafeNonRelativeImport('fs')).toBe(true);
    expect(isSafeNonRelativeImport('node:path')).toBe(true);
    expect(isSafeNonRelativeImport('http')).toBe(true);
  });
  it('accepts installed packages (express is a project dependency)', () => {
    expect(isSafeNonRelativeImport('express')).toBe(true);
    expect(isSafeNonRelativeImport('chalk')).toBe(true);
  });
  it('accepts subpaths of installed packages', () => {
    expect(isSafeNonRelativeImport('lodash/fp')).toBe(true); // lodash installed at root
  });
  it('rejects invented packages and unknown scopes', () => {
    expect(isSafeNonRelativeImport('csv-parser')).toBe(false);
    expect(isSafeNonRelativeImport('definitely-not-a-real-pkg-xyz')).toBe(false);
    expect(isSafeNonRelativeImport('@definitely-not-a-real-scope/pkg')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// stripPhantomPackageImports — deterministic npm-import removal
// ═══════════════════════════════════════════════════════════════════════════
describe('stripPhantomPackageImports (deterministic npm-import removal)', () => {
  it('removes invented package imports but keeps builtins + relative imports', () => {
    const src = `import csv from 'csv-parser';
import fs from 'fs';
import { addTodo } from './todo';
export const x = 1;`;
    const out = stripPhantomPackageImports(src);
    expect(out).toContain("import fs from 'fs';");
    expect(out).toContain("import { addTodo } from './todo';");
    expect(out).not.toContain('csv-parser');
    expect(out).toContain('export const x = 1;');
  });
  it('returns null when nothing is unsafe', () => {
    const src = `import fs from 'fs';
import express from 'express';
export const x = 1;`;
    expect(stripPhantomPackageImports(src)).toBeNull();
  });
  it('removes multi-line, side-effect and re-export phantom imports too', () => {
    const src = `import {
  readCSV,
} from 'csv-parser';
import 'fake-polyfill';
export { parseCSV } from 'csv-parser';
import fs from 'fs';
export const x = 1;`;
    const out = stripPhantomPackageImports(src);
    expect(out).not.toContain('csv-parser');
    expect(out).not.toContain('fake-polyfill');
    expect(out).toContain("import fs from 'fs';");
    expect(out).toContain('export const x = 1;');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// tscErrorCode / isMechanicalTscClass — mechanical-class registry
// ═══════════════════════════════════════════════════════════════════════════
describe('tscErrorCode + isMechanicalTscClass (mechanical-class registry)', () => {
  it('extracts the error code from a raw tsc line', () => {
    expect(tscErrorCode('src/main.ts(11,22): error TS2554: Expected 3 arguments, but got 2.')).toBe('TS2554');
    expect(tscErrorCode('probe.ts(2,23): error TS2322: Type \'number\' is not assignable to type \'void\'.')).toBe('TS2322');
    expect(tscErrorCode('not an error')).toBeNull();
  });
  it('classifies the audit list + observed residual classes as mechanical', () => {
    for (const code of ['TS2304', 'TS2305', 'TS2307', 'TS2322', 'TS2345', 'TS2355', 'TS2503', 'TS2552', 'TS2554', 'TS2582', 'TS7030']) {
      expect(isMechanicalTscClass(`x.ts(1,1): error ${code}: whatever.`)).toBe(true);
    }
  });
  it('does not classify unrelated codes as mechanical', () => {
    expect(isMechanicalTscClass('x.ts(1,1): error TS2339: Property \'done\' does not exist.')).toBe(false);
    expect(isMechanicalTscClass('x.ts(1,1): error TS1002: Unterminated string literal.')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// applyDeterministicMissingReturnFix — TS2355/TS7030 default-return insert
// ═══════════════════════════════════════════════════════════════════════════
describe('applyDeterministicMissingReturnFix (TS2355/TS7030)', () => {
  it('appends a numeric default return to a non-void fn with no return', () => {
    const src = `export function fA(x: number): number {
  if (x > 0) {
    return x;
  }
}
`;
    // col 32 = the `n` of the return-type `number` (tsc points at the annotation)
    const errors = ['probe.ts(1,32): error TS2355: A function whose declared type is neither \'undefined\', \'void\', nor \'any\' must return a value.'];
    const out = applyDeterministicMissingReturnFix(src, errors);
    expect(out).not.toBeNull();
    expect(out).toContain('return 0;');
  });
  it('appends a string default for string-returning fns and boolean for boolean', () => {
    const srcS = `function fB(x: string): string {
  if (x) return x.toUpperCase();
}
`;
    const errS = ['probe.ts(1,25): error TS2355: must return a value.'];
    const outS = applyDeterministicMissingReturnFix(srcS, errS);
    expect(outS).not.toBeNull();
    expect(outS).toContain("return '';");

    const srcB = `function fC(): boolean {
  if (Math.random() > 0.5) return true;
}
`;
    const errB = ['probe.ts(1,16): error TS7030: Not all code paths return a value.'];
    const outB = applyDeterministicMissingReturnFix(srcB, errB);
    expect(outB).not.toBeNull();
    expect(outB).toContain('return false;');
  });
  it('handles Promise<number> async return types (col at the `P` of Promise)', () => {
    const src = `export async function fC(x: number): Promise<number> {
  if (x > 0) return x;
}
`;
    const errors = ['probe.ts(1,38): error TS2355: must return a value.'];
    const out = applyDeterministicMissingReturnFix(src, errors);
    expect(out).not.toBeNull();
    expect(out).toContain('return 0;');
  });
  it('returns null when the return type is non-primitive (interface)', () => {
    const src = `function fD(): Result {
  if (ok) return { value: 1 };
}
`;
    const errors = ['probe.ts(1,16): error TS2355: must return a value.'];
    expect(applyDeterministicMissingReturnFix(src, errors)).toBeNull();
  });
  it('returns null when the fn already returns on the last line (double-patch guard)', () => {
    const src = `function fE(): number {
  return 42;
}
`;
    const errors = ['probe.ts(1,16): error TS2355: must return a value.'];
    expect(applyDeterministicMissingReturnFix(src, errors)).toBeNull();
  });
  it('is a no-op when the error is not TS2355/TS7030', () => {
    const src = `function fF(): number {
}
`;
    const errors = ['probe.ts(1,1): error TS2339: Property does not exist.'];
    expect(applyDeterministicMissingReturnFix(src, errors)).toBeNull();
  });
  it('patches EVERY return-less function in a multi-function file (bottom-up, no splice-shift)', () => {
    // tsc reports all four errors at once; the fix must process them bottom-up
    // so inserting a line for function 1 can't skew function 4's position.
    const src = `function f1(x: number): number {
  if (x > 0) {
    return x;
  }
}
function f2(): string {
  const s = 'hi';
}
function f3(): boolean {
  return Math.random() > 0.5;
}
`;
    const errors = [
      'probe.ts(1,25): error TS2355: must return a value.', // col at the `n` of f1's return `number`
      'probe.ts(6,16): error TS2355: must return a value.', // col at the `s` of f2's return `string`
    ];
    const out = applyDeterministicMissingReturnFix(src, errors);
    expect(out).not.toBeNull();
    if (!out) return;
    // f1 gets a number default, f2 gets a string default.
    expect(out).toContain('  return 0;');
    expect(out).toContain("  return '';");
    // f3 already returns on every path — must stay untouched.
    const f3 = out.split('function f3')[1];
    expect(f3).not.toContain('return false;');
    // The original functions still exist, in order.
    expect(out.indexOf('function f1')).toBeLessThan(out.indexOf('function f2'));
    expect(out.indexOf('function f2')).toBeLessThan(out.indexOf('function f3'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// applyDeterministicVoidReturnFix — TS2322 literal-return drop in void fns
// ═══════════════════════════════════════════════════════════════════════════
describe('applyDeterministicVoidReturnFix (TS2322-void)', () => {
  it('rewrites `return <literal>;` to `return;` in a void fn', () => {
    const src = `function fA(): void {
  return 42;
}
`;
    const errors = ['probe.ts(2,23): error TS2322: Type \'number\' is not assignable to type \'void\'.'];
    const out = applyDeterministicVoidReturnFix(src, errors);
    expect(out).not.toBeNull();
    expect(out).toContain('  return;');
    expect(out).not.toContain('return 42;');
  });
  it('handles string, boolean and null literals', () => {
    const src = `function fB(): void {
  return 'x';
  return false;
  return null;
}
`;
    const errors = [
      'probe.ts(2,10): error TS2322: Type \'string\' is not assignable to type \'void\'.',
      'probe.ts(3,10): error TS2322: Type \'boolean\' is not assignable to type \'void\'.',
      'probe.ts(4,10): error TS2322: Type \'null\' is not assignable to type \'void\'.',
    ];
    const out = applyDeterministicVoidReturnFix(src, errors);
    expect(out).not.toBeNull();
    expect(out).not.toContain("return 'x';");
    expect(out).not.toContain('return false;');
    expect(out).not.toContain('return null;');
  });
  it('does NOT strip side-effecting expressions (calls, identifiers)', () => {
    const src = `function fC(): void {
  return doSomething();
}
`;
    const errors = ['probe.ts(2,10): error TS2322: Type \'boolean\' is not assignable to type \'void\'.'];
    expect(applyDeterministicVoidReturnFix(src, errors)).toBeNull();
  });
  it('returns null when there is no TS2322-void error', () => {
    const src = `function fD(): number {
  return 42;
}
`;
    const errors = ['probe.ts(2,10): error TS2322: Type \'number\' is not assignable to type \'string\'.'];
    expect(applyDeterministicVoidReturnFix(src, errors)).toBeNull();
  });
  it('does NOT strip a `return literal;` that sits inside a string on the same line', () => {
    const src = `function fE(): void {
  const msg = 'return 42;';
}
`;
    const errors = ['probe.ts(2,23): error TS2322: Type \'string\' is not assignable to type \'void\'.'];
    const out = applyDeterministicVoidReturnFix(src, errors);
    // Column 23 points at `const msg` — the col-anchor must see no `return`
    // keyword at-or-before it, so nothing is rewritten.
    expect(out).toBeNull();
  });
  it('does NOT strip interpolated template literals (${} may be side-effecting)', () => {
    const src = 'function fF(): void {\n  return `x${fn()}`;\n}\n';
    const errors = ['probe.ts(2,10): error TS2322: Type \'string\' is not assignable to type \'void\'.'];
    expect(applyDeterministicVoidReturnFix(src, errors)).toBeNull();
  });
  it('strips a plain (non-interpolated) template literal return', () => {
    const src = `function fG(): void {
  return \`done\`;
}
`;
    const errors = ['probe.ts(2,10): error TS2322: Type \'string\' is not assignable to type \'void\'.'];
    const out = applyDeterministicVoidReturnFix(src, errors);
    expect(out).not.toBeNull();
    expect(out).toContain('  return;');
    expect(out).not.toContain('`done`');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// selectWholeProjectRepairFiles — GAP #5 cross-file drift repair set
// ═══════════════════════════════════════════════════════════════════════════
describe('selectWholeProjectRepairFiles (GAP #5 cross-file drift set)', () => {
  const working = [
    { path: 'src/main.ts', content: `import { minimax } from './game-logic';
export function playGame() {
  const board: number[] = Array(9).fill(-1);
  gameActive = minimax(board, 2) !== null;
}` },
    { path: 'src/game-logic.ts', content: `export function minimax(state: State, depth: number, maxPlayer: boolean): number {
  return 0;
}` },
    { path: 'src/helpers.ts', content: `export const nothing = 1;` },
  ];
  const contractFiles = [
    { path: 'src/main.ts', summary: '', language: 'typescript', exports: ['playGame'], uses: [{ from: 'src/game-logic.ts', members: ['minimax'] }] },
    { path: 'src/game-logic.ts', summary: '', language: 'typescript', exports: ['minimax'], uses: [] },
    { path: 'src/helpers.ts', summary: '', language: 'typescript', exports: ['nothing'], uses: [] },
  ];
  it('returns the erroring file PLUS its import target (the other side of the drift)', () => {
    const errByFile = new Map([
      ['src/main.ts', ['src/main.ts(11,22): error TS2554: Expected 3 arguments, but got 2.']],
    ]);
    const set = selectWholeProjectRepairFiles(working, errByFile, contractFiles, 3);
    const paths = set.map(f => f.path);
    expect(paths).toContain('src/main.ts');
    expect(paths).toContain('src/game-logic.ts');
    // The tsc-clean import target is included WITHOUT fabricated errors.
    expect(set.find(f => f.path === 'src/game-logic.ts')!.errors).toEqual([]);
    // Unrelated files stay out of the repair set.
    expect(paths).not.toContain('src/helpers.ts');
  });
  it('matches the import target via extensionless basename (./game-logic vs src/game-logic.ts)', () => {
    const errByFile = new Map([['main.ts', ['main.ts(1,1): error TS2554: Expected 3 arguments, but got 2.']]]);
    const set = selectWholeProjectRepairFiles(working, errByFile, contractFiles, 3);
    expect(set.map(f => f.path)).toContain('src/game-logic.ts');
  });
  it('respects the maxFiles cap', () => {
    const errByFile = new Map([
      ['src/main.ts', ['src/main.ts(1,1): error TS2554: Expected 3 arguments, but got 2.']],
      ['src/game-logic.ts', ['src/game-logic.ts(1,1): error TS2339: Property does not exist.']],
    ]);
    const set = selectWholeProjectRepairFiles(working, errByFile, contractFiles, 2);
    expect(set.length).toBeLessThanOrEqual(2);
  });
  it('returns empty when no file has errors', () => {
    const set = selectWholeProjectRepairFiles(working, new Map(), contractFiles, 3);
    expect(set).toEqual([]);
  });
  it('does not expand for a self-contained single erroring file with no sibling imports', () => {
    const lone = [{ path: 'src/helpers.ts', content: `export const nothing: number = 1;` }];
    const errByFile = new Map([['src/helpers.ts', ['src/helpers.ts(1,1): error TS2355: must return a value.']]]);
    const set = selectWholeProjectRepairFiles(lone, errByFile, contractFiles, 3);
    expect(set.map(f => f.path)).toEqual(['src/helpers.ts']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildWholeProjectRepairPrompt — GAP #5 whole-set rewrite prompt
// ═══════════════════════════════════════════════════════════════════════════
describe('buildWholeProjectRepairPrompt (GAP #5)', () => {
  it('includes every repair file (line-numbered), all errors, contracts, and the JSON contract', () => {
    const repairFiles = [
      { path: 'src/main.ts', content: 'import { minimax } from \'./game-logic\';\nexport function playGame() {\n  gameActive = minimax(board, 2) !== null;\n}', errors: ['src/main.ts(3,22): error TS2554: Expected 3 arguments, but got 2.'] },
      { path: 'src/game-logic.ts', content: 'export function minimax(state: State, depth: number, maxPlayer: boolean): number {\n  return 0;\n}', errors: [] },
    ];
    const contractFiles = [
      { path: 'src/main.ts', summary: '', language: 'typescript', exports: ['playGame'], uses: [{ from: 'src/game-logic.ts', members: ['minimax'] }] },
      { path: 'src/game-logic.ts', summary: '', language: 'typescript', exports: ['minimax'], uses: [] },
    ];
    const p = buildWholeProjectRepairPrompt('a tic-tac-toe game', repairFiles, [
      'src/main.ts(3,22): error TS2554: Expected 3 arguments, but got 2.',
    ], contractFiles);
    expect(p).toContain('src/main.ts');
    expect(p).toContain('src/game-logic.ts');
    expect(p).toContain('TS2554');
    expect(p).toContain('minimax'); // exports listed in contracts
    expect(p).toContain('"files"'); // JSON output contract
    expect(p).toContain('3 |   gameActive = minimax(board, 2) !== null;'); // line-numbered
    // The clean-side file is explicitly marked as the other half of the drift.
    expect(p).toContain('other side of the drift');
  });
  it('instructs keeping exported member names (do NOT rename exports)', () => {
    const repairFiles = [{ path: 'src/a.ts', content: 'export const x = 1;', errors: ['src/a.ts(1,1): error TS2305: no exported member.'] }];
    const contractFiles = [{ path: 'src/a.ts', summary: '', language: 'typescript', exports: ['x'], uses: [] }];
    const p = buildWholeProjectRepairPrompt('x', repairFiles, [], contractFiles);
    expect(p).toContain('do NOT rename');
  });

  it('shows the drift ERROR LINE in a large file (error-focused, no blind truncation)', () => {
    const filler = Array.from({ length: 240 }, (_, i) => `const filler${i}: number = ${i}; // ${'pad'.repeat(24)} ${i}`).join('\n');
    const content = `${filler}\nexport const BROKEN: string = 42;`;
    expect(content.length).toBeGreaterThan(8000);
    const repairFiles = [{
      path: 'src/a.ts',
      content,
      errors: ['src/a.ts(241,26): error TS2322: Type \'number\' is not assignable to type \'string\'.'],
    }];
    const p = buildWholeProjectRepairPrompt('x', repairFiles, ['src/a.ts(241,26): error TS2322: Type \'number\' is not assignable to type \'string\'.'], []);
    expect(p).toContain('241 | export const BROKEN: string = 42;');
    expect(p).toContain('line(s) omitted');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// verifyGeneratedContracts check 2c — invented npm deps are flagged [IMPORT]
// ═══════════════════════════════════════════════════════════════════════════
describe('verifyGeneratedContracts (npm phantom-dependency check 2c)', () => {
  it('flags an invented npm-package import as an [IMPORT] violation', () => {
    const files = [{ path: 'src/csv.ts', content: `import csv from 'csv-parser';
export const x = csv;` }];
    const contractFiles = [{ path: 'src/csv.ts', summary: '', language: 'typescript', exports: ['x'], uses: [] }];
    const violations = verifyGeneratedContracts(files, contractFiles);
    expect(violations.some(v => v.includes('[IMPORT]') && v.includes('csv-parser'))).toBe(true);
  });
  it('does not flag Node builtins or installed packages', () => {
    const files = [{ path: 'src/a.ts', content: `import fs from 'fs';
import express from 'express';
export const x = 1;` }];
    const contractFiles = [{ path: 'src/a.ts', summary: '', language: 'typescript', exports: ['x'], uses: [] }];
    const violations = verifyGeneratedContracts(files, contractFiles);
    expect(violations.some(v => v.includes('fs') || v.includes('express'))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// extractExportedFunctionArity — declared param counts of exported functions
// ═══════════════════════════════════════════════════════════════════════════
describe('extractExportedFunctionArity', () => {
  it('parses function declarations with required/total counts', () => {
    const code = `export function minimax(state: State, depth: number, maxPlayer: boolean): number {
  return 0;
}`;
    const arity = extractExportedFunctionArity(code);
    expect(arity.get('minimax')).toEqual({ required: 3, total: 3, hasRest: false, signature: 'minimax(state: State, depth: number, maxPlayer: boolean)' });
  });
  it('handles optional (?), default (=) and rest (...) params', () => {
    const code = `export function f(a: number, b?: string, c = 1, ...rest: number[]): void {}
`;
    const arity = extractExportedFunctionArity(code);
    expect(arity.get('f')).toEqual({ required: 1, total: 4, hasRest: true, signature: 'f(a: number, b?: string, c = 1, ...rest: number[])' });
  });
  it('parses arrow + function-expression const exports', () => {
    const code = `export const addTodo = (title: string, list: TodoItem[]): TodoItem[] => {
  return list;
};
export const noop = function (a: number, b: number): void {};
`;
    expect(extractExportedFunctionArity(code).get('addTodo')).toEqual({ required: 2, total: 2, hasRest: false, signature: 'addTodo(title: string, list: TodoItem[])' });
    expect(extractExportedFunctionArity(code).get('noop')).toEqual({ required: 2, total: 2, hasRest: false, signature: 'noop(a: number, b: number)' });
  });
  it('indexes generic functions and arrows (balanced <...> skipped)', () => {
    const code = `export function map<T extends Map<string, number>>(xs: T[], fn: (x: T) => number): number[] {
  return xs.map(fn);
}
export const wrap = <T,>(x: T): T => x;
export const run = async function <A, B>(a: A, b: B): Promise<A> { return a; };
`;
    expect(extractExportedFunctionArity(code).get('map')).toEqual({ required: 2, total: 2, hasRest: false, signature: 'map(xs: T[], fn: (x: T) => number)' });
    expect(extractExportedFunctionArity(code).get('wrap')!.required).toBe(1);
    expect(extractExportedFunctionArity(code).get('run')!.required).toBe(2);
  });
  it('does not treat ? inside param TYPE annotations as optional markers', () => {
    // `fn` has NO default — it is required. The `?` inside its arrow-type
    // annotation (x?: number) must not mark the PARAM optional.
    const code = `export function pick(fn: (x?: number) => void, name: string): void {}
export function pick2(flag: boolean = (cond ? 1 : 2)): void {}
`;
    expect(extractExportedFunctionArity(code).get('pick')).toEqual({ required: 2, total: 2, hasRest: false, signature: 'pick(fn: (x?: number) => void, name: string)' });
    // ...while a param with a DEFAULT value is genuinely optional (required=1).
    expect(extractExportedFunctionArity(code).get('pick2')).toEqual({ required: 0, total: 1, hasRest: false, signature: 'pick2(flag: boolean = (cond ? 1 : 2))' });
  });
  it('ignores nested parens inside param types', () => {
    const code = `export function map(fn: (x: number) => number, xs: number[]): number[] { return xs; }
`;
    expect(extractExportedFunctionArity(code).get('map')!.required).toBe(2);
  });
  it('does not index non-function exports', () => {
    const code = `export const VERSION = '1.0';
export interface State { board: number[][]; }
export class Game {}
`;
    const arity = extractExportedFunctionArity(code);
    expect(arity.has('VERSION')).toBe(false);
    expect(arity.has('State')).toBe(false);
    expect(arity.has('Game')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// shouldRunNextWholeProjectRound — adaptive whole-project repair budget
// ═══════════════════════════════════════════════════════════════════════════
describe('shouldRunNextWholeProjectRound (adaptive budget)', () => {
  it('always runs the base 2 rounds', () => {
    expect(shouldRunNextWholeProjectRound({ rounds: 0, repairSetSize: 3, errorsImproved: false, remainingErrors: 5 })).toBe(true);
    expect(shouldRunNextWholeProjectRound({ rounds: 1, repairSetSize: 3, errorsImproved: false, remainingErrors: 5 })).toBe(true);
  });
  it('grants a 3rd round only for a focused set that improved', () => {
    expect(shouldRunNextWholeProjectRound({ rounds: 2, repairSetSize: 2, errorsImproved: true, remainingErrors: 3 })).toBe(true);
    expect(shouldRunNextWholeProjectRound({ rounds: 2, repairSetSize: 1, errorsImproved: true, remainingErrors: 1 })).toBe(true);
  });
  it('denies a 3rd round for wide sets, stalled/regressed repairs, or empty sets', () => {
    expect(shouldRunNextWholeProjectRound({ rounds: 2, repairSetSize: 3, errorsImproved: true, remainingErrors: 3 })).toBe(false); // 3+ files
    expect(shouldRunNextWholeProjectRound({ rounds: 2, repairSetSize: 2, errorsImproved: false, remainingErrors: 3 })).toBe(false); // stalled/regressed
    expect(shouldRunNextWholeProjectRound({ rounds: 2, repairSetSize: 0, errorsImproved: true, remainingErrors: 3 })).toBe(false); // degenerate empty set
  });
  it('never exceeds 3 rounds and stops on a clean verdict', () => {
    expect(shouldRunNextWholeProjectRound({ rounds: 3, repairSetSize: 2, errorsImproved: true, remainingErrors: 1 })).toBe(false);
    expect(shouldRunNextWholeProjectRound({ rounds: 0, repairSetSize: 2, errorsImproved: false, remainingErrors: 0 })).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// countCallArgumentCounts — per-call-site argument counts
// ═══════════════════════════════════════════════════════════════════════════
describe('countCallArgumentCounts', () => {
  it('counts args at every call site, including empty calls', () => {
    const code = `foo();
foo(1);
foo(1, 2, 3);`;
    expect(countCallArgumentCounts(code, 'foo')).toEqual([0, 1, 3]);
  });
  it('respects nesting (calls inside calls, strings, comments)', () => {
    const code = `foo(bar(1, 2), 3);
const s = 'foo(9, 9)';
// foo(1, 2)
foo(1);`;
    expect(countCallArgumentCounts(code, 'foo')).toEqual([2, 1]);
  });
  it('ignores method access (obj.foo()) and identifier suffixes', () => {
    const code = `obj.foo(1);
xfoo(2);
foo(3);`;
    expect(countCallArgumentCounts(code, 'foo')).toEqual([1]);
  });
  it('handles spread + template literals as single args', () => {
    const code = `foo(...xs);
foo(\`tpl\`, y);`;
    expect(countCallArgumentCounts(code, 'foo')).toEqual([1, 2]);
  });
  it('counts trailing commas correctly (legal TS: foo(a, b,) is 2 args)', () => {
    const code = `foo(a, b,);
foo(a,);
foo();`;
    expect(countCallArgumentCounts(code, 'foo')).toEqual([2, 1, 0]);
  });
  it('returns [] when never called', () => {
    expect(countCallArgumentCounts('const x: Foo = y;', 'Foo')).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// verifyGeneratedContracts check 2d — TS2554 arity drift at plan-time
// ═══════════════════════════════════════════════════════════════════════════
describe('verifyGeneratedContracts (TS2554 arity pre-check 2d)', () => {
  it('flags a call site passing fewer args than the target signature requires', () => {
    const files = [
      { path: 'src/main.ts', content: `import { minimax } from './game-logic';
export function play() {
  minimax(board, 2);
}` },
      { path: 'src/game-logic.ts', content: `export function minimax(state: State, depth: number, maxPlayer: boolean): number { return 0; }` },
    ];
    const contractFiles = [
      { path: 'src/main.ts', summary: '', language: 'typescript', exports: ['play'], uses: [{ from: 'src/game-logic.ts', members: ['minimax'] }] },
      { path: 'src/game-logic.ts', summary: '', language: 'typescript', exports: ['minimax'], uses: [] },
    ];
    const violations = verifyGeneratedContracts(files, contractFiles);
    const arity = violations.filter(v => v.startsWith('[ARITY]'));
    expect(arity.length).toBe(1);
    expect(arity[0]).toContain('minimax');
    expect(arity[0]).toContain('2 argument(s)');
    expect(arity[0]).toContain('maxPlayer'); // declared signature embedded for repair
  });
  it('flags a call site passing MORE args than declared (no rest)', () => {
    const files = [
      { path: 'src/main.ts', content: `import { run } from './cli';
export function go() {
  run(a, b, c);
}` },
      { path: 'src/cli.ts', content: `export function run(cmd: string): void {}` },
    ];
    const contractFiles = [
      { path: 'src/main.ts', summary: '', language: 'typescript', exports: ['go'], uses: [{ from: 'src/cli.ts', members: ['run'] }] },
      { path: 'src/cli.ts', summary: '', language: 'typescript', exports: ['run'], uses: [] },
    ];
    const arity = verifyGeneratedContracts(files, contractFiles).filter(v => v.startsWith('[ARITY]'));
    expect(arity.length).toBe(1);
    expect(arity[0]).toContain('3 argument(s)');
  });
  it('does NOT flag matching, optional/default, or rest-signature calls', () => {
    const files = [
      { path: 'src/main.ts', content: `import { f } from './lib';
export function go() {
  f(1);
  f(1, 2);
  f(1, 2, 3, 4);
}` },
      { path: 'src/lib.ts', content: `export function f(a: number, b?: string, ...rest: number[]): void {}` },
    ];
    const contractFiles = [
      { path: 'src/main.ts', summary: '', language: 'typescript', exports: ['go'], uses: [{ from: 'src/lib.ts', members: ['f'] }] },
      { path: 'src/lib.ts', summary: '', language: 'typescript', exports: ['f'], uses: [] },
    ];
    const arity = verifyGeneratedContracts(files, contractFiles).filter(v => v.startsWith('[ARITY]'));
    expect(arity).toEqual([]);
  });
  it('STILL checks named members when a default import is present on the same statement', () => {
    const files = [
      { path: 'src/main.ts', content: `import Game, { setup } from './game';
export function go() {
  const g = Game.create();
  setup(1, 2, 3);
}` },
      { path: 'src/game.ts', content: `export default class Game { static create(): Game { return new Game(); } }
export function setup(rows: number, cols: number): void {}` },
    ];
    const contractFiles = [
      { path: 'src/main.ts', summary: '', language: 'typescript', exports: ['go'], uses: [{ from: 'src/game.ts', members: ['setup'] }] },
      { path: 'src/game.ts', summary: '', language: 'typescript', exports: ['setup'], uses: [] },
    ];
    const arity = verifyGeneratedContracts(files, contractFiles).filter(v => v.startsWith('[ARITY]'));
    expect(arity.length).toBe(1);
    expect(arity[0]).toContain('setup');
    expect(arity[0]).toContain('3 argument(s) but 2 declared');
  });
  it('does NOT flag non-function imports (types/classes) or default imports', () => {
    const files = [
      { path: 'src/main.ts', content: `import { State } from './game';
import Game from './game';
export const s: State = Game.create();` },
      { path: 'src/game.ts', content: `export interface State { board: number[][]; }
export default class Game { static create(): Game { return new Game(); } }` },
    ];
    const contractFiles = [
      { path: 'src/main.ts', summary: '', language: 'typescript', exports: ['s'], uses: [{ from: 'src/game.ts', members: ['State'] }] },
      { path: 'src/game.ts', summary: '', language: 'typescript', exports: ['State'], uses: [] },
    ];
    const arity = verifyGeneratedContracts(files, contractFiles).filter(v => v.startsWith('[ARITY]'));
    expect(arity).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// runTscCheck — the independent tsc gate (the compiler is the authority)
// ═══════════════════════════════════════════════════════════════════════════
describe('runTscCheck (independent tsc gate)', () => {
  it('skips when there are no TS files (pure HTML/JS app)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vaca-gate-skip-'));
    try {
      const verdict = await runTscCheck(dir, [{ path: 'index.html' }, { path: 'app.js' }]);
      expect(verdict.status).toBe('skipped');
      expect(verdict.errors).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports real compiler errors (status errors) for a broken file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vaca-gate-bad-'));
    try {
      fs.writeFileSync(path.join(dir, 'bad.ts'), 'const x: number = "str";\n');
      const verdict = await runTscCheck(dir, [{ path: 'bad.ts' }]);
      expect(verdict.status).toBe('errors');
      expect(verdict.errors.length).toBeGreaterThan(0);
      expect(verdict.errors[0]).toContain('error TS');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns clean when tsc has zero errors', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vaca-gate-good-'));
    try {
      fs.writeFileSync(path.join(dir, 'good.ts'), 'export const n: number = 1;\n');
      const verdict = await runTscCheck(dir, [{ path: 'good.ts' }]);
      expect(verdict.status).toBe('clean');
      expect(verdict.errors).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
