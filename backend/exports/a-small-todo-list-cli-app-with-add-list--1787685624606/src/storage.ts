import { TodoItem } from './todo';
import * as fs from 'fs';
import * as path from 'path';

const DATA_PATH = path.join(process.cwd(), 'todos.json');

export async function loadTodos(): Promise<TodoItem[]> {
  try {
    const data = await fs.promises.readFile(DATA_PATH, 'utf-8');
    return JSON.parse(data) as TodoItem[];
  } catch {
    return [];
  }
}

export async function saveTodos(todos: TodoItem[]): Promise<void> {
  await fs.promises.writeFile(DATA_PATH, JSON.stringify(todos, null, 2));
}