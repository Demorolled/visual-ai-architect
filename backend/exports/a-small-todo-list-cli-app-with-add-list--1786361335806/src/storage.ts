import { TodoItem } from './todo'

export async function loadTodos(): Promise<TodoItem[]> {
  try {
    const todosStr = await Deno.readTextFile('todos.json');
    return JSON.parse(todosStr) as TodoItem[];
  } catch {
    return [];
  }
}

export async function saveTodos(todos: TodoItem[]): Promise<void> {
  await Deno.writeTextFile('todos.json', JSON.stringify(todos));
}