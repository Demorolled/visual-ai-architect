import { TodoItem } from '../types.ts';

let todos: TodoItem[] = [];
let nextId = 1;

export function addTodo(text: string): void {
  todos.push({ id: nextId++, text, completed: false });
}

export function listTodos(): TodoItem[] {
  return todos;
}

export function completeTodo(id: number): void {
  const todo = todos.find(t => t.id === id);
  if (todo) {
    todo.completed = true;
  }
}