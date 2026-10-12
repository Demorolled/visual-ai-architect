import { TodoItem } from './todo';

let todos: TodoItem[] = [];

export async function loadTodos(): Promise<TodoItem[]> {
  return todos;
}

export async function saveTodos(items: TodoItem[]): Promise<void> {
  todos = items;
}