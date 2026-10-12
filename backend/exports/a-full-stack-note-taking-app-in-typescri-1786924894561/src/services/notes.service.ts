import { Note, NoteCreate, NoteUpdate } from '../domain/notes';

let notes: Note[] = [];

export const createNote = (note: NoteCreate): Note => {
  const newNote: Note = { id: Date.now().toString(), content: note.content };
  notes.push(newNote);
  return newNote;
};

export const getNotes = (): Note[] => {
  return notes;
};

export const updateNote = (note: NoteUpdate): Note | null => {
  const index = notes.findIndex(n => n.id === note.id);
  if (index !== -1) {
    notes[index] = { id: note.id, content: note.content };
    return notes[index];
  }
  return null;
};

export const deleteNote = (id: string): boolean => {
  const index = notes.findIndex(n => n.id === id);
  if (index !== -1) {
    notes.splice(index, 1);
    return true;
  }
  return false;
};