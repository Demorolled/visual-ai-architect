import { TodoItem } from './todo';

const STORAGE_FILE = 'todos.json';

export function loadTodos(): TodoItem[] {
  try {
    const data = require(STORAGE_FILE);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function saveTodos(todos: TodoItem[]) {
  const fs = require('fs');
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(todos, null, 2));
}