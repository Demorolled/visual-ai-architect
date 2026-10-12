import express from 'express';
import { router } from '../src/routes';

export function startServer(port: number) {
  const app = express();
  app.use(express.json());
  router(app);
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}