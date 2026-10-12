import { app } from '../api.ts';
import supertest from 'supertest';

const request = supertest(app);

describe('Notes API', () => {
  it('should add a note', async () => {
    const res = await request.post('/notes').send({ id: '1', title: 'Test Note', content: 'This is a test note.' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: '1', title: 'Test Note', content: 'This is a test note.' });
  });

  it('should get all notes', async () => {
    const res = await request.get('/notes');
    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(Array);
  });

  it('should delete a note', async () => {
    await request.post('/notes').send({ id: '2', title: 'Delete Note', content: 'This note will be deleted.' });
    const res = await request.delete('/notes/2');
    expect(res.status).toBe(204);
  });
});
