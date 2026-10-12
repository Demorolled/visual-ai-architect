import { addTodo } from '../src/todo.ts';

export function run() {
  console.log('Running...');
}

export function main() {
  const todo = addTodo('Test todo');
  console.log(todo);
}
