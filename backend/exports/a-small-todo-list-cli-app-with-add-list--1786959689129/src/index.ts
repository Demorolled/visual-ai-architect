const todos = [];

function addTodo(description) {
  todos.push({ id: todos.length + 1, description, completed: false });
}

function listTodos() {
  return todos.map(todo => `${todo.id}. ${todo.description} [${todo.completed ? '✓' : '✗'}]`);
}

function completeTodo(id) {
  const todo = todos.find(todo => todo.id === id);
  if (todo) {
    todo.completed = true;
  }
}

function run() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'add':
      const description = args.slice(1).join(' ');
      if (!description) {
        console.log('Please provide a description for the todo.');
        return;
      }
      addTodo(description);
      console.log('Todo added successfully!');
      break;
    case 'list':
      const todosList = listTodos();
      if (todosList.length === 0) {
        console.log('No todos found.');
      } else {
        console.log('Your Todos:');
        console.log(todosList.join('\n'));
      }
      break;
    case 'complete':
      const id = parseInt(args[1], 10);
      if (isNaN(id)) {
        console.log('Please provide a valid todo ID.');
        return;
      }
      completeTodo(id);
      console.log('Todo completed!');
      break;
    default:
      console.log('Unknown command. Use add, list, or complete.');
      break;
  }
}

run();