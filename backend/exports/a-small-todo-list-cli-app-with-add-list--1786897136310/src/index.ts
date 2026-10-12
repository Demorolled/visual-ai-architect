import { addTodo, listTodos, completeTodo } from './todo';

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'add':
      const task = args.slice(1).join(' ');
      addTodo(task);
      console.log(`Added: ${task}`);
      break;
    case 'list':
      const todos = listTodos();
      console.log('Todos:');
      todos.forEach((todo, index) => {
        console.log(`${index + 1}: ${todo}`);
      });
      break;
    case 'complete':
      const index = parseInt(args[1], 10);
      if (completeTodo(index)) {
        console.log(`Completed todo at index ${index}`);
      } else {
        console.log(`No todo at index ${index}`);
      }
      break;
    default:
      console.log('Unknown command. Use: add <task>, list, complete <index>');
  }
}

main();