import express from 'express';
import { getNotes, addNote } from './controllers/noteController';

const router = express.Router();

router.get('/notes', (req, res) => {
  res.json(getNotes());
});

router.post('/notes', (req, res) => {
  const note = req.body;
  addNote(note);
  res.status(201).json(note);
});

export const routes = router;