import express, { Request, Response } from 'express';
import { Note } from '../models';

const notes: Note[] = [];
const app = express();

app.use(express.json());

app.get('/notes', (req: Request, res: Response) => {
  res.json(notes);
});

app.post('/notes', (req: Request, res: Response) => {
  const note: Note = req.body;
  notes.push(note);
  res.status(201).send(note);
});

export async function startServer(): Promise<void> {
  app.listen(3000, () => {
    console.log('Server started on port 3000');
  });
}