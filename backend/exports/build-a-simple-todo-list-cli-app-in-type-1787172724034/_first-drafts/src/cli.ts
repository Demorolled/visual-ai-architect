import { loadTodos, saveTodos, addTodo, listTodos, completeTodo, deleteTodo } from './storage';

const COMMANDS = ['add', 'list', 'complete', 'delete'];

function parseArgs(args: string[]): [string, string[]] {
  if (args.length < 2) return ['', []];
  const command = args[1];
  const rest = args.slice(2);
  return [command, rest];
}

async function run(args: string[]) {
  const [command, rest] = parseArgs(args);
  if (!command || !COMMANDS.includes(command)) {
    console.log('Usage: node cli.js <add|list|complete|delete> ...args');
    return;
  }

  try {
    switch (command) {
      case 'add':
        if (rest.length < 1) throw new Error('Missing task description');
        await addTodo(rest.join(' '));
        console.log('Task added');
        break;

      case 'list':
        const todos = await listTodos();
        if (todos.length === 0) {
          console.log('No tasks found');
          return;
        }
        todos.forEach((todo, index) => {
          console.log(`${index + 1}. ${todo.completed ? '[✓]' : '[ ]'} ${todo.description}`);
        });
        break;

      case 'complete':
        if (rest.length < 1) throw new Error('Missing task index');
        const index = parseInt(rest[0], 10) - 1;
        if (isNaN(index) || index < 0) throw new Error('Invalid task index');
        await completeTodo(index);
        console.log('Task completed');
        break;

      case 'delete':
        if (rest.length < 1) throw new Error('Missing task index');
        const deleteIndex = parseInt(rest[0], 10) - 1;
        if (isNaN(deleteIndex) || deleteIndex < 0) throw new Error('Invalid task index');
        await deleteTodo(deleteIndex);
        console.log('Task deleted');
        break;

      default:
        console.log('Unknown command');
        break;
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

export { run };