import { loadTodos, saveTodos } from './storage';
import { TodoItem } from '../types';

export function addTodo(todo: string): void {
  const todos = loadTodos();
  const newTodo: TodoItem = { id: Date.now().toString(), text: todo };
  todos.push(newTodo);
  saveTodos(todos);
}

export function listTodos(): TodoItem[] {
  return loadTodos();
}