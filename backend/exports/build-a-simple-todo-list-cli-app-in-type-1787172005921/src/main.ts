import { addTodo, listTodos, completeTodo, deleteTodo, TodoItem } from './todo';

export function run(): void {
  console.log('Running todo list app...');
  // Add a new todo item
  addTodo('Buy groceries');
  addTodo('Read a book');
  // List all todo items
  const todos = listTodos();
  todos.forEach(todo => console.log(`[${todo.completed ? 'X' : ' '}] ${todo.description}`));
  // Complete a todo item
  completeTodo(0);
  // Delete a todo item
  deleteTodo(1);
  // List all todo items again
  const updatedTodos = listTodos();
  updatedTodos.forEach(todo => console.log(`[${todo.completed ? 'X' : ' '}] ${todo.description}`));
}

export function main(): void {
  console.log('Starting todo list app...');
  run();
}