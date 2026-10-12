import { Flashcard, createDeck, quiz } from './flashcards.ts';

function run(args: string[]) {
  const deck = createDeck('Sample', [{ question: 'What is 2 + 2?', answer: '4' }]);
  const session = quiz(deck);
  console.log(`Quiz complete: ${session.correct} correct, ${session.incorrect} incorrect`);
}

function main() {
  const args = process.argv.slice(2);
  run(args);
}

export { run, main };

if (require.main === module) {
  main();
}