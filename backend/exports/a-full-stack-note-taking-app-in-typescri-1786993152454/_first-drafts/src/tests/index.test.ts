import { routes } from '../routes.ts';

export function runTests() {
  describe('routes', () => {
    it('should handle GET /todos', async () => {
      const app = await routes();
      const response = await app.handle({ method: 'GET', url: '/todos' });
      expect(response.statusCode).toBe(200);
    });

    it('should handle POST /todos', async () => {
      const app = await routes();
      const response = await app.handle({ method: 'POST', url: '/todos', body: { title: 'Test', description: 'Test' } });
      expect(response.statusCode).toBe(201);
    });

    it('should handle PUT /todos/:id', async () => {
      const app = await routes();
      const response = await app.handle({ method: 'PUT', url: '/todos/1', body: { title: 'Test', description: 'Test', completed: true } });
      expect(response.statusCode).toBe(200);
    });

    it('should handle DELETE /todos/:id', async () => {
      const app = await routes();
      const response = await app.handle({ method: 'DELETE', url: '/todos/1' });
      expect(response.statusCode).toBe(204);
    });
  });
}