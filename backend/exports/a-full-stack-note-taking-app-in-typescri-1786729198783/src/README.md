# Note-Taking App

## Project Structure
```text
.
├── backend
│   ├── index.ts
│   ├── router.ts
│   ├── database.ts
│   └── types.ts
├── frontend
│   ├── App.tsx
│   ├── index.html
│   └── index.tsx
├── src
│   ├── backend.ts
│   ├── frontend.ts
│   ├── server.ts
│   ├── types.ts
│   ├── database.ts
│   ├── router.ts
│   ├── index.ts
│   └── tests.ts
└── docker-compose.yml
```

## Backend

### Backend Project Structure
```text
.
├── backend
│   ├── index.ts
│   ├── router.ts
│   ├── database.ts
│   └── types.ts
├── src
│   ├── backend.ts
│   ├── server.ts
│   ├── types.ts
│   ├── database.ts
│   ├── router.ts
│   └── index.ts
└── tests.ts
```

### Backend Code
```typescript
import express from 'express';
import bodyParser from 'body-parser';
import { Note, NotesRepository } from './types';
import { NotesDatabase } from './database';

const app = express();
app.use(bodyParser.json());

const notesRepo = new NotesRepository(new NotesDatabase());

app.get('/notes', (req, res) => {
  try {
    const notes = notesRepo.getAll();
    res.json(notes);
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve notes' });
  }
});

app.post('/notes', (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content are required' });
    }
    const note = notesRepo.create(title, content);
    res.status(201).json(note);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create note' });
  }
});

app.put('/notes/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;
    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content are required' });
    }
    const note = notesRepo.update(parseInt(id), title, content);
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }
    res.