import { TodoItem, addTodo, listTodos } from '../todo/todo.ts';

export async function loadTodos(): Promise<TodoItem[]> {
  try {
    const data = await Deno.readTextFile('todos.json');
    return JSON.parse(data);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return [];
    }
    throw err;
  }
}

export async function saveTodos(todos: TodoItem[]): Promise<void> {
  const data = JSON.stringify(todos, null, 2);
  await Deno.writeTextFile('todos.json', data);
}