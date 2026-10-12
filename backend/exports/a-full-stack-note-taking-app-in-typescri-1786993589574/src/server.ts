import express from 'express';
import { noteRouter } from './routes';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use('/api/notes', noteRouter);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});