/**
 * E2E check for the coder-tier probe fix.
 * Verifies: coderTierAlive() correctly reports dead tiers, and reasonFast()
 * skips them (no ECONNREFUSED per-call spam) and falls through to the 7B primary.
 * Run: cd backend && npx tsx scripts/coder-probe-e2e.ts
 */
import { coderTierAlive, AITranslator } from '../src/ai/translator.js';

async function main() {
  console.log('=== coder tier liveness (expect dead: 11437/11434/11436, alive: 8000) ===');
  console.log('coderGpu1 :11437 =>', await coderTierAlive('http://127.0.0.1:11437/v1'));
  console.log('coderGpu0 :11434 =>', await coderTierAlive('http://127.0.0.1:11434/v1'));
  console.log('coderCpu  :11436 =>', await coderTierAlive('http://127.0.0.1:11436/v1'));
  console.log('dspark    :8000  =>', await coderTierAlive('http://127.0.0.1:8000/v1'));

  console.log('\n=== reasonFast fall-through (should go straight to primary, no dead-port warnings) ===');
  const t0 = Date.now();
  const ai = new AITranslator();
  const out = await ai.reasonFast('Write a TypeScript function named sum(a, b) that returns a + b. Only the code.', { maxTokens: 80 });
  console.log(`elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log('output:', out.slice(0, 200));
}

main().catch((err) => {
  console.error('e2e failed:', err);
  process.exit(1);
});
