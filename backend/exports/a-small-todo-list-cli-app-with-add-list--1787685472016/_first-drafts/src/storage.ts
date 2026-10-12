import { TodoItem } from './todo';

const TODO_FILE = 'todos.json';

export function loadTodos(): TodoItem[] {
  try {
    const data = require(TODO_FILE);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function saveTodos(todos: TodoItem[]): void {
  require('fs').writeFileSync(TODO_FILE, JSON.stringify(todos, null, 2), 'utf-8');
}