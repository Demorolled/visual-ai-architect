import { NoteService } from './services';
import { Note } from './models';

const noteService = new NoteService();

export async function startAPI() {
  const app = require('express')();

  app.use(require('express')().json());

  app.post('/notes', async (req, res) => {
    try {
      const newNote = await noteService.create(req.body);
      res.status(201).json(newNote);
    } catch (error) {
      res.status(400).send(error.message);
    }
  });

  app.get('/notes', async (req, res) => {
    try {
      const notes = await noteService.getAll();
      res.status(200).json(notes);
    } catch (error) {
      res.status(500).send(error.message);
    }
  });

  app.get('/notes/:id', async (req, res) => {
    try {
      const note = await noteService.get(req.params.id);
      if (!note) return res.status(404).send('Note not found');
      res.status(200).json(note);
    } catch (error) {
      res.status(500).send(error.message);
    }
  });

  app.put('/notes/:id', async (req, res) => {
    try {
      const updatedNote = await noteService.update(req.params.id, req.body);
      if (!updatedNote) return res.status(404).send('Note not found');
      res.status(200).json(updatedNote);
    } catch (error) {
      res.status(500).send(error.message);
    }
  });
}