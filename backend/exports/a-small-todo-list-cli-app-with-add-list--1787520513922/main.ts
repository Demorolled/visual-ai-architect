import { addTodo, listTodos, completeTodo } from './todo';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { Config } from './config';

const argv = yargs(hideBin(process.argv))
  .command('add <description>', 'Add a new todo', (yargs) => {
    yargs.positional('description', {
      describe: 'Todo description',
      type: 'string',
    });
  })
  .command('list', 'List all todos')
  .command('complete <id>', 'Complete a todo by id', (yargs) => {
    yargs.positional('id', {
      describe: 'Todo id',
      type: 'number',
    });
  })
  .options({
    config: {
      alias: 'c',
      demandOption: true,
      describe: 'Path to the config file',
      type: 'string',
    },
  })
  .help()
  .argv;

const configPath = argv.config;
require(`./config`).Config = { dataPath: configPath };

switch (argv._[0]) {
  case 'add':
    addTodo(argv.description);
    break;
  case 'list':
    const todos = listTodos();
    todos.forEach(todo => console.log(`${todo.id}: ${todo.description} [${todo.completed ? 'X' : ' '}]`));
    break;
  case 'complete':
    const completed = completeTodo(argv.id);
    console.log(completed ? 'Todo completed.' : 'Todo not found.');
    break;
  default:
    console.log('Unknown command. Use --help for more information.');
}