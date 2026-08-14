export interface Todo { title: string; done: boolean; }
export function addTodo(title: string, todos: Todo[]): void { todos.push({ title, done: false }); }
export function listTodos(todos: Todo[]): void { todos.forEach(t => console.log(`- [${t.done ? 'x' ? ' '}]\t${t.title}`)); }
export function loadTodos(): Todo[] { return []; }
export function saveTodos(todos: Todo[]): void { }
export type { Todo };
const add = addTodo; const printTodos = listTodos; const todos = []; if (process.argv.length < 3) { add('Walk the dog', todos); add('Buy groceries', todos); add('Call mom', todos); printTodos(todos); }