import { TodoItem, addTodo, listTodos, markDone } from '../todo';

export async function main(command: string, args: string[]): Promise<void> {
  switch (command) {
    case 'add':
      if (args.length === 0) {
        console.error('Usage: add <task>');
        return;
      }
      const task = args.join(' ');
      await addTodo(task);
      console.log(`Added: ${task}`);
      break;
    case 'list':
      const todos = await listTodos();
      console.log('To-Do List:');
      todos.forEach((todo) => {
        console.log(`[${todo.done ? '✓' : '✗'}] ${todo.task}`);
      });
      break;
    case 'done':
      if (args.length === 0) {
        console.error('Usage: done <index>');
        return;
      }
      const index = parseInt(args[0], 10);
      if (isNaN(index) || index < 0) {
        console.error('Invalid index');
        return;
      }
      await markDone(index);
      console.log(`Marked as done: ${index}`);
      break;
    default:
      console.error('Unknown command');
      break;
  }
}