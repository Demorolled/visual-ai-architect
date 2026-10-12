import { Note, addNote, getNotes } from './note';

export async function startServer(port: number) {
  const express = await import('express');
  const app = express.default();

  app.use(express.json());

  app.get('/notes', async (req, res) => {
    try {
      const notes = await getNotes();
      res.json(notes);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch notes' });
    }
  });

  app.post('/notes', async (req, res) => {
    const noteData = req.body;
    try {
      const note = await addNote(noteData);
      res.status(201).json(note);
    } catch (err) {
      res.status(400).json({ error: 'Invalid note data' });
    }
  });

  app.listen(port, () => {
    console.log(`Server started on port ${port}`);
  });
}