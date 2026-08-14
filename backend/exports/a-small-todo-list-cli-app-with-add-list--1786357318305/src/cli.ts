import { TodoItem, addTodo, listTodos, completeTodo } from './todo';

export function handleAddTodo(title: string): void { addTodo(title); }

export function handleListTodos(): void { const todos = listTodos(); console.log(todos); }

export function handleCompleteTodo(id: number): void { completeTodo(id); }

handleAddTodo('Learn TypeScript');
handleListTodos();
handleCompleteTodo(1);