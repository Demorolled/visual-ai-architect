import { addTodo, listTodos, completeTodo } from './todo';
import { parseArgs } from './args';

const [cmd, ...args] = process.argv.slice(2);
const todos = listTodos();

switch (cmd) {
  case 'add':
    addTodo(args.join(' '));
    console.log('Added:', args.join(' '));
    break;
  case 'list':
    console.log(todos.map(t => t.text).join('\n'));
    break;
  case 'complete':
    const id = parseInt(args[0]);
    if (isNaN(id)) { console.log('Use --complete <id>'); process.exit(1); }
    const completed = completeTodo(id);
    if (completed) console.log('Completed:', completed.text);
    else console.log('No todo with that ID');
    break;
  default:
    console.log('--add <text> to add');
    console.log('--list to list');
    console.log('--complete <id> to complete');
}