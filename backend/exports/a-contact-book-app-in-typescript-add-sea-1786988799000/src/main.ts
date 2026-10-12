import { TodoItem, addTodo, listTodos } from './todo';

export function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: ts-node main.ts add <name> <tag>');
    return;
  }

  const command = args[0];
  switch (command) {
    case 'add': {
      if (args.length < 3) {
        console.log('Missing arguments for add command');
        return;
      }
      const name = args[1];
      const tag = args[2];
      addTodo(name, tag);
      break;
    }
    case 'list': {
      const todos = listTodos();
      todos.forEach(todo => console.log(`${todo.name} (${todo.tag})`));
      break;
    }
    default:
      console.log('Unknown command');
  }
}

export function run() {
  main();
}