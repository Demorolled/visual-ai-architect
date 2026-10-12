import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { TodoItem } from './todo';

const DATA_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'todos.json');

function loadTodos(): TodoItem[] {
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf-8')) as TodoItem[];
  } catch {
    return [];
  }
}

function saveTodos(items: TodoItem[]): void {
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));
}

function printUsage(): void {
  console.log(`Usage: todo <command> [args]

Commands:
  add <description>   Add a new todo
  list                Show all todos
  complete <id>       Mark a todo as completed
  remove <id>         Delete a todo
  help                Show this help`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h' || args[0] === 'help') {
    printUsage();
    return;
  }

  const cmd = args[0];
  const rest = args.slice(1);
  const todos = loadTodos();

  switch (cmd) {
    case 'add': {
      const description = rest.join(' ');
      if (!description) {
        console.error('Usage: todo add <description>');
        process.exitCode = 1;
        return;
      }
      const id = todos.length ? Math.max(...todos.map((t) => t.id)) + 1 : 1;
      todos.push({ id, description, completed: false });
      saveTodos(todos);
      console.log(`Added todo #${id}: ${description}`);
      break;
    }
    case 'list': {
      if (todos.length === 0) {
        console.log('No todos found.');
        return;
      }
      for (const todo of todos) {
        console.log(`${todo.completed ? '[✓]' : '[ ]'} #${todo.id} ${todo.description}`);
      }
      break;
    }
    case 'complete': {
      const id = parseInt(rest[0], 10);
      const todo = todos.find((t) => t.id === id);
      if (!todo) {
        console.error(`No todo with id ${id}. Run 'todo list' to see them.`);
        process.exitCode = 1;
        return;
      }
      todo.completed = true;
      saveTodos(todos);
      console.log(`Marked #${id} completed.`);
      break;
    }
    case 'remove': {
      const id = parseInt(rest[0], 10);
      const index = todos.findIndex((t) => t.id === id);
      if (index === -1) {
        console.error(`No todo with id ${id}. Run 'todo list' to see them.`);
        process.exitCode = 1;
        return;
      }
      todos.splice(index, 1);
      saveTodos(todos);
      console.log(`Removed #${id}.`);
      break;
    }
    default:
      console.error(`Unknown command: ${cmd}`);
      printUsage();
      process.exitCode = 1;
  }
}

void main();
