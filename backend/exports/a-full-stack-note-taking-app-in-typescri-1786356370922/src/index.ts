import express from 'express';
import { createServer } from 'http';
import { notesRouter } from './routes/notes';
import { Note } from './types';

const app = express();
const PORT = process.env.PORT || 3000;
app.use('/api/notes', notesRouter);
createServer(app).listen(PORT, () => console.log(`Server running on port ${PORT}`));