export type TodoItem = {
  id: number;
  title: string;
  done: boolean;
  createdAt: string;
};

export const TODO_KEY = 'todos.v1';

export function isTodo(item: unknown): item is TodoItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    typeof (item as TodoItem).id === 'number' &&
    typeof (item as TodoItem).title === 'string' &&
    typeof (item as TodoItem).done === 'boolean' &&
    typeof (item as TodoItem).createdAt === 'string',
  );
}
