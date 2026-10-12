import { TodoItem, addTodo, listTodos } from '../src/todo';

export function run() {
  console.log('Running...');
}

export function main() {
  const todo = addTodo('Test todo');
  console.log(todo);
}