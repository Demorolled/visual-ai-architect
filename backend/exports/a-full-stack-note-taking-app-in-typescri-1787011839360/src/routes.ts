import express from 'express';
import { getNotes, addNote, updateNote, deleteNote } from './database';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const notes = await getNotes();
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get notes' });
  }
});

router.post('/', async (req, res) => {
  const { title, content } = req.body;
  try {
    await addNote(title, content);
    res.status(201).json({ message: 'Note added' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add note' });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;
  try {
    await updateNote(Number(id), title, content);
    res.json({ message: 'Note updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update note' });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await deleteNote(Number(id));
    res.json({ message: 'Note deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

export default router;
