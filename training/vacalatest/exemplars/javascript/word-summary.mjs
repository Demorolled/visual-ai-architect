import { readFileSync } from 'node:fs';

function summarize(text) {
  const words = text.split(/\s+/).filter(Boolean);
  return { count: words.length, distinct: new Set(words).size };
}

const { count, distinct } = summarize(readFileSync(0, 'utf8'));
console.log(`words=${count} distinct=${distinct}`);
