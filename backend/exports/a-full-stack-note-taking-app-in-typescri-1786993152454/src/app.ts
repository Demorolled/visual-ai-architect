import { TodoItem, addTodo, listTodos } from '../todo.ts';

export function createApp() {
  const todos: TodoItem[] = [];
  return {
    add: (title: string) => todos.push(addTodo(title)),
    list: () => todos,
  };
}