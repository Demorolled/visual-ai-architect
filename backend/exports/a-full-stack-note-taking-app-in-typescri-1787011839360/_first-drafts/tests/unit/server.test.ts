import { describe, it, expect } from 'vitest';
import { startServer } from '../src/server.ts';

describe('server', () => {
  it('should start the server', () => {
    const app = startServer();
    expect(app).toBeDefined();
  });
});
