import { notesRouter } from '../routes/notes';
import express from 'express';
import http from 'http';

const request = supertest;

describe('Notes API', () => {
  let app: express.Application;
  let server: http.Server;

  beforeEach((done) => {
    app = express();
    app.use(express.json());
    app.use('/api/notes', notesRouter);

    server = http.createServer(app).listen(3000, () => done());
  });

  afterEach((done) => {
    server.close(done);
  });

  describe('GET /api/notes', () => {
    it('should return a list of notes', async () => {
      const response = await request(app)
        .get('/api/notes');

      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('POST /api/notes', () => {
    it('should create a new note', async () => {
      const noteData = { title: 'Test Note', content: 'This is a test note.' };
      const response = await request(app)
        .post('/api/notes')
        .send(noteData);

      expect(response.statusCode).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe(noteData.title);
      expect(response.body.content).toBe(noteData.content);
    });

    it('should return 400 if title is missing', async () => {
      const noteData = { content: 'This is a test note.' };
      const response = await request(app)
        .post('/api/notes')
        .send(noteData);

      expect(response.statusCode).toBe(400);
      expect(response.body).toHaveProperty('message', 'Title is required');
    });
  });
});