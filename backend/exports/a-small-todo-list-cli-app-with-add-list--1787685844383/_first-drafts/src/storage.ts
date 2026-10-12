import { TodoItem } from './todo';

export async function loadTodos(): Promise<TodoItem[]> {
  try {
    const data = await fetch('http://localhost:3000/todos').then(r => r.json());
    return data.todos;
  } catch {
    return [];
  }
}

export async function saveTodos(todos: TodoItem[]): Promise<void> {
  await fetch('http://localhost:3000/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ todos })
  });
}