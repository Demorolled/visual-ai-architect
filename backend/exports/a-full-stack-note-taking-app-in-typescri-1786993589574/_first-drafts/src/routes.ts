import express from 'express';
import { createNote, getNotes, updateNote, deleteNote } from '../controllers/controllers.ts';

export const noteRouter = express.Router();

noteRouter.post('/notes', createNote);
noteRouter.get('/notes', getNotes);
noteRouter.put('/notes/:id', updateNote);
noteRouter.delete('/notes/:id', deleteNote);