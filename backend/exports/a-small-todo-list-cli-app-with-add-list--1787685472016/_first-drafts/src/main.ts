import { addTodo, listTodos, completeTodo, TodoItem } from './todo';

export async function run(args: string[]) {
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
      const completed = await completeTodo(id);
      if (completed) {
        console.log(`Completed: ${id}`);
      } else {
        console.error('Todo not found');
        process.exit(1);
      }
      break;
    default:
      console.error('Usage: todo <add|list|complete>');
      process.exit(1);
  }
}