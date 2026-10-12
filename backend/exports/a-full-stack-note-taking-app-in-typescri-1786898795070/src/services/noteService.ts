import { Note } from '../models/note';

let notes: Note[] = [];

export function addNote(note: Note): void {
  notes.push(note);
}

export function getNotes(): Note[] {
  return notes;
}