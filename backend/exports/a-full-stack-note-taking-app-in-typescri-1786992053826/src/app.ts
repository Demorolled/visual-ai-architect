import { addTodo, listTodos } from '../todo.ts';

export function run(args: string[]): void {
  const command = args[0];

  switch (command) {
    case 'add':
      if (args.length < 2) {
        console.error('Usage: add <description>');
        return;
      }
      const description = args.slice(1).join(' ');
      try {
        addTodo(description);
        console.log(`Added: ${description}`);
      } catch (err) {
        console.error('Failed to add todo:', err);
      }
      break;

    case 'list':
      try {
        const todos = listTodos();
        if (todos.length === 0) {
          console.log('No todos found');
        } else {
          todos.forEach((todo) => console.log(`[${todo.id}] ${todo.title}`));
        }
      } catch (err) {
        console.error('Failed to list todos:', err);
      }
      break;

    default:
      console.error('Unknown command. Usage: add <description> | list');
      break;
  }
}

export function main(): void {
  const args = process.argv.slice(2);
  run(args);
}