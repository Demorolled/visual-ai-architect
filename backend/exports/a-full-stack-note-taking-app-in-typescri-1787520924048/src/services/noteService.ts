import { loadNotes, saveNotes } from '../storage';

export const addNote = (note: string): void => {
  const notes = loadNotes();
  notes.push(note);
  saveNotes(notes);
};

export const getNotes = (): string[] => {
  return loadNotes();
};