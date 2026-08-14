import { Note } from './models';
import { addNote, listNotes } from './services';

export const noteRoutes = () => {
  const router = require('express').Router();

  router.post('/api/notes', async (req, res) => {
    const newNote: Note = req.body;
    await addNote(newNote);
    res.status(201).send({ message: 'Note created' });
  });

  router.get('/api/notes', async (req, res) => {
    const notes = await listNotes();
    res.status(200).json(notes);
  });

  return router;
}
