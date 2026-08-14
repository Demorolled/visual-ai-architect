/**
 * todo.ts — Todo item type and CRUD operations.
 */

export interface TodoItem {
  id: number;
  title: string;
  completed: boolean;
  createdAt: string;
}

/** Next id is derived from the live list so ids survive process restarts. */
export function nextTodoId(list: TodoItem[]): number {
  return list.reduce((max, t) => Math.max(max, t.id), 0) + 1;
}

export function addTodo(list: TodoItem[], title: string): TodoItem {
  const todo: TodoItem = {
    id: nextTodoId(list),
    title: title.trim(),
    completed: false,
    createdAt: new Date().toISOString(),
  };
  list.push(todo);
  return todo;
}

export function listTodos(list: TodoItem[]): TodoItem[] {
  return [...list];
}

export function completeTodo(list: TodoItem[], id: number): TodoItem | null {
  const todo = list.find((t) => t.id === id);
  if (!todo) return null;
  todo.completed = true;
  return todo;
}

export function removeTodo(list: TodoItem[], id: number): TodoItem | null {
  const index = list.findIndex((t) => t.id === id);
  if (index === -1) return null;
  return list.splice(index, 1)[0];
}
