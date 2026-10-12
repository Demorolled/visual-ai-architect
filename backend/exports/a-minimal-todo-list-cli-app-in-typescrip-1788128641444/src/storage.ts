import { TodoItem } from './types';

const STORAGE_FILE = 'todos.json';

type Storage = {
  loadTodos(): TodoItem[];
  saveTodos(todos: TodoItem[]): void;
};

export const storage: Storage = {
  loadTodos(): TodoItem[] {
    try {
      const data = Deno.readTextFileSync(STORAGE_FILE);
      return JSON.parse(data) as TodoItem[];
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return [];
      }
      throw new Error(`Failed to load todos: ${error.message}`);
    }
  },

  saveTodos(todos: TodoItem[]): void {
    try {
      const data = JSON.stringify(todos, null, 2);
      Deno.writeTextFileSync(STORAGE_FILE, data);
    } catch (error) {
      throw new Error(`Failed to save todos: ${error.message}`);
    }
  }
};