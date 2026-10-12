// src/index.ts

// Entry point: parses args, orchestrates the app

import { parseArgs } from './cli';
import { addTodo, listTodos } from './todo';

async function run() {
  const __vacaHelp = process.argv.slice(2);
  if (__vacaHelp.length === 0 || __vacaHelp[0] === '--help' || __vacaHelp[0] === '-h' || __vacaHelp[0] === 'help') {
    console.log('Usage: <tool> <command> [args]');
    return;
  }

  const args = parseArgs();

  if (args.command === 'add' && args.args.length > 0) {
    await addTodo(args.args[0]);
  } else if (args.command === 'list') {
    const todos = await listTodos();
    todos.forEach((todo, index) => console.log(`${index + 1}. ${todo}`));
  } else {
    console.log('Unknown command');
  }
}

run();