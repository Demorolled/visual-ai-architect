import { addNote, listNotes, deleteNote } from './notes';
export function run() {
  const PORT = process.env.PORT || 3000;

  const express = require('express');
  const app = express();

  app.use(express.json());

  app.post('/notes', (req, res) => {
    const { title, content } = req.body;
    addNote(title, content);
    res.status(201).send({ message: 'Note added' });
  });

  app.get('/notes', (req, res) => {
    const notes = listNotes();
    res.send({ notes });
  });

  app.delete('/notes/:id', (req, res) => {
    const id = parseInt(req.params.id);
    deleteNote(id);
    res.send({ message: 'Note deleted' });
  });

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export function main() {
  run();
}