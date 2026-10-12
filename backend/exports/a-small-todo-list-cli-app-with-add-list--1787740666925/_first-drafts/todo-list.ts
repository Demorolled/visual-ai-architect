export interface TodoItem {
  id: number;
  title: string;
  done: boolean;
  createdAt: string;
}

const todos: TodoItem[] = [];
let nextId = 1;

export function addTodo(title: string): void {
  todos.push({ id: nextId, title, done: false, createdAt: new Date().toISOString() });
  nextId++;
}

export function findTodo(id: number): TodoItem | undefined {
  return todos.find((t) => t.id === id);
}

export function toggleTodo(id: number): void {
  const todo = findTodo(id);
  if (todo) {
    todo.done = !todo.done;
  }
}

export function listTodos(): TodoItem[] {
  return todos;
}

export function main(): void {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'add':
      if (args.length === 0) {
        console.error('Usage: tsx todo-list.ts add "Task title"');
        process.exit(1);
      }
      addTodo(args.join(' '));
      console.log('Added!');
      break;
    case 'list':
      const all = listTodos();
      if (all.length === 0) {
        console.log('No todos.');
        break;
      }
      all.forEach((t) => {
        console.log(`- [${t.done ? 'X' : ' '}] ${t.title} (${t.createdAt})`);
      });
      break;
    case 'complete':
      if (args.length !== 1) {
        console.