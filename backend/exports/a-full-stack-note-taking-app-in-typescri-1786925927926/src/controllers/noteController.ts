import { Note } from '../models/noteModel';

const notes: Note[] = [];

export const getNotes = (): Note[] => {
  return notes;
};

export const addNote = (note: Note): void => {
  notes.push(note);
};