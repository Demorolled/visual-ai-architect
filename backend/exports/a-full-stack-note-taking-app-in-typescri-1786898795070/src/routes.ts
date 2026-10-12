import express from 'express';
import { addNote, getNotes } from '../services/noteService';

interface Note {
  id: number;
  content: string;
}

const router = express.Router();

router.post('/notes', (req, res) => {
  const note: Note = req.body;
  addNote(note);
  res.status(201).send(note);
});

router.get('/notes', (req, res) => {
  const notes = getNotes();
  res.send(notes);
});

export default router;