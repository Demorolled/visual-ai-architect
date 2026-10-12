
async function connectDB(): Promise<Database> {
  return new Promise((resolve, reject) => {
    const db = new Database('./notes.db', (err) => {
      if (err) {
        reject(err);
      } else {
        db.serialize(() => {
          db.run('CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, content TEXT)');
        });
        resolve(db);
      }
    });
  });
}

async function getNotes(): Promise<any[]> {
  const db = await connectDB();
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM notes', (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

async function saveNote(title: string, content: string): Promise<void> {
  const db = await connectDB();
  return new Promise((resolve, reject) => {
    db.run('INSERT INTO notes (title, content) VALUES (?, ?)', [title, content], (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function updateNote(id: number, title: string, content: string): Promise<void> {
  const db = await connectDB();
  return new Promise((resolve, reject) => {
    db.run('UPDATE notes SET title = ?, content = ? WHERE id = ?', [title, content, id], (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function deleteNote(id: number): Promise<void> {
  const db = await connectDB();
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM notes WHERE id = ?', [id], (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}