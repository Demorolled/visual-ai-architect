import { Router, Request, Response } from 'express';
import { addNote, getNotes, updateNote, deleteNote } from '../services/noteService';

const noteRoutes = Router();

noteRoutes.post('/', (req: Request, res: Response) => {
  const { content } = req.body;
  const note = addNote(content);
  res.status(201).json(note);
});

noteRoutes.get('/', (req: Request, res: Response) => {
  const notes = getNotes();
  res.json(notes);
});

noteRoutes.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { content } = req.body;
  const note = updateNote(Number(id), content);
  if (note) {
    res.json(note);
  } else {
    res.status(404).send('Note not found');
  }
});

noteRoutes.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  deleteNote(Number(id));
  res.status(204).send();
});

export { noteRoutes };