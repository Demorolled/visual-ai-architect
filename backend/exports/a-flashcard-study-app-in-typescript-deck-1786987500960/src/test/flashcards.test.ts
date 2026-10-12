import { createDeck, quiz } from '../flashcards.ts';

describe('flashcards', () => {
  it('should create a deck', () => {
    const deck = createDeck();
    expect(deck).toHaveProperty('flashcards');
  });

  it('should quiz', () => {
    const deck = createDeck();
    const session = quiz(deck);
    expect(session).toHaveProperty('correct');
    expect(session).toHaveProperty('incorrect');
  });
});