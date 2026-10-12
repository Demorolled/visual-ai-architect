import { startServer } from '../src/server';

describe('Server', () => {
  it('should start without errors', () => {
    expect(() => startServer()).not.toThrow();
  });
});