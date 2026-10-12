import express from 'express';
import { routes } from './routes';

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(routes);

export const startServer = () => {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
};