import express from 'express';
import { getAllNotes, addNote } from './services/notesService';
import { Note } from './domain/note';

const router = express.Router();

router.get('/notes', (req, res) => {
  const notes = getAllNotes();
  res.json(notes);
});

router.post('/notes', (req, res) => {
  const note: Note = req.body;
  addNote(note);
  res.status(201).send('Note added');
});

export const routes = router;