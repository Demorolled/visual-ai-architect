import express from 'express';
import { routes } from './routes';

export const startServer = (port: number) => {
  const app = express();
  app.use(express.json());
  app.use('/api', routes);

  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
};