import { Note } from '../models/note';

let notes: Note[] = [];
let nextId = 1;

export function addNote(content: string): Note {
  const note: Note = { id: nextId++, content };
  notes.push(note);
  return note;
}

export function getNotes(): Note[] {
  return notes;
}

export function updateNote(id: number, content: string): Note | undefined {
  const note = notes.find(n => n.id === id);
  if (note) {
    note.content = content;
  }
  return note;
}

export function deleteNote(id: number): void {
  notes = notes.filter(n => n.id !== id);
}