interface TodoItem {
  description: string;
  completed: boolean;
}

let todos: TodoItem[] = [];

export async function loadTodos(): Promise<TodoItem[]> {
  try {
    const data = await Deno.readTextFile('todos.json');
    todos = JSON.parse(data);
  } catch (error) {
    todos = [];
  }
  return todos;
}

export async function saveTodos(): Promise<void> {
  await Deno.writeTextFile('todos.json', JSON.stringify(todos, null, 2));
}

export async function addTodo(description: string): Promise<void> {
  todos.push({ description, completed: false });
  await saveTodos();
}

export async function listTodos(): Promise<TodoItem[]> {
  return todos;
}

export async function completeTodo(index: number): Promise<void> {
  if (index >= 0 && index < todos.length) {
    todos[index].completed = true;
    await saveTodos();
  }
}

export async function deleteTodo(index: number): Promise<void> {
  if (index >= 0 && index < todos.length) {
    todos.splice(index, 1);
    await saveTodos();
  }
}