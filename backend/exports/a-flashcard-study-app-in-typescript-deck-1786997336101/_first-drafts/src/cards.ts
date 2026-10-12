export interface Card {
  id: number;
  question: string;
  answer: string;
  deckId: number;
  createdAt: Date;
}

export interface Deck {
  id: number;
  name: string;
  cards: Card[];
}

export function addCard(deck: Deck, question: string, answer: string): void {
  const newCard: Card = {
    id: Date.now(),
    question,
    answer,
    deckId: deck.id,
    createdAt: new Date(),
  };
  deck.cards.push(newCard);
}

export function listCards(deck: Deck): Card[] {
  return deck.cards;
}