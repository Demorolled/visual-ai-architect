export interface TodoItem {
  id: number;
  title: string;
  done: boolean;
  createdAt: string;
}

let todos: TodoItem[] = [];
let nextId = 1;

export function addTodo(title: string): void {
  todos.push({ id: nextId++, title, done: false, createdAt: new Date().toISOString() });
}

export function findTodo(id: number): TodoItem | undefined {
  return todos.find((t) => t.id === id);
}

export function toggleTodo(id: number): void {
  const todo = findTodo(id);
  if (todo) {
    todo.done = !todo.done;
  }
}

export function listTodos(): TodoItem[] {
  return todos;
}

export function main(): void {
  const __vacaHelp = process.argv.slice(2);
  if (__vacaHelp.length === 0 || __vacaHelp[0] === '--help' || __vacaHelp[0] === '-h' || __vacaHelp[0] === 'help') {
    console.log('Usage: tsx todo-list.ts add');
    console.log('');
    console.log('Commands:');
    console.log('  add');
    console.log('  list');
    console.log('  complete');
    return;
  }

  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'add':
      if (args.length === 0) {
        console.error('Usage: tsx todo-list.ts add "Task title"');
        process.exit(1);
      }
      addTodo(args.join(' '));
      console.log('Added!');
      break;
    case 'list':
      const all = listTodos();
      if (all.length === 0) {
        console.log('No todos.');
      }
      all.forEach((t) => {
        console.log(`- [${t.done ? 'X' : ' '}] ${t.title} (${t.createdAt})`);
      });
      break;
    case 'complete':
      if (args.length !== 1) {
        console.error('Usage: tsx todo-list.ts complete <id>');
        process.exit(1);
      }
      const id = Number(args[0]);
      const todo = findTodo(id);
      if (todo) {
        todo.done = true;
        console.log(`Completed: ${todo.title}`);
      } else {
        console.error(`Todo with id ${id} not found.`);
      }
      break;
    default:
      console.log('Usage: tsx todo-list.ts add | list | complete <id>');
  }
}

// Deterministic fix: the entry defines main() but never invokes it.
main();
