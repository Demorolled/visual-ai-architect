import { Note } from '../models.ts';

export async function loadNotes(): Promise<Note[]> {
  const notes = localStorage.getItem('notes') || '[]';
  return JSON.parse(notes) as Note[];
}

export async function saveNotes(notes: Note[]): Promise<void> {
  localStorage.setItem('notes', JSON.stringify(notes));
}