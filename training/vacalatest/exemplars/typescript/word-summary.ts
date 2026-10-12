import { readFileSync } from 'node:fs';

interface Summary {
  count: number;
  distinct: number;
}

function summarize(text: string): Summary {
  const words = text.split(/\s+/).filter(Boolean);
  return { count: words.length, distinct: new Set(words).size };
}

const summary: Summary = summarize(readFileSync(0, 'utf8'));
console.log(`words=${summary.count} distinct=${summary.distinct}`);
