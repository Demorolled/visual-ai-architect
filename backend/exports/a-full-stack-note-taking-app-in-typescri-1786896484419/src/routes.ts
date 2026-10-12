import { Router } from 'express';
import { createNote, getNotes, updateNote, deleteNote } from './services/noteService';

const noteRoutes = Router();

noteRoutes.get('/notes', (req, res) => {
  res.json(getNotes());
});

noteRoutes.post('/notes', (req, res) => {
  const { title, content } = req.body;
  const note = createNote(title, content);
  res.status(201).json(note);
});

noteRoutes.put('/notes/:id', (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;
  const note = updateNote(Number(id), title, content);
  if (note) {
    res.json(note);
  } else {
    res.status(404).send('Note not found');
  }
});

noteRoutes.delete('/notes/:id', (req, res) => {
  const { id } = req.params;
  const deleted = deleteNote(Number(id));
  if (deleted) {
    res.status(204).send();
  } else {
    res.status(404).send('Note not found');
  }
});

export { noteRoutes };