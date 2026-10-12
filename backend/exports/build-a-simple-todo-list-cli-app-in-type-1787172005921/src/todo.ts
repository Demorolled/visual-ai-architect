export class TodoItem {
  id: number;
  description: string;
  completed: boolean;

  constructor(description: string) {
    this.id = Date.now();
    this.description = description;
    this.completed = false;
  }
}

export function addTodo(description: string): void {
  const todo = new TodoItem(description);
  const todos = loadTodos();
  todos.push(todo);
  saveTodos(todos);
}

export function listTodos(): TodoItem[] {
  return loadTodos();
}

export function completeTodo(todoId: number): void {
  const todos = loadTodos();
  const todo = todos.find(todo => todo.id === todoId);
  if (todo) {
    todo.completed = true;
    saveTodos(todos);
  } else {
    console.log('Todo not found.');
  }
}

export function deleteTodo(todoId: number): void {
  const todos = loadTodos();
  const updatedTodos = todos.filter(todo => todo.id !== todoId);
  saveTodos(updatedTodos);
}