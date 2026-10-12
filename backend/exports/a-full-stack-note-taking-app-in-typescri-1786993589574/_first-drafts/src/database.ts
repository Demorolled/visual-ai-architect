import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function connectDB() {
  const db = await open({
    filename: './notes.db',
    driver: sqlite3.Database,
  });
  await db.run('CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, content TEXT)');
  return db;
}

async function getNotes() {
  const db = await connectDB();
  const notes = await db.all('SELECT * FROM notes');
  return notes;
}

async function saveNote(title: string, content: string) {
  const db = await connectDB();
  await db.run('INSERT INTO notes (title, content) VALUES (?, ?)', [title, content]);
}

async function updateNote(id: number, title: string, content: string) {
  const db = await connectDB();
  await db.run('UPDATE notes SET title = ?, content = ? WHERE id = ?', [title, content, id]);
}

async function deleteNote(id: number) {
  const db = await connectDB();
  await db.run('DELETE FROM notes WHERE id = ?', [id]);
}