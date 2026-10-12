import { startServer } from '../src/server';

const PORT = 3000;
let server;

beforeEach(() => {
  server = startServer(PORT);
});

afterEach(() => {
  server.close();
});

describe('Server', () => {
  it('should start listening on the specified port', () => {
    server.on('listening', () => {
      expect(server.address().port).toBe(PORT);
    });
  });
});