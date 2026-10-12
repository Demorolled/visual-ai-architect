import notes from '../data/notes';
import { Note } from '../data/notes';

let nextId = 1;

export const getAllNotes = (): Note[] => {
  return notes;
};

export const addNote = (content: string): Note => {
  const newNote: Note = { id: nextId++, content };
  notes.push(newNote);
  return newNote;
};

export const updateNote = (id: number, content: string): Note | null => {
  const note = notes.find(n => n.id === id);
  if (note) {
    note.content = content;
  }
  return note || null;
};

export const deleteNote = (id: number): boolean => {
  const index = notes.findIndex(n => n.id === id);
  if (index !== -1) {
    notes.splice(index, 1);
    return true;
  }
  return false;
};