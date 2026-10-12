import express from 'express';
import { getNotes, addNote, updateNote, deleteNote } from '../services/notes';

const notesRouter = express.Router();

notesRouter.get('/', async (req, res) => {
  try {
    const notes = await getNotes();
    res.json(notes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

notesRouter.post('/', async (req, res) => {
  const note = req.body;
  try {
    await addNote(note);
    res.status(201).json(note);
  } catch (error) {
    res.status(400).json({ error: 'Invalid note data' });
  }
});

notesRouter.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const updatedNote = req.body;
  try {
    await updateNote(id, updatedNote);
    res.json(updatedNote);
  } catch (error) {
    res.status(400).json({ error: 'Invalid note data' });
  }
});

notesRouter.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await deleteNote(id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

export { notesRouter };