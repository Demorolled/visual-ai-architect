import { describe, it, expect } from 'vitest';
import { notesRouter } from '../src/routes';
import express from 'express';

describe('routes', () => {
  it('should define routes', () => {
    expect(notesRouter).toBeDefined();
  });

  it('should handle GET /notes', async () => {
    const req = {
      method: 'GET',
      url: '/notes',
    };
    const res = {
      status: (code: number) => ({ send: (data: any) => data }),
    };

    await notesRouter.handle(req, res);
    expect(res.status(200).send).toHaveBeenCalledWith([]);
  });

  it('should handle POST /notes', async () => {
    const req = {
      method: 'POST',
      url: '/notes',
      body: { title: 'Test Note', content: 'This is a test note.' },
    };
    const res = {
      status: (code: number) => ({ send: (data: any) => data }),
    };

    await notesRouter.handle(req, res);
    expect(res.status(201).send).toHaveBeenCalledWith({ id: 1, title: 'Test Note', content: 'This is a test note.' });
  });
});