import express from 'express';
import { notesRouter } from './routes.js';

const app = express();
const PORT = 3000;

app.use(express.json());

app.use('/api', notesRouter);

export function startServer(): void {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}