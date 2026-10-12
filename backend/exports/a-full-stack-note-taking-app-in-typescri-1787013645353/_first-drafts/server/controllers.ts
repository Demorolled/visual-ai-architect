import { getAllNotes, createNote, updateNote, deleteNote } from '../models.ts';

export function getNotes(): Note[] {
  return getAllNotes();
}

export function createNote(title: string, content: string): Note {
  return createNote(title, content);
}

export function updateNote(id: string, title: string, content: string): Note | null {
  return updateNote(id, title, content);
}

export function deleteNote(id: string): boolean {
  return deleteNote(id);
}
