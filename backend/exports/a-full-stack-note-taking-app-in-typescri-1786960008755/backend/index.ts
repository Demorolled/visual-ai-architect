import express from 'express';
import { NoteService, NoteRepository } from './note';

export function createApp() {
  const app = express();
  app.use(express.json());

  const noteRepository = new NoteRepository();
  const noteService = new NoteService(noteRepository);

  app.get('/api/notes', async (req, res) => {
    try {
      const notes = await noteService.getAllNotes();
      res.json(notes);
    } catch (err) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.post('/api/notes', async (req, res) => {
    try {
      const note = req.body;
      await noteService.addNote(note);
      res.status(201).json(note);
    } catch (err) {
      res.status(400).json({ error: 'Bad Request' });
    }
  });

  app.delete('/api/notes/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      await noteService.deleteNote(id);
      res.status(204).send();
    } catch (err) {
      res.status(400).json({ error: 'Bad Request' });
    }
  });

  return app;
}