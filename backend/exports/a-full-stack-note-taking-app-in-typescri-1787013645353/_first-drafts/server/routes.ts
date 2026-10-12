import { Router } from 'express';
import { getNotes, createNote, updateNote, deleteNote } from '../controllers.ts';

const notesRouter = Router();

notesRouter.get('/', (req, res) => {
  const notes = getNotes();
  res.json(notes);
});

notesRouter.post('/', (req, res) => {
  const { title, content } = req.body;
  const note = createNote(title, content);
  res.status(201).json(note);
});

notesRouter.put('/:id', (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;
  const note = updateNote(id, title, content);
  if (note) {
    res.json(note);
  } else {
    res.status(404).json({ message: 'Note not found' });
  }
});

notesRouter.delete('/:id', (req, res) => {
  const { id } = req.params;
  const deleted = deleteNote(id);
  if (deleted) {
    res.status(204).send();
  } else {
    res.status(404).json({ message: 'Note not found' });
  }
});

export { notesRouter };
