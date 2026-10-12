import express from 'express';
import { noteRoutes } from './routes';

const app = express();
app.use(express.json());
app.use('/api', noteRoutes);

export { app };