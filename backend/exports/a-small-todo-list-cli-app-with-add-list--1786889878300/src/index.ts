import { addTodo, listTodos, completeTodo } from './todo-service';

export function run() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'add':
      const todoText = args.slice(1).join(' ');
      addTodo(todoText);
      console.log(`Added: ${todoText}`);
      break;
    case 'list':
      const todos = listTodos();
      console.log('Todos:');
      todos.forEach((todo, index) => console.log(`${index + 1}. ${todo.text} [${todo.completed ? '✓' : '✗'}]`));
      break;
    case 'complete':
      const index = parseInt(args[1], 10);
      completeTodo(index);
      console.log(`Completed item at index ${index}.`);
      break;
    default:
      console.log('Unknown command. Use: add <text>, list, complete <index>');
  }
}

run();