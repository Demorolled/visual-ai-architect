import { NotesService, createNote, getNotes, updateNote, deleteNote } from './notes';

export function routes() {
  return {
    '/notes': {
      method: 'POST',
      handler: (req, res) => {
        const { title, content } = req.body;
        const note = notesService.createNote(title, content);
        res.send({ note });
      }
    }
  };
}