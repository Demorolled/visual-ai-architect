const fs = require('fs');
const path = require('path');
const os = require('os');

const DOCKERFILE = `# Dockerfile for note-taking app
# Use the official Node 20.2.0 image as the base
FROM node:20.2.0-slim

# Create a dedicated app directory and set it as the working directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Copy the package.json and package-lock.json files and install dependencies
COPY package*.json ./
RUN npm install --quiet

# Copy the frontend and backend sources into the container
COPY ./frontend/ ./frontend
COPY ./backend/ ./backend

# Install frontend dependencies
RUN cd /usr/src/app/frontend && npm install --quiet

# Expose port 3000 for the Express server
EXPOSE 3000

# Run the server as a non-root user
USER node
CMD ["node", "backend/server.js"]
`;

const PACKAGE_JSON = JSON.stringify({
  name: 'note-taking-app',
  version: '1.0.0',
  private: true,
  scripts: {
    build: 'cd frontend && npm run build',
    start: 'node backend/server.js',
  },
}, null, 2);

const FRONTEND_PACKAGE_JSON = JSON.stringify({
  name: 'frontend',
  version: '1.0.0',
  private: true,
  scripts: {
    build: 'npm run build',
  },
  dependencies: {
    'react': '*',
    'react-dom': '*',
  },
}, null, 2);

const BACKEND_PACKAGE_JSON = JSON.stringify({
  name: 'backend',
  version: '1.0.0',
  private: true,
  scripts: {
    start: 'node server.js',
  },
  dependencies: {
    'express': '*',
    'body-parser': '*',
  },
}, null, 2);

