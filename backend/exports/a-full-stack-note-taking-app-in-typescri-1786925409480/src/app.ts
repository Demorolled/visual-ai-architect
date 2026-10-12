import express from 'express';
import { getNotes, addNote, deleteNote } from './notes';
import { PORT } from './config';

class App {
  private app: express.Application;

  constructor() {
    this.app = express();
    this.app.use(express.json());
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.app.get('/notes', (req, res) => {
      res.json(getNotes());
    });

    this.app.post('/notes', (req, res) => {
      const { text } = req.body;
      addNote(text);
      res.status(201).send();
    });

    this.app.delete('/notes/:id', (req, res) => {
      const id = parseInt(req.params.id, 10);
      deleteNote(id);
      res.status(204).send();
    });
  }

  public listen(): void {
    this.app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  }
}

export function createServer(): App {
  return new App();
}