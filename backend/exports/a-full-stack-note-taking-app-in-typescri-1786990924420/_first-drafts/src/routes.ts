import express from 'express';
import { notesService } from '../notes.ts';

const notesRouter = express.Router();

notesRouter.get('/notes', (req, res) => {
  const notes = notesService.getAllNotes();
  res.json(notes);
});

notesRouter.post('/notes', (req, res) => {
  const { title, content } = req.body;
  notesService.addNote(title, content);
  res.status(201).send('Note added');
});

notesRouter.delete('/notes/:id', (req, res) => {
  const id = req.params.id;
  notesService.deleteNote(id);
  res.send('Note deleted');
});

export { notesRouter };
