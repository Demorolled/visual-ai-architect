import { Note } from '../models/noteModel';
import { saveNote, loadNotes } from '../in-memory-storage';

export const createNote = (content: string): Note => {
  const newNote: Note = { id: Date.now().toString(), content };
  saveNote(newNote);
  return newNote;
};

export const getNotes = (): Note[] => {
  return loadNotes();
};