import { Note } from '../models/noteModel';

let notes: Note[] = [];
let nextId = 1;

export function createNote(title: string, content: string): Note {
  const note: Note = { id: nextId++, title, content };
  notes.push(note);
  return note;
}

export function getNotes(): Note[] {
  return notes;
}

export function updateNote(id: number, title: string, content: string): Note | undefined {
  const note = notes.find(n => n.id === id);
  if (note) {
    note.title = title;
    note.content = content;
  }
  return note;
}

export function deleteNote(id: number): boolean {
  const index = notes.findIndex(n => n.id === id);
  if (index !== -1) {
    notes.splice(index, 1);
    return true;
  }
  return false;
}