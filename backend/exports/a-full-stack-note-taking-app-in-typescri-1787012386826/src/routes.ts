import { NotesService, Note } from './notes';

export function routes() {
  const notesService = new NotesService();
  return {
    '/notes/create': {
      method: 'POST',
      handler: (req, res) => {
        const { title, content } = req.body;
        const note = notesService.createNote(title, content);
        res.send({ note });
      }
    },
    '/notes/:id': {
      method: 'GET',
      handler: (req, res) => {
        const note = notesService.getNotes().find(n => n.id === req.params.id);
        if (note) {
          res.send({ note });
        } else {
          res.status(404).send({ error: 'Note not found' });
        }
      }
    },
    '/notes': {
      method: 'GET',
      handler: (req, res) => {
        const notes = notesService.getNotes();
        res.send({ notes });
      }
    },
    '/notes/:id/update': {
      method: 'PUT',
      handler: (req, res) => {
        const { title, content } = req.body;
        const note = notesService.updateNote(req.params.id, title, content);
        if (note) {
          res.send({ note });
        } else {
          res.status(404).send({ error: 'Note not found' });
        }
      }
    },
    '/notes/:id/delete': {
      method: 'DELETE',
      handler: (req, res) => {
        const deleted = notesService.deleteNote(req.params.id);
        if (deleted) {
          res.send({ message: 'Note deleted' });
        } else {
          res.status(404).send({ error: 'Note not found' });
        }
      }
    }
  };
}