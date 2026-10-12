import { addTask, moveTask, listTasks } from '../src/taskService.ts';

export function addTask(task: string): void {
  // Add task logic
}

export function moveTask(taskId: number, fromColumn: TaskColumn, toColumn: TaskColumn): void {
  // Move task logic
}

export function listTasks(): Task[] {
  // List tasks logic
  return [];
}