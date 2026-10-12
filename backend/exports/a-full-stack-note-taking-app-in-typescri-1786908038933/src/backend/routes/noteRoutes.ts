import { Router } from 'express';
import { createNote, getNotes, updateNote, deleteNote } from '../controllers/noteController';

const noteRoutes = Router();

noteRoutes.post('/notes', (req, res) => {
  const { content } = req.body;
  const note = createNote(content);
  res.status(201).json(note);
});

noteRoutes.get('/notes', (req, res) => {
  const notes = getNotes();
  res.json(notes);
});

noteRoutes.put('/notes/:id', (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  const note = updateNote(Number(id), content);
  if (note) {
    res.json(note);
  } else {
    res.status(404).send('Note not found');
  }
});

noteRoutes.delete('/notes/:id', (req, res) => {
  const { id } = req.params;
  const success = deleteNote(Number(id));
  if (success) {
    res.status(204).send();
  } else {
    res.status(404).send('Note not found');
  }
});

export { noteRoutes };