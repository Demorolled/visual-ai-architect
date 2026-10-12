import { createApp } from '../app.ts';

export function routes() {
  const app = createApp();

  app.get('/todos', async (req, res) => {
    try {
      const todos = await listTodos();
      res.json(todos);
    } catch (error) {
      res.status(500).json({ error: 'Failed to load todos' });
    }
  });

  app.post('/todos', async (req, res) => {
    try {
      const { title } = req.body;
      if (!title) {
        return res.status(400).json({ error: 'Title is required' });
      }
      app.add(title);
      res.status(201).json({ message: 'Todo added' });
    } catch (error) {
      res.status(400).json({ error: 'Invalid todo data' });
    }
  });

  app.put('/todos/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { title } = req.body;
      if (!title) {
        return res.status(400).json({ error: 'Title is required' });
      }
      const todos = await listTodos();
      const todo = todos.find(t => t.id === parseInt(id));
      if (!todo) {
        return res.status(404).json({ error: 'Todo not found' });
      }
      todo.title = title;
      res.json(todo);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update todo' });
    }
  });

  app.delete('/todos/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const todos = await listTodos();
      const filteredTodos = todos.filter(t => t.id !== parseInt(id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete todo' });
    }
  });

  return app;
}