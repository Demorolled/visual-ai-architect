import { Router } from 'express';
import { addNote, getNotes } from '../services/noteService';

const noteRoutes = Router();

noteRoutes.post('/notes', (req, res) => {
  const { content } = req.body;
  const note = addNote(content);
  res.status(201).json(note);
});

noteRoutes.get('/notes', (req, res) => {
  const notes = getNotes();
  res.json(notes);
});

export default noteRoutes;