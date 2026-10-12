import { createNote, getNotes } from './services/noteService';

const express = require('express');
const router = express.Router();

router.post('/notes', (req, res) => {
  const note = createNote(req.body.content);
  res.status(201).json(note);
});

router.get('/notes', (req, res) => {
  const notes = getNotes();
  res.json(notes);
});

export const routes = router;