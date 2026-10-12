import { Card, Deck, addCard, listCards } from '../cards.ts';

const CARDS_FILE = 'cards.json';

export async function loadCards(): Promise<Card[]> {
  try {
    const data = await Deno.readTextFile(CARDS_FILE);
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function saveCards(cards: Card[]): Promise<void> {
  await Deno.writeTextFile(CARDS_FILE, JSON.stringify(cards, null, 2));
}