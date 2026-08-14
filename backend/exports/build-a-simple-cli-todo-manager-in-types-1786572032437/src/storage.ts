export interface TodoItem { id: number; title: string; completed: boolean; }

export function saveTodos(todos: TodoItem[]): void { globalThis.localStorage.setItem('todosV2', JSON.stringify(todos)); }

export function loadTodos(): TodoItem[] { try { const stored = globalThis.localStorage.getItem('todosV2'); if (stored) return JSON.parse(stored); } catch { } return []; }