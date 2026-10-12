export interface Flashcard {
  question: string;
  answer: string;
}

export interface Deck {
  name: string;
  flashcards: Flashcard[];
}

export interface QuizSession {
  deck: Deck;
  correct: number;
  incorrect: number;
}