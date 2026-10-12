import { Note } from './models';

let notes: Note[] = [];
let idCounter = 1;

export const getNotes = () => notes;

export const addNote = (note: { title: string; content: string }) => {
  const newNote: Note = {
    id: idCounter++,
    title: note.title,
    content: note.content,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  notes.push(newNote);
  return newNote;
};

export const deleteNote = (id: number) => {
  notes = notes.filter(n => n.id !== id);
};

export const updateNote = (id: number, note: { title: string; content: string }) => {
  const existingNote = notes.find(n => n.id === id);
  if (existingNote) {
    existingNote.title = note.title;
    existingNote.content = note.content;
    existingNote.updatedAt = new Date();
  }
};
