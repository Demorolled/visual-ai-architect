import { addTodo, listTodos, markDone } from './todo';

export function run() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'add') {
    const description = args.slice(1).join(' ');
    if (!description) {
      console.error('Usage: add <description>');
      return;
    }
    addTodo(description);
    console.log(`Added: ${description}`);
  } else if (command === 'list') {
    const todos = listTodos();
    if (todos.length === 0) {
      console.log('No todos found');
      return;
    }
    todos.forEach((todo) => {
      console.log(`${todo.id}: ${todo.description} [${todo.completed ? '✓' : '✗'}]`);
    });
  } else if (command === 'done') {
    const id = Number(args[1]);
    if (isNaN(id)) {
      console.error('Usage: done <id>');
      return;
    }
    markDone(id);
    console.log(`Marked as done: ${id}`);
  } else {
    console.error('Unknown command. Use: add <description> | list | done <id>');
  }
}

export function main() {
  run();
}