import express from 'express';
import { Note, addNote, getAllNotes, getNoteById, updateNote, deleteNote } from '../../src/models/notes.ts';

const notesRouter = express.Router();

notesRouter.post('/', async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content are required' });
    }
    const newNote = await addNote({ title, content });
    res.status(201).json(newNote);
  } catch (error) {
    console.error('Error adding note:', error);
    res.status(500).json({ message: 'Failed to add note' });
  }
});

notesRouter.get('/', async (req, res) => {
  try {
    const notes = await getAllNotes();
    res.status(200).json(notes);
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({ message: 'Failed to fetch notes' });
  }
});

notesRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const note = await getNoteById(Number(id));
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }
    res.status(200).json(note);
  } catch (error) {
    console.error('Error fetching note:', error);
    res.status(500).json({ message: 'Failed to fetch note' });
  }
});

notesRouter.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;
    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content are required' });
    }
    const updatedNote = await updateNote(Number(id), { title, content });
    if (!updatedNote) {
      return res.status(404).json({ message: 'Note not found' });
    }
    res.status(200).json(updatedNote);
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(500).json({ message: 'Failed to update note' });
  }
});

notesRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await deleteNote(Number(id));
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ message: 'Failed to delete note' });
  }
});

export default notesRouter;