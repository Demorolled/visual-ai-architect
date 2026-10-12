import { addTodo, listTodos, completeTodo, TodoItem } from './todo';

export async function run(args: string[]) {
  const __vacaHelp = process.argv.slice(2);
  if (__vacaHelp.length === 0 || __vacaHelp[0] === '--help' || __vacaHelp[0] === '-h' || __vacaHelp[0] === 'help') {
    console.log('Usage: todo add <description>');
    console.log('');
    console.log('Commands:');
    console.log('  add');
    console.log('  list');
    console.log('  complete');
    return;
  }

  const command = args[0];

  switch (command) {
    case 'add':
      const description = args.slice(1).join(' ');
      if (!description) {
        console.error('Usage: todo add <description>');
        process.exit(1);
      }
      const todo: TodoItem = await addTodo(description);
      console.log(`Added: ${todo.description}`);
      break;
    case 'list':
      const todos = await listTodos();
      if (todos.length === 0) {
        console.log('No todos');
      } else {
        todos.forEach((t) => {
          console.log(`[${t.completed ? '✓' : '✗'}] ${t.description}`);
        });
      }
      break;
    case 'complete':
      const id = parseInt(args[1], 10);
      if (isNaN(id)) {
        console.error('Usage: todo complete <id>');
        process.exit(1);
      }
      try {
        await completeTodo(id);
        console.log(`Completed: ${id}`);
      } catch {
        console.error('Todo not found');
        process.exit(1);
      }
      break;
    default:
      console.error('Usage: todo <add|list|complete>');
      process.exit(1);
  }
}