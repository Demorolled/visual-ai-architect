import { TodoItem, addTodo, listTodos } from './todo';

export async function run() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.log('Usage: node main.js add <description>');
    return;
  }

  const command = args[0];
  const description = args.slice(1).join(' ');

  try {
    switch (command) {
      case 'add':
        const todo = await addTodo(description);
        console.log(`Added: ${todo.description}`);
        break;
      case 'list':
        const todos = await listTodos();
        todos.forEach(t => console.log(`${t.id}: ${t.description} (${t.completed ? 'Done' : 'Pending'})`));
        break;
      case 'complete':
        if (!description) {
          console.log('Usage: node main.js complete <id>');
          return;
        }
        await completeTodo(parseInt(description, 10));
        console.log(`Completed: ${description}`);
        break;
      default:
        console.log('Unknown command. Use `add`, `list`, or `complete`');
        break;
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

async function completeTodo(id: number) {
  const todos = await listTodos();
  const todo = todos.find(t => t.id === id);
  if (!todo) {
    throw new Error('Todo not found');
  }
  todo.completed = true;
}