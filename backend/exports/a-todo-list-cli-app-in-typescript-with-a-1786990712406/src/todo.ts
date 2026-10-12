import { loadTodos, saveTodos } from './storage';

export interface TodoItem {
  id: number;
  description: string;
  completed: boolean;
}

let nextId = 1;
let todos: TodoItem[] = [];

export function addTodo(description: string) {
  const todo: TodoItem = {
    id: nextId++,
    description,
    completed: false,
  };
  todos.push(todo);
  saveTodos(todos);
}

export function listTodos(): TodoItem[] {
  return todos;
}

export function markDone(id: number) {
  const todo = todos.find((t) => t.id === id);
  if (todo) {
    todo.completed = true;
    saveTodos(todos);
  }
}