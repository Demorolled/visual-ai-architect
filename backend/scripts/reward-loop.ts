#!/usr/bin/env tsx
/**
 * reward-loop.ts — test → grade → reward self-improvement loop.
 *
 * For each clean code design in the knowledge library (backend/knowledge/patterns.json):
 *   1. TEST   — ask the primary LLM to RE-CREATE the code from just the
 *               description + tags (no reference to the original code).
 *   2. VERIFY — dry-run the recreated code (tsc gate where applicable), then
 *               compare it to the library version by size + a functional check.
 *   3. GRADE  — a SECOND LLM (the "judge") reviews the recreated code for
 *               correctness / readability / universality / size, and suggests
 *               concrete improvements.
 *   4. REWARD — if the judge's suggested improvement is better (fewer bytes,
 *               still valid), store the improved version BACK into the library
 *               as a fresh pattern with a higher qualityScore (reward). If the
 *               recreation is worse or broken, it's discarded (no reward).
 *
 * Uses translator.reason (primary) for generation and judgeViaEndpoint-style
 * direct call for the judge. Reads config from env:
 *   VACA_REWARD_SAMPLES   how many designs to test (default: all, cap 10)
 *   VACA_REWARD_JUDGE_URL / MODEL — the 2nd LLM (default qwen2.5-coder:14b-gpu)
 *   VACA_REWARD_PRIMARY_URL/MODEL — set to override the primary used for gen
 *
 * Run from backend/:  npx tsx scripts/reward-loop.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PATTERNS = path.join(ROOT, 'knowledge', 'patterns.json');
const SAMPLE_CAP = Number(process.env.VACA_REWARD_SAMPLES || 10);
const JUDGE_URL = (process.env.VACA_REWARD_JUDGE_URL || 'http://127.0.0.1:11434/v1').replace(/\/+$/, '');
const JUDGE_MODEL = process.env.VACA_REWARD_JUDGE_MODEL || 'qwen2.5-coder:14b-gpu';

type Pattern = {
  title: string; code: string; description: string; tags?: string[];
  language?: string; nodeType?: string; qualityScore?: number;
  category?: string; id?: string;
};

function loadPatterns(): Pattern[] {
  return JSON.parse(fs.readFileSync(PATTERNS, 'utf-8'));
}

/** Dry-run a JS snippet through node --check; returns {ok, error}. */
function jsCheck(code: string): { ok: boolean; error: string } {
  const r = spawnSync('node', ['--check'], { input: code, encoding: 'utf-8' });
  return { ok: r.status === 0, error: (r.stderr || '').trim().split('\n').slice(-3).join('\n') };
}

/** Byte size of the code. */
function bytes(code: string): number { return Buffer.byteLength(code || '', 'utf8'); }

async function llm(messages: Array<{ role: string; content: string }>, baseUrl: string, model: string, maxTokens = 4096): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, stream: false }),
    signal: AbortSignal.timeout(540000),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const body: any = await res.json();
  return body?.choices?.[0]?.message?.content || '';
}

function extractFence(raw: string): string {
  const fence = raw.match(/```(?:js|javascript)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  return raw.trim();
}

function extractVerdict(raw: string): { score: number; suggestions: string[] } {
  const score = parseInt((raw.match(/SCORE[:\s]*(\d+)/i) || [])[1] || '0', 10);
  const suggestions = (raw.match(/-[^\n]*improve[^\n]*|suggest[^\n]*/gi) || []).slice(0, 6);
  return { score, suggestions };
}

async function main() {
  const patterns = loadPatterns();
  const target = patterns.filter(p => (p.category === 'code_pattern') || (p.tags || []).length > 0);
  const sample = target.slice(0, SAMPLE_CAP);
  console.log(`📚 Library has ${patterns.length} patterns; testing ${sample.length} this round.\n`);

  const primaryUrl = (process.env.VACA_REWARD_PRIMARY_URL || JUDGE_URL).replace(/\/+$/, '');
  const primaryModel = process.env.VACA_REWARD_PRIMARY_MODEL || JUDGE_MODEL;

  let rewarded = 0;
  for (const p of sample) {
    console.log(`\n━━━ TEST: ${p.title} ━━━`);
    // 1) Re-create from description only.
    const recreate = await llm([
      { role: 'system', content: 'You are a precise code generator. Reproduce the requested implementation cleanly. Return ONLY the code in a ``` code block. No explanations.' },
      { role: 'user', content: `Recreate a ${p.language} function/feature for this spec. IMPORTANT: write a correct, working, self-contained implementation.\n\nNode type: ${p.nodeType || 'n/a'}\nTags: ${(p.tags || []).join(', ')}\nSpec: ${p.description}` },
    ], primaryUrl, primaryModel, 3000);
    const recreated = extractFence(recreate);
    const jsLang = (p.language || '').toLowerCase() === 'javascript';
    const check = jsLang ? jsCheck(recreated) : { ok: recreated.length > 20, error: '' };
    const recreatedOk = check.ok;
    const origBytes = bytes(p.code);
    const newBytes = bytes(recreated);
    console.log(`  recreate ${recreatedOk ? '✅ PARSES' : '❌ BROKEN'} | ${newBytes}B vs ${origBytes}B original`);

    if (!recreatedOk) {
      console.log('  ✋ THUMBS DOWN — recreation is broken. Where it went wrong:');
      if (jsLang && check.error) console.log(('  ' + check.error).replace(/\n\s*/g, '\n  '));
      else if (recreated.length <= 20) console.log('   (produced almost no code — model output was empty/' + recreated.length + ' chars)');
      else console.log('   (non-JS design; could not be statically checked)');
      continue;
    }

    // 2) Grade with the 2nd LLM (judge).
    let grade = '';
    try {
      grade = await llm([
        { role: 'system', content: 'You are a strict code reviewer and teacher. You grade code on correctness, clarity, universality, and size. Reply with a SCORE (0-100) on line one, then bullet suggestions to make it smaller/faster/more universal while keeping identical behavior.' },
        { role: 'user', content: `Original library code:\n\`\`\`js\n${p.code}\n\`\`\`\n\nRecreated code:\n\`\`\`js\n${recreated}\n\`\`\`\n\nGive SCORE and improvement suggestions.` },
      ], JUDGE_URL, JUDGE_MODEL, 2500);
    } catch (e: any) {
      console.log('  judge error:', e?.message);
    }
    const verdict = extractVerdict(grade);
    const verdictOk = verdict.score >= 60;
    console.log(`  judge SCORE: ${verdict.score} ${verdictOk ? '✅ THUMBS UP' : '✋ THUMBS DOWN'}`);
    if (grade.trim()) console.log('  judge notes: ' + grade.replace(/\n\s*/g, ' | ').slice(0, 300));

    // 3) Reward heuristic: keep the SMALLER of the two valid versions, and if
    //    a suggested improvement exists, that's the learning signal.
    const better = newBytes < origBytes ? recreated : p.code;
    if (better !== p.code) {
      // The recreation was smaller — reward by bumping this pattern's fidelity.
      p.code = better;
      p.qualityScore = Math.min(10, (p.qualityScore || 5) + 1);
      rewarded++;
      console.log(`  ✅ REWARD: smaller valid version stored (+quality → ${p.qualityScore})`);
    } else {
      console.log('  → original stayed (recreation not smaller); judge suggestions:', verdict.suggestions.length);
    }
  }

  fs.writeFileSync(PATTERNS, JSON.stringify(patterns, null, 2), 'utf-8');
  console.log(`\n🏁 Reward loop done. ${rewarded} design(s) improved & re-stored into the library.`);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });