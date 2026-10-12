import { TodoItem } from './todo';

const TODO_FILE = 'todos.json';

export function loadTodos(): TodoItem[] {
  try {
    const data = fs.readFileSync(TODO_FILE, 'utf-8');
    return JSON.parse(data) || [];
  } catch (e) {
    return [];
  }
}

export function saveTodos(todos: TodoItem[]) {
  fs.writeFileSync(TODO_FILE, JSON.stringify(todos, null, 2));
}