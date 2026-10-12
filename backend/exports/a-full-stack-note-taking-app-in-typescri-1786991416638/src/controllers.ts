import { getNotes, addNote, deleteNote, updateNote } from '../services';

export const getNotesController = () => {
  return getNotes();
};

export const addNoteController = (note: { title: string; content: string }) => {
  return addNote(note);
};

export const deleteNoteController = (id: number) => {
  return deleteNote(id);
};

export const updateNoteController = (id: number, note: { title: string; content: string }) => {
  return updateNote(id, note);
};