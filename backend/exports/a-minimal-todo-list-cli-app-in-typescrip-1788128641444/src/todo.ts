import { storage } from './storage';

export interface TodoItem {
  id: string;
  task: string;
  completed: boolean;
}

export function addTodo(todo: string): void {
  const todos = storage.loadTodos();
  const newTodo: TodoItem = { id: Date.now().toString(), task: todo, completed: false };
  todos.push(newTodo);
  storage.saveTodos(todos);
}

export function listTodos(): TodoItem[] {
  return storage.loadTodos();
}