import { Note } from './note';

let notes: Note[] = [];

export function loadNotes(): Note[] {
  return notes;
}

export function saveNotes(newNotes: Note[]): void {
  notes = newNotes;
}