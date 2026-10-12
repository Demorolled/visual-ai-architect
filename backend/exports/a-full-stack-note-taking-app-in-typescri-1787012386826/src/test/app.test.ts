import { createApp } from '../app';

describe('createApp', () => {
  it('should create an Express app', () => {
    const app = createApp();
    expect(app).toBeDefined();
  });

  it('should have the correct routes', () => {
    const app = createApp();
    expect(app.stack.length).toBe(3);
    expect(app.stack[0].regexp.test('/notes')).toBe(true);
    expect(app.stack[1].regexp.test('/notes/:id')).toBe(true);
    expect(app.stack[2].regexp.test('/notes')).toBe(true);
  });
});

describe('testApp', () => {
  it('should handle POST /notes', async () => {
    const app = createApp();
    const req = { body: { title: 'Test Note', content: 'This is a test note.' } };
    const res = { send: jest.fn() };
    await app.stack[0].handle(req, res);
    expect(res.send).toHaveBeenCalledWith({ message: 'Note created successfully.' });
  });

  it('should handle GET /notes/:id', async () => {
    const app = createApp();
    const req = { params: { id: '1' } };
    const res = { send: jest.fn() };
    await app.stack[1].handle(req, res);
    expect(res.send).toHaveBeenCalledWith({ message: 'Note retrieved successfully.' });
  });
});