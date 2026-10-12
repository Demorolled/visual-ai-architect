import { addTodo, listTodos } from './todo';

export function run() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: node main add <description>');
    return;
  }

  const [command, ...description] = args;
  switch (command) {
    case 'add':
      addTodo(description.join(' '));
      break;
    case 'list':
      listTodos();
      break;
    default:
      console.log('Unknown command');
  }
}

export function main() {
  try {
    run();
  } catch (e) {
    console.error('Error:', e);
  }
}

main();