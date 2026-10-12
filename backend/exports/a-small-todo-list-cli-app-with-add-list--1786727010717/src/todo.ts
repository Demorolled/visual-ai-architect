export interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

export function addTodo(todos: Todo[], title: string): number {
  const id = todos.length + 1;
  todos.push({ id, title, completed: false });
  return id;
}

export function listTodos(todos: Todo[]): void {
  todos.forEach((t) => console.log(t.id, t.title, t.completed ? '✓' : '✗'));
}

export function completeTodo(todos: Todo[], id: number): void {
  const idx = todos.findIndex((t) => t.id === id);
  if (idx !== -1) {
    todos[idx].completed = true;
  }
}