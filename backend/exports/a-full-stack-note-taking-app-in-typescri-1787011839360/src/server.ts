import express from 'express';
import notesRouter from './routes';

export function startServer(port: number) {
  const app = express();
  app.use(express.json());
  app.use('/api/notes', notesRouter);
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}
