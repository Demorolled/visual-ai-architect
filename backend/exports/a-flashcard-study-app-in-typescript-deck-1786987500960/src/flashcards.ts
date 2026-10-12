import { Flashcard } from './types';
import { Deck } from './types';
import { QuizSession } from './types';
export function createDeck(name: string, flashcards: Flashcard[]): Deck {
  return { name, flashcards };
}

export function quiz(deck: Deck): QuizSession {
  let correct = 0;
  let incorrect = 0;

  for (const card of deck.flashcards) {
    const answer = prompt(card.question);
    if (answer === card.answer) {
      correct++;
    } else {
      incorrect++;
    }
  }

  return { deck, correct, incorrect };
}