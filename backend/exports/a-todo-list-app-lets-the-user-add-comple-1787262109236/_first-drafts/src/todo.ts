export interface TodoItem {
  id: number;
  description: string;
  completed: boolean;
}

const todos: TodoItem[] = [];

export function addTodo(description: string): void {
  const id = Date.now();
  todos.push({ id, description, completed: false });
}

export function listTodos(): TodoItem[] {
  return todos;
}

export function completeTodo(id: number): void {
  const todo = todos.find(t => t.id === id);
  if (todo) {
    todo.completed = true;
  }
}

export function deleteTodo(id: number): void {
  todos.splice(todos.findIndex(t => t.id === id), 1);
}