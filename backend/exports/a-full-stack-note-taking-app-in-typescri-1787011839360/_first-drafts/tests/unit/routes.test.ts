import { describe, it, expect } from 'vitest';
import { notesRouter } from '../src/routes.ts';

describe('routes', () => {
  it('should define routes', () => {
    expect(notesRouter).toBeDefined();
  });
});
