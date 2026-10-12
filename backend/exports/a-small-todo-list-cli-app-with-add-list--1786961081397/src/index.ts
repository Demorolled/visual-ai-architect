import { addTodo, listTodos, completeTodo, TodoItem } from '../todo.ts';

export function run(args: string[]): void {
  const command = args[0];
  const arg = args[1];

  if (command === 'add') {
    if (arg) {
      addTodo(arg);
      console.log('Todo added');
    } else {
      console.log('Usage: add <task>');
    }
  } else if (command === 'list') {
    const todos = listTodos();
    if (todos.length === 0) {
      console.log('No todos');
    } else {
      todos.forEach(todo => console.log(`${todo.completed ? '✓' : '✗'} ${todo.text}`));
    }
  } else if (command === 'complete') {
    if (arg) {
      const id = parseInt(arg, 10);
      if (!isNaN(id)) {
        completeTodo(id);
        console.log('Todo completed');
      } else {
        console.log('Invalid ID');
      }
    } else {
      console.log('Usage: complete <id>');
    }
  } else {
    console.log('Unknown command');
  }
}

export function main(): void {
  const args = process.argv.slice(2);
  run(args);
}