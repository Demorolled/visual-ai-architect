import { TodoItem } from './todo'

export function addTodo(todos: TodoItem[], content: string): void {
  const nextId = Date.now()
  const newTodo: TodoItem = { id: nextId, title: content, completed: false }
  todos.push(newTodo)
}

export function listTodos(todos: TodoItem[]): void {
  console.log('To Do List:');
  todos.forEach((todo, index) => {
    const mark = todo.completed ? '[x]' : '[ ]';
    console.log(`${index + 1}. ${mark} ${todo.title}`);
  });
}

export function completeTodo(todos: TodoItem[], id: number): void {
  const todo = todos.find(todo => todo.id === id);
  if (todo) {
    todo.completed = true;
    console.log(`Marked ${todo.title} as completed.`);
  } else {
    console.log(`Todo with ID ${id} not found.`);
  }
}