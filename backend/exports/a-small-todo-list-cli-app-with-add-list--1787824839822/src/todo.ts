export interface TodoItem {
  id: number;
  description: string;
  completed: boolean;
}

export function addTodo(todos: TodoItem[]): TodoItem[] {
  return [...todos, { id: Date.now(), description: '', completed: false }];
}

export function listTodos(todos: TodoItem[]): string {
  return JSON.stringify(todos);
}

export function completeTodo(todos: TodoItem[], id: number): TodoItem[] {
  return todos.map(t => t.id === id ? { ...t, completed: true } : t);
}
