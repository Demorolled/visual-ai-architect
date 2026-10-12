export interface TodoItem {
  id: number;
  title: string;
  completed: boolean;
}

let todos: TodoItem[] = [];

export function addTodo(title: string): void {
  const id = todos.length > 0 ? todos[todos.length - 1].id + 1 : 1;
  todos.push({ id, title, completed: false });
}

export function listTodos(): TodoItem[] {
  return todos;
}