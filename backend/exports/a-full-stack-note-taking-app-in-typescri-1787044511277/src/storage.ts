import { TodoItem } from './todo';
import * as fs from 'fs';

export function loadTodos(): TodoItem[] {
  try {
    const data = fs.readFileSync('todos.json', 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

export function saveTodos(todos: TodoItem[]): void {
  const data = JSON.stringify(todos, null, 2);
  fs.writeFileSync('todos.json', data);
}