// src/index.ts

// Entry point: parses args, orchestrates the app

import { parseArgs } from './cli';
import { addTodo, listTodos } from './todo';

async function run() {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === 'add') {
    await addTodo(args.task);
  } else if (args.command === 'list') {
    const todos = await listTodos();
    todos.forEach((todo, index) => console.log(`${index + 1}. ${todo}`));
  } else {
    console.log('Unknown command');
  }
}

run();