import { TodoItem } from '../todo.ts';

const TODO_FILE_PATH = 'todos.json';

export function loadTodos(): TodoItem[] {
  try {
    const data = Deno.readTextFileSync(TODO_FILE_PATH);
    return JSON.parse(data);
  } catch (e) {
    console.error(`Error loading todos: ${e.message}`);
    return [];
  }
}

export function saveTodos(todos: TodoItem[]): void {
  try {
    Deno.writeTextFileSync(TODO_FILE_PATH, JSON.stringify(todos, null, 2));
  } catch (e) {
    console.error(`Error saving todos: ${e.message}`);
  }
}