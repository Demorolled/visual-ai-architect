import { Note } from './notes';

export function loadNotes(): Note[] {
  return [];
}

export function saveNotes(notes: Note[]) {
  console.log('Saving notes...', notes);
}