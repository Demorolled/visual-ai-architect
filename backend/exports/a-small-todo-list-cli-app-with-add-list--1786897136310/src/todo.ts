import { TODO_FILE_PATH } from './config';

interface TodoItem {
  task: string;
  completed: boolean;
}

export function addTodo(task: string) {
  const todos = loadTodos();
  todos.push({ task, completed: false });
  saveTodos(todos);
}

export function listTodos() {
  const todos = loadTodos();
  todos.forEach((todo, index) => {
    console.log(`${index}: ${todo.completed ? '[x]' : '[ ]'} ${todo.task}`);
  });
}

export function completeTodo(index: number) {
  const todos = loadTodos();
  if (index >= 0 && index < todos.length) {
    todos[index].completed = true;
    saveTodos(todos);
  } else {
    console.log('Invalid index.');
  }
}

function loadTodos(): TodoItem[] {
  try {
    const data = require(TODO_FILE_PATH);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
}

function saveTodos(todos: TodoItem[]) {
  require('fs').writeFileSync(TODO_FILE_PATH, JSON.stringify(todos, null, 2));
}