import { createApp } from '../app.ts';

export function routes() {
  const app = createApp();

  app.get('/todos', async (req, res) => {
    try {
      const todos = await loadTodos();
      res.json(todos);
    } catch (error) {
      res.status(500).json({ error: 'Failed to load todos' });
    }
  });

  app.post('/todos', async (req, res) => {
    try {
      const { title, description } = req.body;
      const todo = { title, description, completed: false };
      await saveTodos(todo);
      res.status(201).json(todo);
    } catch (error) {
      res.status(400).json({ error: 'Invalid todo data' });
    }
  });

  app.put('/todos/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { title, description, completed } = req.body;
      const todos = await loadTodos();
      const index = todos.findIndex((t) => t.id === id);
      if (index === -1) {
        return res.status(404).json({ error: 'Todo not found' });
      }
      todos[index] = { id, title, description, completed };
      await saveTodos(todos);
      res.json(todos[index]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update todo' });
    }
  });

  app.delete('/todos/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const todos = await loadTodos();
      const filteredTodos = todos.filter((t) => t.id !== id);
      await saveTodos(filteredTodos);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete todo' });
    }
  });

  return app;
}