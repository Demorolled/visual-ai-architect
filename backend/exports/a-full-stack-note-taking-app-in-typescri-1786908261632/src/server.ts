import express from 'express';
import { notesRouter } from './routes/notes';

const app = express();
app.use(express.json());
app.use('/api', notesRouter);

export function startServer(port: number): void {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}