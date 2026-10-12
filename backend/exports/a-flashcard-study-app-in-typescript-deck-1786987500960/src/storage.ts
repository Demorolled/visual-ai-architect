import { Flashcard } from '../types.ts';

export function loadFlashcards(filePath: string): Flashcard[] {
  try {
    const data = Deno.readTextFileSync(filePath);
    return JSON.parse(data) as Flashcard[];
  } catch {
    return [];
  }
}

export function saveFlashcards(filePath: string, flashcards: Flashcard[]): void {
  Deno.writeTextFileSync(filePath, JSON.stringify(flashcards, null, 2));
}