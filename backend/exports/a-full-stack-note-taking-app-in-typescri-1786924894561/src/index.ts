import express from 'express';
import { PORT } from '../config';
import { notesRouter } from '../interface/api';

const app = express();
app.use(express.json());
app.use('/notes', notesRouter);

export default app;