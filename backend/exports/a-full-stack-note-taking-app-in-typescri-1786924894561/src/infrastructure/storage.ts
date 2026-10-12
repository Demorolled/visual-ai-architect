import { Note } from '../domain/notes';

let notes: Note[] = [];

export const loadNotes = (): Note[] => {
  return notes;
};

export const saveNotes = (newNotes: Note[]): void => {
  notes = newNotes;
};