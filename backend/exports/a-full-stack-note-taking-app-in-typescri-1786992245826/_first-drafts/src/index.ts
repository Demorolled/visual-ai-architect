import express from 'express';
import { notesRouter } from './routes/notes';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/api/notes', notesRouter);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});