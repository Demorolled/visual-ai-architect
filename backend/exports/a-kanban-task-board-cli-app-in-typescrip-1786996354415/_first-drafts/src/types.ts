export interface Task {
  id: number;
  title: string;
  column: TaskColumn;
}

export type TaskColumn = 'todo' | 'doing' | 'done';