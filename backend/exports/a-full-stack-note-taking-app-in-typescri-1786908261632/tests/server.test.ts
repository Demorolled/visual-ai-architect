import { startServer } from '../src/server';
import { notesRouter } from '../src/routes/notes';

const http = require('http');
const express = require('express');
const app = express();

app.use('/notes', notesRouter);

const server = http.createServer(app);

describe('Server tests', () => {
  beforeAll(() => {
    server.listen(3000);
  });

  afterAll(() => {
    server.close();
  });

  it('should return 200 for /notes', async () => {
    const response = await fetch('http://localhost:3000/notes');
    expect(response.status).toBe(200);
  });
});