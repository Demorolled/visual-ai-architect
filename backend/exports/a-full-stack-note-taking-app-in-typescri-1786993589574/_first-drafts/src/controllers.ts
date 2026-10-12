import { connectDB, getNotes, saveNote, updateNote, deleteNote } from '../database/database.ts';

export async function createNote(note: string): Promise<void> {
  try {
    await saveNote(note);
  } catch (error) {
    console.error('Error creating note:', error);
    throw new Error('Failed to create note');
  }
}

export async function getNotes(): Promise<string[]> {
  try {
    return await getNotes();
  } catch (error) {
    console.error('Error fetching notes:', error);
    throw new Error('Failed to fetch notes');
  }
}

export async function updateNote(id: number, note: string): Promise<void> {
  try {
    await updateNote(id, note);
  } catch (error) {
    console.error('Error updating note:', error);
    throw new Error('Failed to update note');
  }
}

export async function deleteNote(id: number): Promise<void> {
  try {
    await deleteNote(id);
  } catch (error) {
    console.error('Error deleting note:', error);
    throw new Error('Failed to delete note');
  }
}