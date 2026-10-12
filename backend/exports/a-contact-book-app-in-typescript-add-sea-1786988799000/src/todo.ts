export interface TodoItem {
  name: string;
  tag: string;
}

const todos: TodoItem[] = [];

export function addTodo(name: string, tag: string) {
  todos.push({ name, tag });
}

export function listTodos(): TodoItem[] {
  return todos;
}