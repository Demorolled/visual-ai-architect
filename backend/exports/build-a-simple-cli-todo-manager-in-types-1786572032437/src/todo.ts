export interface TodoItem { id: number; title: string; completed: boolean; }
export function addTodo(todos: TodoItem[], title: string): void { const newTodo: TodoItem = { id: todos.length + 1, title, completed: false }; todos.push(newTodo); }
export function listTodos(todos: TodoItem[]): void { todos.forEach((todo) => { console.log(`- [${todo.completed ? 'x' : ' '}] ${todo.title}`); }); }