import { addTask } from '../src/task.js';

function handleInput(input) {
  const args = input.trim().split(/\s+/);
  if (args.length < 1 || !['add', 'list', 'done'].includes(args[0])) {
    console.error('Invalid command');
    return;
  }

  switch (args[0]) {
    case 'add':
      if (args.length !== 2) {
        console.error("Please provide the task text after 'add' e.g. add Read a book");
        return;
      }
      addTask(args[1]);
      console.log('Added:', args[1]);
      break;

    // Add more cases here as you implement list and done commands
    default:
      console.error('Invalid command');
  }
}

module.exports = { handleInput };