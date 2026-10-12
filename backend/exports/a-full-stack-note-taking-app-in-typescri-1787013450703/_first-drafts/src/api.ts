import express, { Request, Response } from 'express';

const app = express();
app.use(express.json());

let notes: string[] = [];

app.get('/notes', (req: Request, res: Response) => {
  res.json(notes);
});

app.post('/notes', (req: Request, res: Response) => {
  const note = req.body.note;
  if (!note) {
    return res.status(400).send('Note is required');
  }
  notes.push(note);
  res.status(201).send('Note added');
});

app.delete('/notes/:index', (req: Request, res: Response) => {
  const index = parseInt(req.params.index, 10);
  if (isNaN(index) || index < 0 || index >= notes.length) {
    return res.status(404).send('Note not found');
  }
  notes.splice(index, 1);
  res.send('Note deleted');
});

export function startServer() {
  const PORT = 3000;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}
