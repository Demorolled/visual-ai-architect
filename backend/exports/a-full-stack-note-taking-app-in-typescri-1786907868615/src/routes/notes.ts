import express from 'express';
import { getAllNotes, addNote, updateNote, deleteNote } from '../services/notes';

const notesRouter = express.Router();

notesRouter.get('/', (req, res) => {
  res.json(getAllNotes());
});

notesRouter.post('/', (req, res) => {
  const { content } = req.body;
  const newNote = addNote(content);
  res.status(201).json(newNote);
});

notesRouter.put('/:id', (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  const note = updateNote(Number(id), content);
  if (note) {
    res.json(note);
  } else {
    res.status(404).send('Note not found');
  }
});

notesRouter.delete('/:id', (req, res) => {
  const { id } = req.params;
  const deleted = deleteNote(Number(id));
  if (deleted) {
    res.status(204).send();
  } else {
    res.status(404).send('Note not found');
  }
});

export default notesRouter;