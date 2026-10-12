import { Database } from '../database.ts';

export interface Note {
  id: number;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function addNote(title: string, content: string): Promise<Note> {
  const db = new Database();
  const note = { title, content, createdAt: new Date(), updatedAt: new Date() };
  await db.insert(note);
  return note;
}

export async function getAllNotes(): Promise<Note[]> {
  const db = new Database();
  return await db.selectAll();
}

export async function getNoteById(id: number): Promise<Note | null> {
  const db = new Database();
  return await db.selectById(id);
}

export async function updateNote(id: number, title: string, content: string): Promise<void> {
  const db = new Database();
  await db.update(id, title, content);
}

export async function deleteNote(id: number): Promise<void> {
  const db = new Database();
  await db.delete(id);
}