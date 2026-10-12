import { Database } from 'sqlite3';

const db = new Database(':memory:');
db.serialize(() => {
  db.run('CREATE TABLE notes (id INTEGER PRIMARY KEY, title TEXT, content TEXT)');
});

export function getNotes() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM notes', (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

export function addNote(title: string, content: string) {
  return new Promise((resolve, reject) => {
    db.run('INSERT INTO notes (title, content) VALUES (?, ?)', [title, content], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export function updateNote(id: number, title: string, content: string) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE notes SET title = ?, content = ? WHERE id = ?', [title, content, id], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export function deleteNote(id: number) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM notes WHERE id = ?', [id], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}
