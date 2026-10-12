// validate seeds against the real qualityGate.ts
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { isQualityCode } from '../src/knowledge/qualityGate.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const file = process.argv[2];
const seeds = JSON.parse(fs.readFileSync(file, 'utf-8'));
let ok = 0;
for (const s of seeds) {
  const good = isQualityCode(s.code, s.language);
  if (!good) console.log('❌', s.title, '(lang=' + (s.language || 'javascript') + ')');
  else ok++;
}
console.log(`\npassed ${ok}/${seeds.length}`);