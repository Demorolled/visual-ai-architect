import express from 'express';
import { createNote, getNotes, updateNote, deleteNote } from '../services/noteService';
import { Note } from '../types';

const noteRouter = express.Router();

noteRouter.get('/', (req, res) => {
  const notes = getNotes();
  res.json(notes);
});

noteRouter.post('/', (req, res) => {
  const note: Note = req.body;
  const newNote = createNote(note);
  res.status(201).json(newNote);
});

noteRouter.put('/:id', (req, res) => {
  const id = req.params.id;
  const updatedNote: Note = req.body;
  const result = updateNote(id, updatedNote);
  if (result) {
    res.json(result);
  } else {
    res.status(404).send('Note not found');
  }
});

noteRouter.delete('/:id', (req, res) => {
  const id = req.params.id;
  deleteNote(id);
  res.status(204).send();
});

export { noteRouter };