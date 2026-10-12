import { describe, it, expect } from 'vitest';
import { createApp } from '../src/server.ts';

describe('server', () => {
  it('should start the server', () => {
    const app = createApp();
    expect(app).toBeDefined();
  });
});