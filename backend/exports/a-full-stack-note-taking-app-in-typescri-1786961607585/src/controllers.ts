import { saveNotes, loadNotes } from './storage';

export interface Note {
  id: string;
  title: string;
  content: string;
}

export function addNote(note: Note): void {
  const notes = loadNotes();
  notes.push(note);
  saveNotes(notes);
}

export function getNotes(): Note[] {
  return loadNotes();
}

export function updateNote(note: Note): void {
  const notes = loadNotes();
  const index = notes.findIndex(n => n.id === note.id);
  if (index !== -1) {
    notes[index] = note;
    saveNotes(notes);
  }
}

export function deleteNote(id: string): void {
  const notes = loadNotes();
  const filteredNotes = notes.filter(n => n.id !== id);
  saveNotes(filteredNotes);
}