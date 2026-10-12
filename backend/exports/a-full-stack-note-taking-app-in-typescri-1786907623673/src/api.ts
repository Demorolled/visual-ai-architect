import express from 'express';
import { getNotes, addNote, updateNote, deleteNote } from './services/noteService';

const app = express();
app.use(express.json());

app.get('/notes', (req, res) => {
  res.json(getNotes());
});

app.post('/notes', (req, res) => {
  addNote(req.body);
  res.sendStatus(201);
});

app.put('/notes/:id', (req, res) => {
  updateNote(Number(req.params.id), req.body.content);
  res.sendStatus(200);
});

app.delete('/notes/:id', (req, res) => {
  deleteNote(Number(req.params.id));
  res.sendStatus(200);
});

export { app };