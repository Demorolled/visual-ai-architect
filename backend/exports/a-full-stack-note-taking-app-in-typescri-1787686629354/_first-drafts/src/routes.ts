import express from 'express';
import { createNote, getNotes, getNoteById, updateNote, deleteNote } from './notes';

export const notesRouter = express.Router();

notesRouter.post('/', (req, res) => {
  const note = createNote(req.body);
  res.status(201).json(note);
});

notesRouter.get('/', (req, res) => {
  const notes = getNotes();
  res.json(notes);
});

notesRouter.get('/:id', (req, res) => {
  const note = getNoteById(req.params.id);
  if (!note) return res.status(404).json({ error: 'Note not found' });
  res.