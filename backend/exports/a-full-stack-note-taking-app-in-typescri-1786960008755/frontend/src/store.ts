import { Note } from './types';

let notes: Note[] = [];

export function useNotes() {
  return notes;
}

export function addNote(note: Note) {
  notes.push(note);
}

export function deleteNote(id: number) {
  notes = notes.filter(n => n.id !== id);
}
