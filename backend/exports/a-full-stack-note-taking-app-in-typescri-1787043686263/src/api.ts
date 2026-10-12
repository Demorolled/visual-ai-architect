import express from 'express';
import { Note, saveNote, getNotes, deleteNote } from '../database.ts';

const app = express();
app.use(express.json());

app.post('/notes', (req, res) => {
  const note: Note = req.body;
  saveNote(note);
  res.status(201).send(note);
});

app.get('/notes', (req, res) => {
  const notes = getNotes();
  res.send(notes);
});

app.delete('/notes/:id', (req, res) => {
  const id = req.params.id;
  deleteNote(id);
  res.sendStatus(204);
});

export { app};