import express from 'express';
import { noteRouter } from './routes/note';

const app = express();
app.use(express.json());
app.use('/notes', noteRouter);

export const app = app;