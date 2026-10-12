import express from 'express';
import { addNote, getNotes, updateNote, deleteNote } from './controllers';

const router = express.Router();

router.post('/notes', (req, res) => {
  const note = req.body;
  addNote(note);
  res.status(201).send(note);
});

router.get('/notes', (req, res) => {
  const notes = getNotes();
  res.send(notes);
});

router.put('/notes/:id', (req, res) => {
  const note = req.body;
  updateNote(note);
  res.send(note);
});

router.delete('/notes/:id', (req, res) => {
  const id = req.params.id;
  deleteNote(id);
  res.status(204).send();
});

export const routes = router;