import { TODO_KEY } from './types';
import { TodoItem } from './todo_list';
export async function loadTodos(): Promise<TodoItem[]> {
  try {
    const raw = localStorage.getItem(TODO_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p) => isTodo(p));
  } catch {
    return [];
  }
}
export async function saveTodos(todos: TodoItem[]): Promise<void> {
  try {
    localStorage.setItem(TODO_KEY, JSON.stringify(todos));
  } catch {
    console.error('Failed to save todos');
  }
}
export function nextId(todos: TodoItem[]): number {
  return todos.reduce((m, t) => Math.max(m, t.id), 0) + 1;
}
export function formatDateTime(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}