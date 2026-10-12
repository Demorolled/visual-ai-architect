export interface TodoItem {
  id: number;
  description: string;
  completed: boolean;
}

let todos: TodoItem[] = [];
let nextId = 1;

export function addTodo(description: string) {
  const todo: TodoItem = { id: nextId++, description, completed: false };
  todos.push(todo);
  console.log('Added:', todo);
}

export function listTodos() {
  console.log('Todos:', todos);
}