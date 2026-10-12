import { loadTodos, saveTodos } from './storage';

export interface TodoItem {
  id: number;
  description: string;
  completed: boolean;
}

let todos: TodoItem[] = [];
let nextId = 1;

export async function addTodo(description: string): Promise<TodoItem> {
  const todo: TodoItem = { id: nextId++, description, completed: false };
  todos.push(todo);
  await saveTodos(todos);
  return todo;
}

export async function listTodos(): Promise<TodoItem[]> {
  todos = await loadTodos();
  return todos;
}