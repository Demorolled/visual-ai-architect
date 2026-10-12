export interface Todo {
  id: number;
  title: string;
  completed: boolean;
}
export function addTodo(title: string): Todo {
  const id = Date.now();
  return { id, title, completed: false };
}
export function listTodos(): Todo[] {
  return [];
}
export function completeTodo(id: number): boolean {
  return false;
}
export function loadTodos(): Todo[] {
  return [];
}
export function saveTodos(todos: Todo[]): void {
  return;
}