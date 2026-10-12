import { notesRouter } from '../src/routes/notes.ts';
import express from 'express';
import http from 'http';

describe('Notes API', () => {
  let app: express.Application;
  let server: http.Server;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/notes', notesRouter);
    server = app.listen(3000);
  });

  afterEach(() => {
    server.close();
  });

  describe('GET /notes', () => {
    it('should return a list of notes', async () => {
      const response = await fetch('http://localhost:3000/notes');
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toBeInstanceOf(Array);
    });
  });

  describe('POST /notes', () => {
    it('should create a new note', async () => {
      const note = { title: 'Test Note', content: 'This is a test note.' };
      const response = await fetch('http://localhost:3000/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note),
      });
      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data).toHaveProperty('id');
    });
  });

  describe('GET /notes/:id', () => {
    it('should return a single note by ID', async () => {
      const note = { title: 'Test Note', content: 'This is a test note.