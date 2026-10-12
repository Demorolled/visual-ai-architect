import { initDatabase, saveNote, loadNotes, deleteNoteById } from '../database/database.ts';

export function initDatabase() {
  const db = new sqlite.Database(':memory:');
  db.run('CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, content TEXT)');
  return db;
}

export async function saveNote(title: string, content: string) {
  const db = initDatabase();
  const stmt = db.prepare('INSERT INTO notes (title, content) VALUES (?, ?)');
  stmt.run(title, content);
  db.close();
}

export async function loadNotes() {
  const db = initDatabase();
  const stmt = db.prepare('SELECT * FROM notes');
  const notes = stmt.all();
  db.close();
  return notes;
}

export async function deleteNoteById(id: number) {
  const db = initDatabase();
  const stmt = db.prepare('DELETE FROM notes WHERE id = ?');
  stmt.run(id);
  db.close();
}