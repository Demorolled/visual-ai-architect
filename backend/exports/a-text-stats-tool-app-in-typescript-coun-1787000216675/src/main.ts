import { countWords, countChars, countSentences, getMostFrequentWords } from './stats.ts';
import { TextStats } from './types.ts';

export function run(input: string): void {
  try {
    const stats = calculateStats(input);
    console.log(`Word count: ${stats.wordCount}`);
    console.log(`Character count: ${stats.characterCount}`);
    console.log(`Sentence count: ${stats.sentenceCount}`);
    console.log('Most frequent words:');
    stats.mostFrequentWords.forEach((word) => {
      console.log(`- ${word}`);
    });
  } catch (error) {
    console.error('Error processing text stats:', error);
  }
}

export async function main(): Promise<void> {
  try {
    const input = await readInput();
    run(input);
  } catch (error) {
    console.error('Error running text stats:', error);
  }
}

function calculateStats(input: string): TextStats {
  const words = countWords(input);
  const chars = countChars(input);
  const sentences = countSentences(input);
  const mostFrequentWords = getMostFrequentWords(input);
  return { wordCount: words, characterCount: chars, sentenceCount: sentences, mostFrequentWords };
}

async function readInput(): Promise<string> {
  return new Promise((resolve) => {
    const reader = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    reader.question('Enter text (press Enter when done): ', (input) => {
      reader.close();
      resolve(input);
    });
  });
}