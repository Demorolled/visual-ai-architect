export interface TodoItem {
  id: number;
  title: string;
  completed: boolean;
  createdAt: string;
}

const STORE_FILE = '.todos.json';

function loadTodos(): TodoItem[] {
  try {
    const raw = (JSON.parse(localStorage.getItem(STORE_FILE) ?? '[]') as unknown) as TodoItem[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveTodos(todos: TodoItem[]): void {
  localStorage.setItem(STORE_FILE, JSON.stringify(todos));
}

export function addTodo(title: string): TodoItem[] {
  const todos = loadTodos();
  const nextId = todos.reduce((max, t) => Math.max(max, t.id), 0) + 1;
  const newTodo: TodoItem = { id: nextId, title, completed: false, createdAt: new Date().toISOString() };
  return [newTodo, ...todos];
}

export function listTodos(): TodoItem[] {
  return loadTodos();
}

export function completeTodo(id: number): TodoItem[] {
  const todos = loadTodos();
  const completed = todos.find((t) => t.id === id);
  if (completed) {
    const newTodos = todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t));
    saveTodos(newTodos);
    return newTodos;
  }
  return todos;
}

export function filterTodos(filter: 'all' | 'active' | 'completed'): TodoItem[] {
  const todos = loadTodos();
  if (filter === 'active') return todos.filter((t) => !t.completed);
  if (filter === 'completed') return todos.filter((t) => t.completed);
  return todos;
}