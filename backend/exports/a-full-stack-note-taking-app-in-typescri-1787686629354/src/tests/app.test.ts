import { createApp } from '../app';
import { createNote, getNotes } from '../notes';

describe('app', () => {
  it('should create a note', async () => {
    const app = createApp();
    const res = await app.inject({ method: 'POST', url: '/notes', payload: { title: 'Test', content: 'Content' } });
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  it('should list notes', async () => {
    const app = createApp();
    await app.inject({ method: 'POST', url: '/notes', payload: { title: 'Test', content: 'Content' } });
    const res = await app.inject({ method: 'GET', url: '/notes' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});