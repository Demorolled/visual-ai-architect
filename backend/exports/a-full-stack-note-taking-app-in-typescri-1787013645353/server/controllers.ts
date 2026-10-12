import { Note } from '../models.ts';

export function getNotes(): Note[] {
  return [];
}

export function createNote(title: string, content: string): Note {
  return {
    id: Date.now().toString(),
    title,
    content,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function updateNote(id: string, title: string, content: string): Note | null {
  // Simulate note update
  return {
    id,
    title,
    content,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function deleteNote(id: string): boolean {
  // Simulate note deletion
  return true;
}