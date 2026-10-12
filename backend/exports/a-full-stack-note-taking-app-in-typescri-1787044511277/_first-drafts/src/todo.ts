import { loadTodos, saveTodos } from '../storage.ts';

export interface TodoItem {
  id: number;
  title: string;
  completed: boolean;
}

export async function addTodo(title: string): Promise<TodoItem> {
  const todos = await loadTodos();
  const nextId = todos.length > 0 ? todos[todos.length - 1].id + 1 : 1;
  const newTodo: TodoItem = { id: nextId, title, completed: false };
  todos.push(newTodo);
  await saveTodos(todos);
  return newTodo;
}

export async function listTodos(): Promise<TodoItem[]> {
  return await loadTodos();
}