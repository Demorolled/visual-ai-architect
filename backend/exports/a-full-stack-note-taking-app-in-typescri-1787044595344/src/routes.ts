import { createNote, getNotes } from '../controller';

export function router(app) {
  app.post('/notes', (req, res) => {
    const { title, content } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }
    const note = createNote(title, content);
    res.status(201).json(note);
  });

  app.get('/notes', (req, res) => {
    const notes = getNotes();
    res.json(notes);
  });
}