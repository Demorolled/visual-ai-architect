import { Card, Deck } from '../cards/cards.ts';

export class Quiz {
  private currentCard: Card | null = null;
  private correctCount: number = 0;
  private incorrectCount: number = 0;

  constructor(private deck: Deck) {}

  public start(): void {
    this.correctCount = 0;
    this.incorrectCount = 0;
    this.currentCard = null;
  }

  public nextCard(): Card | null {
    if (this.deck.cards.length === 0) {
      return null;
    }
    this.currentCard = this.deck.cards[Math.floor(Math.random() * this.deck.cards.length)];
    return this.currentCard;
  }

  public answer(answer: string): boolean {
    if (!this.currentCard) {
      return false;
    }
    if (answer.toLowerCase() === this.currentCard.answer.toLowerCase()) {
      this.correctCount++;
      return true;
    } else {
      this.incorrectCount++;
      return false;
    }
  }

  public getStats(): { correct: number; incorrect: number } {
    return { correct: this.correctCount, incorrect: this.incorrectCount };
  }
}