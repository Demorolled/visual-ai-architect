import { Router } from 'express';

const notesRouter = Router();

let notes: { id: number, content: string }[] = [];
let nextId = 1;

notesRouter.get('/', (req, res) => {
  res.json(notes);
});

notesRouter.post('/', (req, res) => {
  const note = { id: nextId++, content: req.body.content };
  notes.push(note);
  res.status(201).json(note);
});

notesRouter.put('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const note = notes.find(n => n.id === id);
  if (note) {
    note.content = req.body.content;
    res.json(note);
  } else {
    res.status(404).send('Note not found');
  }
});

notesRouter.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  notes = notes.filter(n => n.id !== id);
  res.status(204).send();
});

export { notesRouter };
