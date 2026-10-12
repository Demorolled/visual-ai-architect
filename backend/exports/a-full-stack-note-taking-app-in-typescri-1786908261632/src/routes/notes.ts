import { addNote, getNotes } from '../services/notes';

import express from 'express';
const notesRouter = express.Router();

notesRouter.post('/notes', (req, res) => {
  const note = req.body.note;
  addNote(note);
  res.status(201).send('Note added');
});

notesRouter.get('/notes', (req, res) => {
  const notes = getNotes();
  res.json(notes);
});

export { notesRouter };