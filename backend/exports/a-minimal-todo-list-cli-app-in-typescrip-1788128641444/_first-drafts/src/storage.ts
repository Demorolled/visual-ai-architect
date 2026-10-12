import { TodoItem } from './todo.ts';

const STORAGE_FILE = 'todos.json';

export function loadTodos(): TodoItem[] {
  try {
    const data = Deno.readTextFileSync(STORAGE_FILE);
    return JSON.parse(data) as TodoItem[];
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return [];
    }
    throw new Error(`Failed to load todos: ${error.message}`);
  }
}

export function saveTodos(todos: TodoItem[]): void {
  try {
    const data = JSON.stringify(todos, null, 2);
    Deno.writeTextFileSync(STORAGE_FILE, data);
  } catch (error) {
    throw new Error(`Failed to save todos: ${error.message}`);
  }
}