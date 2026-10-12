export interface TodoItem {
  id: number;
  description: string;
  completed: boolean;
}

let todos: TodoItem[] = [];

export async function addTodo(description: string): Promise<TodoItem> {
  const id = todos.length + 1;
  const todo: TodoItem = { id, description, completed: false };
  todos.push(todo);
  return todo;
}

export async function listTodos(): Promise<TodoItem[]> {
  return todos;
}

export async function completeTodo(id: number): Promise<void> {
  const todo = todos.find((t) => t.id === id);
  if (todo) {
    todo.completed = true;
  }
}