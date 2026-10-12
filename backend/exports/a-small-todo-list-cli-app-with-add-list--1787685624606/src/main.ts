import { addTodo, listTodos } from './todo';

export async function run() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === 'add') {
    const desc = args.slice(1).join(' ');
    if (!desc) { console.error('Missing description'); process.exit(1); }
    await addTodo(desc);
    console.log('Todo added');
  } else if (cmd === 'list') {
    const todos = await listTodos();
    todos.forEach(t => console.log(`${t.id}: ${t.description} [${t.completed ? '✓' : '✗'}]`));
  } else {
    console.error('Unknown command'); process.exit(1);
  }
}

export async function main() {
  const __vacaHelp = process.argv.slice(2);
  if (__vacaHelp.length === 0 || __vacaHelp[0] === '--help' || __vacaHelp[0] === '-h' || __vacaHelp[0] === 'help') {
    console.log('Usage: <tool> <command> [args]');
    return;
  }

  try {
    await run();
  } catch (e) {
    console.error('Unexpected error:', e);
    process.exit(1);
  }
}

// Deterministic fix: the entry defines main() but never invokes it.
void main();
