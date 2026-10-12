import { loadTodos, saveTodos } from './todo-storage';

type TodoItem = {
  text: string;
  completed: boolean;
};

let todos: TodoItem[] = [];

export function addTodo(text: string) {
  todos.push({ text, completed: false });
  saveTodos(todos);
}

export function listTodos(): TodoItem[] {
  return todos;
}

export function completeTodo(index: number) {
  if (index >= 0 && index < todos.length) {
    todos[index].completed = true;
    saveTodos(todos);
  }
}

// Load initial todos
todos = loadTodos();