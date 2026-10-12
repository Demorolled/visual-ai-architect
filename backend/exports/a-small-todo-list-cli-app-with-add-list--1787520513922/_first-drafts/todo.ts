import { TodoItem } from './types';
import { loadTodos, saveTodos } from './storage';

let idCounter = 0;

export function addTodo(description: string): void {
  const newTodo: TodoItem = { id: idCounter++, description, completed: false };
  const todos = loadTodos();
  todos.push(newTodo);
  saveTodos(todos);
}

export function listTodos(): TodoItem[] {
  return loadTodos();
}

export function completeTodo(id: number): boolean {
  const todos = loadTodos();
  const todo = todos.find(todo => todo.id === id);
  if (todo) {
    todo.completed = true;
    saveTodos(todos);
    return true;
  }
  return false;
}