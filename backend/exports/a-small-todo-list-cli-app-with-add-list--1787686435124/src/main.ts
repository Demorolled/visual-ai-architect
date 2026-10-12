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
  const __vacaHelp = process.argv.slice(2);
  if (__vacaHelp.length === 0 || __vacaHelp[0] === '--help' || __vacaHelp[0] === '-h' || __vacaHelp[0] === 'help') {
    console.log('Usage: node main add <description>');
    console.log('');
    console.log('Commands:');
    console.log('  add');
    console.log('  list');
    return;
  }

  try {
    run();
  } catch (e) {
    console.error('Error:', e);
  }
}

main();