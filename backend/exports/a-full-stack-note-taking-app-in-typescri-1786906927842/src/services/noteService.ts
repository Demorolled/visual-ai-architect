import { Note } from '../types';

const notes: Note[] = [];

export const createNote = (note: Note): Note => {
  const newNote = { ...note, id: Date.now().toString() };
  notes.push(newNote);
  return newNote;
};

export const getNotes = (): Note[] => {
  return notes;
};

export const updateNote = (id: string, updatedNote: Note): Note | undefined => {
  const index = notes.findIndex(note => note.id === id);
  if (index !== -1) {
    notes[index] = { ...updatedNote, id };
    return notes[index];
  }
  return undefined;
};

export const deleteNote = (id: string): void => {
  const index = notes.findIndex(note => note.id === id);
  if (index !== -1) {
    notes.splice(index, 1);
  }
};