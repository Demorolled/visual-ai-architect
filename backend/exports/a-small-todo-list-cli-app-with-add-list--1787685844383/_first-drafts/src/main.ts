import { addTodo, listTodos, completeTodo } from './todo';

async function run() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'add':
      const description = args.slice(1).join(' ');
      if (!description) { console.error('Usage: add <description>'); process.exit(1); }
      await addTodo(description);
      console.log('Todo added');
      break;
    case 'list':
      const todos = await listTodos();
      todos.forEach(t => console.log(`${t.completed ? '✓' : '✗'} ${t.description}`));
      break;
    case 'complete':
      const id = parseInt(args[1], 10);
      if (isNaN(id)) { console.error('Usage: complete <id>'); process.exit(1); }
      await completeTodo(id);
      console.log('Todo completed');
      break;
    default:
      console.error('Unknown command. Usage: add <description> | list | complete <id>');
      process.exit(1);
  }
}

export { run };
run().catch(console.error);