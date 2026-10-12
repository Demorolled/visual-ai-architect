import { Note } from '../domain/note';
import { loadNotes, saveNotes } from '../infrastructure/storage';

export function getNotes(): Note[] {
  return loadNotes();
}

export function addNote(note: Note): void {
  const notes = loadNotes();
  notes.push(note);
  saveNotes(notes);
}

export function updateNote(id: number, content: string): void {
  const notes = loadNotes();
  const updatedNotes = notes.map(note => note.id === id ? { ...note, content } : note);
  saveNotes(updatedNotes);
}

export function deleteNote(id: number): void {
  const notes = loadNotes();
  const updatedNotes = notes.filter(note => note.id !== id);
  saveNotes(updatedNotes);
}