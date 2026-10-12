export interface TodoItem {
  id: number;
  description: string;
  completed: boolean;
}

let todos: TodoItem[] = [];
let nextId = 1;

export function addTodo(description: string) {
  todos.push({ id: nextId++, description, completed: false });
}

export function listTodos(): string[] {
  return todos.map(todo => `${todo.id}: ${todo.description} [${todo.completed ? '✓' : '✗'}]`);
}

export function completeTodo(id: number) {
  const todo = todos.find(t => t.id === id);
  if (todo) todo.completed = true;
}