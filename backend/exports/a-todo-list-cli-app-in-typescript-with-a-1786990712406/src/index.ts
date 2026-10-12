const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'todos.json');

let todos = [];

function loadTodos() {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    todos = JSON.parse(data) || [];
  } catch (e) {
    todos = [];
  }
}

function saveTodos() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(todos, null, 2));
}

function addTodo(description) {
  loadTodos();
  const newTodo = { id: Date.now(), description, completed: false };
  todos.push(newTodo);
  saveTodos();
}

function listTodos() {
  loadTodos();
  return todos;
}

function markDone(id) {
  loadTodos();
  const todo = todos.find(t => t.id === id);
  if (todo) {
    todo.completed = true;
    saveTodos();
  }
}

export function run() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'add') {
    const description = args.slice(1).join(' ');
    if (!description) {
      console.error('Usage: add <description>');
      return;
    }
    addTodo(description);
    console.log(`Added: ${description}`);
  } else if (command === 'list') {
    const todos = listTodos();
    if (todos.length === 0) {
      console.log('No todos found');
      return;
    }
    todos.forEach((todo) => {
      console.log(`${todo.id}: ${todo.description} [${todo.completed ? '✓' : '✗'}]`);
    });
  } else if (command === 'done') {
    const id = Number(args[1]);
    if (isNaN(id)) {
      console.error('Usage: done <id>');
      return;
    }
    markDone(id);
    console.log(`Marked as done: ${id}`);
  } else {
    console.error('Unknown command. Use: add <description> | list | done <id>');
  }
}

export function main() {
  run();
}