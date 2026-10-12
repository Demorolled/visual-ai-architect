import express from 'express';
import { notesRouter } from './routes/notes';

const startServer = async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/notes', notesRouter);
  const PORT = 3000;
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
};

export { startServer };