const FRONTEND_SOURCE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Note-Taking</title>
  <style>
    :root { --bg:#0a0a14; --card:#1a1a2e; --border:#252542; --text:#e0e0f0; --muted:#60607e; --accent:#4fc38f; }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { background:var(--bg); color:var(--text); font-family:'Segoe UI', system-ui, sans-serif; padding:30px 16px; }
    .editor { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:16px; margin-bottom:16px; }
    .editor h1 { font-size:20px; margin-bottom:10px; }
    #noteInput { width:100%; min-height:120px; border:none; border-bottom:1px solid var(--border); color:var(--text); font:14px/1.5 'Consolas', monospace; padding:10px; outline:none; }
    #noteInput:focus { border-bottom-color:var(--accent); }
    .actions { display:flex; justify-content:space-between; margin-bottom:8px; }
    .actions button { background:var(--accent); color:#fff; border:none; border-radius:8px; padding:8px 14px; cursor:pointer; font-size:13px; }
    .actions button:hover { transform:scale(1.05); }
    .actions button:active { transform:scale(1); }
    .list { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:12px; margin-bottom:16px; }
    .list h2 { font-size:14px; color:var(--muted); margin-bottom:8px; }
    .note { display:flex; align-items:center; gap:8px; padding:10px 12px; border-bottom:1px solid var(--border); }
    .note .content { flex:1; word-wrap:break-word; }
    .note .content::before { content:'•'; color:var(--muted); margin-right:6px; }
    .note .actions { margin-left:8px; }
    .note .actions button { background:none; border:1px solid var(--border); color:var(--muted); border-radius:6px; padding:3px 8px; cursor:pointer; font-size:12px; }
    .note .actions button:hover { color:var(--accent); border-color:var(--accent); }
    .empty { margin:80px 0; text-align:center; color:var(--muted); }
  </style>
</head>
<body>
  <div class="editor">
    <h1>Note-Taking</h1>
    <textarea id="noteInput" placeholder="Start typing your notes..."></textarea>
    <div class="actions">
      <button onclick="saveNote()">Save</button>
      <button onclick="clearNote()">Clear</button>
    </div>
  </div>
  <div class="list">
    <h2>Your Notes</h2>
    <div id="noteList" class="empty">No notes yet. Start editing above!</div>
  </div>
  <script>
    const noteInput = document.getElementById('noteInput');
    const noteList = document.getElementById('noteList');
    let notes = [];
    let currentNote = '';

    function loadNotes() {
      try {
        const saved = localStorage.getItem('nt-notes');
        if (saved) notes = JSON.parse(saved);
      } catch {}
    }

    function saveNotes() {
      localStorage.setItem('nt-notes', JSON.stringify(notes));
    }

    function clearNote() {
      noteInput.value = '';
      currentNote = '';
      noteList.innerHTML = '<div class="empty">No notes yet. Start editing above!</div>';
    }

    function saveNote() {
      const text = noteInput.value.trim();
      if (!text) return;
      currentNote = text;
      notes.push({ id: Date.now(), content: text });
      saveNotes();
      noteInput.value = '';
      noteList.innerHTML = notes.map(n => {
        const isCurrent = n.content === currentNote;
        return `<div class="note"><div class="content">${escapeHTML(n.content)}</div><div class="actions"><button onclick="editNote(${n.id})">Edit</button><button onclick="deleteNote(${n.id})">Delete</button></div></div>`;
      }).join('');
    }

    function editNote(id) {
      const note = notes.find(n => n.id === id);
      if (!note) return;
      noteInput.value = note.content;
      currentNote = note.content;
    }

    function deleteNote(id) {
      notes = notes.filter(n => n.id !== id);
      saveNotes();
      noteList.innerHTML = notes.length ? notes.map(n => {
        const isCurrent = n.content === currentNote;
        return `<div class="note"><div class="content">${escapeHTML(n.content)}</div><div class="actions"><button onclick="editNote(${n.id})">Edit</button><button onclick="deleteNote(${n.id})">Delete</button></div></div>`;
      }).join('') : '<div class="empty">No notes yet. Start editing above!</div>';
    }

    function escapeHTML(text) {
      return String.raw(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    loadNotes();
    noteInput.addEventListener('input', () => {
      currentNote = noteInput.value.trim();
      saveNotes();
    });
  </script>
</body>
</html>
`;

const BACKEND_SOURCE = `
import express from 'express';
import bodyParser from 'body-parser';

const app = express();
const port = 3000;

app.use(bodyParser.json());

let notes = [];

app.get('/api/notes', (req, res) => {
  res.json(notes);
});

app.post('/api/notes', (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content is required' });
  notes.push({ id: Date.now(), content });
  res.status(201).json(notes[notes.length - 1]);
});

app.put('/api/notes/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content is required' });
  const note = notes.find(n => n.id === id);
  if (!note) return res.status(404).json({ error: 'Note not found' });
  note.content = content;
  res.json(note);
});

app.delete('/api/notes/:id', (req, res) => {
  const id = parseInt(req.params.id);
  notes = notes.filter(n => n.id !== id);
  res.status(204).end();
});

app.get('/api/notes/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const note = notes.find(n => n.id === id);
  if (!note) return res.status(404).json({ error: 'Note not found' });
  res.json(note);
});

app.use((err, req, res, next) => {
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
`;

function createDirIfMissing(dir) {
  if (fs.existsSync(dir)) return;
  fs.mkdirSync(dir, { recursive: true });
}

function writeToFile(dir, filename, content) {
  createDirIfMissing(dir);
  fs.writeFileSync(path.join(dir, filename), content);
}

function generateProject(dir) {
  writeToFile(dir, 'Dockerfile', DOCKERFILE);
  writeToFile(dir, 'package.json', PACKAGE_JSON);
  const frontendDir = path.join(dir, 'frontend');
  const backendDir = path.join(dir, 'backend');
  createDirIfMissing(frontendDir);
  createDirIfMissing(backendDir);
  writeToFile(frontendDir, 'index.html', FRONTEND_SOURCE);
  writeToFile(frontendDir, 'package.json', FRONTEND_PACKAGE_JSON);
  writeToFile(backendDir, 'server.js', BACKEND_SOURCE);
  writeToFile(backendDir, 'package.json', BACKEND_PACKAGE_JSON);
}

module.exports = {
  generateProject,
};