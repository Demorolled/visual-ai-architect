import { noteRoutes } from '../../../src/routes/note';
import express from 'express';
import request from 'supertest';

const app = express();
app.use(noteRoutes);

describe('Note Routes', () => {
  it('should get all notes', async () => {
    const response = await request(app).get('/notes');
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('should create a new note', async () => {
    const response = await request(app).post('/notes').send({ content: 'Test note' });
    expect(response.statusCode).toBe(201);
    expect(response.body.content).toBe('Test note');
  });
});