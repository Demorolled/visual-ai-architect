import { TodoItem, addTodo, listTodos, completeTodo } from './todo';

const todos: TodoItem[] = [];

const add = () => {
  const todo = addTodo(todos);
  console.log('Added:', todo);
};

const list = () => {
  const output = listTodos(todos);
  console.log(output);
};

const complete = () => {
  const id = 1;
  const updated = completeTodo(todos, id);
  console.log('Completed:', updated);
};

add();
list();
complete();