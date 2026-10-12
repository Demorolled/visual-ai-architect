import { Note } from '../domain/note';

const notes: Note[] = [];

let nextId = 1;

export function addNote(content: string): Note {
  const note: Note = { id: nextId++, content };
  notes.push(note);
  return note;
}

export function getNotes(): Note[] {
  return [...notes];
}