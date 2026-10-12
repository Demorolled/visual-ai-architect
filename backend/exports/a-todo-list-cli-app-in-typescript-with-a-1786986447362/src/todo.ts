export interface TodoItem {
  id: string;
  description: string;
  completed: boolean;
}

export function addTodo(description: string): TodoItem {
  return {
    id: Date.now().toString(),
    description,
    completed: false,
  };
}

export function listTodos(todos: TodoItem[]): string[] {
  return todos.map(todo => `${todo.completed ? '[x]' : '[ ]'} ${todo.description}`);
}

export function markDone(id: string, todos: TodoItem[]): void {
  for (const todo of todos) {
    if (todo.id === id) {
      todo.completed = true;
      break;
    }
  }
}