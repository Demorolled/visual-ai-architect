import express from 'express';
import { createNote, getNotes } from '../services/noteService';

const noteRoutes = express.Router();

noteRoutes.post('/notes', (req, res) => {
  const { content } = req.body;
  const id = createNote(content);
  res.status(201).json({ id, content });
});

noteRoutes.get('/notes', (req, res) => {
  const notes = getNotes();
  res.json(notes);
});

export { noteRoutes };