import { startServer } from '../src/server';

describe('Express Server Tests', () => {
  let server: any;
  let app: any;

  beforeEach(async () => {
    server = await startServer();
    app = server.app;
  });

  afterEach(() => {
    server.close();
  });

  it('should return a 200 status on /health', async () => {
    const response = await fetch('http://localhost:3000/health');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.message).toBe('Server is healthy');
  });

  it('should return a 404 status on unknown route', async () => {
    const response = await fetch('http://localhost:3000/unknown');
    expect(response.status).toBe(404);
  });
});