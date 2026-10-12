import { open, close, Transaction } from 'better-sqlite3';

const DB_PATH = './notes.db';
let db: Transaction;

export function initDatabase() {
  db = open(DB_PATH).prepare(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.run();
}

export function closeDatabase() {
  if (db) { db.finalize(); db = null; }
}

export async function addNote(title: string, content: string): Promise<number> {
  const stmt = db.prepare('INSERT INTO notes (title, content) VALUES (?, ?)');
  const row = stmt.run(title, content).lastInsertRowId as number;
  stmt.finalize();
  return row;
}

export async function getNotes(): Promise<{ id: number; title: string; content: string; createdAt: string }[]> {
  const stmt = db.prepare('SELECT id, title, content, created_at FROM notes ORDER BY created_at DESC');
  const rows = stmt.all() as unknown as { id: number; title: string; content: string; createdAt: string }[];
  stmt.finalize();
  return rows;
}

export async function deleteNote(id: number): Promise<void> {
  const stmt = db.prepare('DELETE FROM notes WHERE id = ?');
  stmt.run(id);
  stmt.finalize();
}