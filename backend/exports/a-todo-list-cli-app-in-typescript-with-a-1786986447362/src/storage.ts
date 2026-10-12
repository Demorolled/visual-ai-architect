import { TodoItem } from '../todo/todo.ts';

export async function loadTodos(): Promise<TodoItem[]> {
  try {
    const response = await fetch('/todos.json');
    if (!response.ok) {
      throw new Error(`Failed to load todos: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to load todos:', error);
    return [];
  }
}

export async function saveTodos(todos: TodoItem[]): Promise<void> {
  try {
    const response = await fetch('/todos.json', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(todos),
    });
    if (!response.ok) {
      throw new Error(`Failed to save todos: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Failed to save todos:', error);
  }
}