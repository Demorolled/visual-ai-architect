import express from 'express';
import { addNote, getNotes } from '../services/noteService';

const router = express.Router();

router.post('/', (req, res) => {
  const note = req.body.note;
  if (!note) {
    return res.status(400).send('Note is required');
  }
  addNote(note);
  res.sendStatus(201);
});

router.get('/', (req, res) => {
  const notes = getNotes();
  res.json(notes);
});

export default router;