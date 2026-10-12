import { addNote, getNotes } from './notes';

import express from 'express';
const router = express.Router();

router.post('/notes', (req, res) => {
  const { content } = req.body;
  if (!content) {
    return res.status(400).send('Content is required');
  }
  const note = addNote(content);
  res.status(201).send(note);
});

router.get('/notes', (req, res) => {
  const allNotes = getNotes();
  res.send(allNotes);
});

export const routes = router;