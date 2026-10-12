export interface TodoItem {
  id: number;
  title: string;
  completed: boolean;
}

export function addTodo(title: string): TodoItem {
  return {
    id: Date.now(),
    title,
    completed: false,
  };
}

export function listTodos(): TodoItem[] {
  return [];
}
