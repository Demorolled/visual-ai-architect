import { DB_PATH } from './config';

interface Note {
  id: number;
  text: string;
}

let notes: Note[] = [];

export function getNotes(): Note[] {
  return notes;
}

export function addNote(text: string): void {
  const newNote = { id: notes.length + 1, text };
  notes.push(newNote);
}

export function deleteNote(id: number): void {
  notes = notes.filter(note => note.id !== id);
}