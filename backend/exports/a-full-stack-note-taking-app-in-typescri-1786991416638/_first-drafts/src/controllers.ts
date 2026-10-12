import { getNotes, addNote, deleteNote, updateNote } from '../services';

export const getNotes = () => {
  return getNotes();
};

export const addNote = (note: { title: string; content: string }) => {
  return addNote(note);
};

export const deleteNote = (id: number) => {
  deleteNote(id);
};

export const updateNote = (id: number, note: { title: string; content: string }) => {
  updateNote(id, note);
};
