export interface TodoItem { id: number; title: string; completed: boolean; }

export function addTodo(title: string): number { return 1; }

export function listTodos(): TodoItem[] { return []; }

export function completeTodo(id: number): void {}