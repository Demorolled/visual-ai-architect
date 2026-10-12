import { createDeck, quiz } from '../flashcards.ts';

export function runCli(): void {
  const flashcards = loadFlashcards('flashcards.json');
  if (flashcards.length === 0) {
    console.log('No flashcards available. Please add some first.');
    return;
  }
  const session = quiz(flashcards);
  console.log(`Session completed. Correct: ${session.correct}, Incorrect: ${session.incorrect}`);
}