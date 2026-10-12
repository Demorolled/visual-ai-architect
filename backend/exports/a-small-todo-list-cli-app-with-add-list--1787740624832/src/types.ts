export type TodoItem = {
  id: number;
  title: string;
  done: boolean;
  createdAt: string;
};

export const TODO_KEY = 'todos.v1';