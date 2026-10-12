import { NotesService, createNote, getNotes, updateNote, deleteNote } from '../notes';

export const notesController = {
  create: (req, res) => {
    const note = createNote(req.body);
    res.status(201).json(note);
  },
  read: (req, res) => {
    const notes = getNotes();
    res.status(200).json(notes);
  },
  update: (req, res) => {
    const note = updateNote(req.params.id, req.body);
    if (!note) return res.status(404).json({ message: 'Note not found' });
    res.status(200).json(note);
  },
  delete: (req, res) => {
    const deleted = deleteNote(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Note not found' });
    res.status(204).send();
  }
};