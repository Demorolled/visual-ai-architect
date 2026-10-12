/**
 * dump-micro-references.ts — emit the ten worked "before → after" micro-build
 * references as a human-readable markdown (data/micro-app-build-examples.md).
 * Single source of truth stays the MICRO_BUILD_REFERENCES module.
 *
 * Usage: npx tsx backend/scripts/dump-micro-references.ts
 */
import fs from 'fs';
import path from 'path';
import { MICRO_BUILD_REFERENCES } from '../src/services/microExperimenterReference.js';

const outDir = path.resolve(import.meta.dirname, '..', '..', 'data');
const outPath = path.join(outDir, 'micro-app-build-examples.md');

const lines: string[] = [];
lines.push('# Micro-App Build References — 10 worked examples');
lines.push('');
lines.push('Each row shows the SAME micro-app written plainly (Baseline), then improved to be **smaller, faster, and more universal** (Improved). The **Lesson** is the reusable design pattern the LLM should generalize — VACA\'s idle experimenter uses these as reference when it rewrites code in the catalog.');
lines.push('');

for (let i = 0; i < MICRO_BUILD_REFERENCES.length; i++) {
  const ref = MICRO_BUILD_REFERENCES[i];
  lines.push(`## ${i + 1}. ${ref.title.replace(/^\w/, c => c.toUpperCase())}  ｜ nodeType: \`${ref.nodeType}\` · language: \`${ref.language}\``);
  lines.push('');
  lines.push('**Baseline (plain, works):**');
  lines.push('```' + (ref.language === 'html' ? 'html' : ref.language === 'typescript' ? 'ts' : 'js'));
  lines.push(ref.baseline);
  lines.push('```');
  lines.push('');
  lines.push('**Improved (smaller · faster · more universal):**');
  lines.push('```' + (ref.language === 'html' ? 'html' : ref.language === 'typescript' ? 'ts' : 'js'));
  lines.push(ref.improved);
  lines.push('```');
  lines.push('');
  lines.push(`**Lesson / pattern:** ${ref.lesson}`);
  lines.push('');
  lines.push('---');
  lines.push('');
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, lines.join('\n'), 'utf-8');
console.log(`Wrote ${MICRO_BUILD_REFERENCES.length} references → ${outPath}`);