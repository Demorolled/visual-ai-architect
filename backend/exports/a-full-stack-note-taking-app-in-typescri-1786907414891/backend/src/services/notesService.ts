import { Note } from '../domain/note';

let notes: Note[] = [];

export function getAllNotes(): Note[] {
  return notes;
}

export function addNote(note: Note): void {
  notes.push(note);
}