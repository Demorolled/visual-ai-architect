import { Card, Deck, addCard, listCards } from '../cards/cards.ts';

export function run(args: string[]): void {
  if (args.length < 1) {
    console.error('Usage: flashcards <command> <args>');
    process.exit(1);
  }

  const command = args[0];
  const subArgs = args.slice(1);

  switch (command) {
    case 'add':
      if (subArgs.length < 3) {
        console.error('Usage: flashcards add <deck> <question> <answer>');
        process.exit(1);
      }
      const deckName = subArgs[0];
      const question = subArgs[1];
      const answer = subArgs[2];
      addCard(deckName, question, answer);
      console.log(`Card added to ${deckName}`);
      break;
    case 'list':
      const decks = listCards();
      console.log('Decks:');
      for (const deck of decks) {
        console.log(`- ${deck.name} (${deck.cards.length} cards)`);
      }
      break;
    case 'quiz':
      if (subArgs.length < 1) {
        console.error('Usage: flashcards quiz <deck>');
        process.exit(1);
      }
      const quizDeckName = subArgs[0];
      // TODO: Implement quiz logic
      console.log(`Quiz for ${quizDeckName}`);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

export function main(): void {
  const args = process.argv.slice(2);
  run(args);
}