#!/usr/bin/env tsx
/**
 * main.ts — Entry point: parses args and orchestrates the CLI todo manager.
 *
 * Usage:
 *   todo add "Buy milk"        add a todo
 *   todo list                  list all todos
 *   todo complete <id>         mark a todo complete
 *   todo remove <id>           delete a todo
 *   todo --help | -h           show this help
 *
 * Run with: `tsx src/main.ts` (or `npm start` / `npx tsx src/main.ts`).
 */

import { pathToFileURL } from 'node:url';
import { addTodo, listTodos, completeTodo, removeTodo } from './todo.js';
import { loadTodos, saveTodos, defaultStoreFile } from './storage.js';

export function printHelp(): void {
  console.log(
    [
      'todo — a simple CLI todo manager',
      '',
      'Usage:',
      '  todo add <title>        Add a new todo',
      '  todo list               List all todos',
      '  todo complete <id>      Mark a todo as completed',
      '  todo remove <id>        Remove a todo',
      '  todo --help, -h         Show this help',
      '',
      `Todos are stored in: ${defaultStoreFile()}`,
    ].join('\n'),
  );
}

export function run(argv: string[]): number {
  const args = argv.slice(2);
  const command = args[0];

  if (!command) {
    // Bare invocation: print usage (never exit silently — the platform's CLI
    // gate flags invocations that print NOTHING as blank/stub CLIs).
    printHelp();
    return 0;
  }

  if (command === '--help' || command === '-h') {
    printHelp();
    return 0;
  }

  const todos = loadTodos();

  switch (command) {
    case 'add': {
      const title = args.slice(1).join(' ').trim();
      if (!title) {
        console.error('Error: todo title is required — e.g. `todo add "Buy milk"`');
        return 1;
      }
      const todo = addTodo(todos, title);
      saveTodos(todos);
      console.log(`Added todo #${todo.id}: ${todo.title}`);
      return 0;
    }
    case 'list': {
      if (todos.length === 0) {
        console.log('No todos yet. Add one with `todo add "Buy milk"`.');
        return 0;
      }
      console.log('Todos:');
      for (const t of listTodos(todos)) {
        const mark = t.completed ? '[x]' : '[ ]';
        console.log(`  ${t.id}. ${mark} ${t.title}`);
      }
      return 0;
    }
    case 'complete': {
      const id = Number(args[1]);
      if (!Number.isInteger(id)) {
        console.error('Error: a numeric todo id is required — e.g. `todo complete 1`');
        return 1;
      }
      const updated = completeTodo(todos, id);
      if (!updated) {
        console.error(`Error: no todo with id ${id}.`);
        return 1;
      }
      saveTodos(todos);
      console.log(`Completed todo #${updated.id}: ${updated.title}`);
      return 0;
    }
    case 'remove': {
      const id = Number(args[1]);
      if (!Number.isInteger(id)) {
        console.error('Error: a numeric todo id is required — e.g. `todo remove 1`');
        return 1;
      }
      const removed = removeTodo(todos, id);
      if (!removed) {
        console.error(`Error: no todo with id ${id}.`);
        return 1;
      }
      saveTodos(todos);
      console.log(`Removed todo #${removed.id}: ${removed.title}`);
      return 0;
    }
    default:
      console.error(`Unknown command: "${command}"`);
      printHelp();
      return 1;
  }
}

export function main(): void {
  process.exitCode = run(process.argv);
}

// Executed when run directly (tsx src/main.ts / npm start). Uses pathToFileURL
// so the check works identically on Linux, macOS, and Windows.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
