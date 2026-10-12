import express from 'express';
import { getNotes, addNote, updateNote, deleteNote } from './notes';

const app = express();
const port = 3000;

app.use(express.json());

app.get('/notes', (req, res) => {
  res.json(getNotes());
});

app.post('/notes', (req, res) => {
  const note = addNote(req.body.content);
  res.status(201).json(note);
});

app.put('/notes/:id', (req, res) => {
  const updated = updateNote(Number(req.params.id), req.body.content);
  if (updated) {
    res.json({ message: 'Note updated' });
  } else {
    res.status(404).json({ message: 'Note not found' });
  }
});

app.delete('/notes/:id', (req, res) => {
  const deleted = deleteNote(Number(req.params.id));
  if (deleted) {
    res.json({ message: 'Note deleted' });
  } else {
    res.status(404).json({ message: 'Note not found' });
  }
});

export function startServer() {
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}