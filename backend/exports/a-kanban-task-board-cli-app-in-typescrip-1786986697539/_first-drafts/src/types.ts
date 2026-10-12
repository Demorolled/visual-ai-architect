export interface Task {
  id: string;
  description: string;
  column: 'todo' | 'doing' | 'done';
}

export type Column = 'todo' | 'doing' | 'done';