import { Note } from '../models.ts';
import { loadNotes, saveNotes } from '../storage.ts';

export async function addNote(title: string, content: string): Promise<void> {
  const notes = await loadNotes();
  const newNote: Note = { id: Date.now().toString(), title, content, created_at: new Date() };
  notes.push(newNote);
  await saveNotes(notes);
}

export async function getNotes(): Promise<Note[]> {
  return await loadNotes();
}