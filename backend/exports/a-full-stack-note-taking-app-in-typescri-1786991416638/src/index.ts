import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { NoteList } from '../client/src/components/NoteList';
import { NoteForm } from '../client/src/components/NoteForm';

const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(bodyParser.json());

let notes: { id: number; title: string; content: string }[] = [];

app.get('/notes', (req, res) => {
  res.json(notes);
});

app.post('/notes', (req, res) => {
  const { title, content } = req.body;
  const newNote = { id: Date.now(), title, content };
  notes.push(newNote);
  res.status(201).json(newNote);
});

app.delete('/notes/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  notes = notes.filter(n => n.id !== id);
  res.sendStatus(204);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;