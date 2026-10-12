export interface TodoItem {
  id: number;
  description: string;
}

export function addTodo(description: string) {
  const newItem = { id: Date.now(), description };
  console.log('Added:', newItem);
  return newItem;
}