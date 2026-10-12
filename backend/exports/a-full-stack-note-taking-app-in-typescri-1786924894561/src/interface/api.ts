import express from 'express';
import { createNote, getNotes, updateNote, deleteNote } from '../services/notes.service';

const notesRouter = express.Router();

notesRouter.get('/', (req, res) => {
  try {
    const notes = getNotes();
    res.json(notes);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error.' });
  }
});

notesRouter.post('/', (req, res) => {
  const noteData = req.body;
  try {
    const note = createNote(noteData);
    res.status(201).json(note);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

notesRouter.put('/:id', (req, res) => {
  const noteId = req.params.id;
  const noteData = req.body;
  try {
    const updatedNote = updateNote(noteId, noteData);
    if (updatedNote) {
      res.json(updatedNote);
    } else {
      res.status(404).json({ message: 'Note not found.' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

notesRouter.delete('/:id', (req, res) => {
  const noteId = req.params.id;
  try {
    const deleted = deleteNote(noteId);
    if (deleted) {
      res.status(204).send();
    } else {
      res.status(404).json({ message: 'Note not found.' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Internal server error.' });
  }
});

export default notesRouter;