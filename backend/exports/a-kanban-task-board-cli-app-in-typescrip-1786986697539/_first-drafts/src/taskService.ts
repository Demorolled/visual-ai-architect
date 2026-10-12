import { loadTasks, saveTasks } from './storage.ts';
import { Task, Column } from './types.ts';

export function addTask(description: string): Task {
  const task = { id: Date.now().toString(), description, column: 'todo' };
  const tasks = loadTasks();
  tasks.push(task);
  saveTasks(tasks);
  return task;
}

export function moveTask(id: string, toColumn: Column): void {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === id);
  if (task) {
    task.column = toColumn;
    saveTasks(tasks);
  }
}

export function listTasks(): Task[] {
  return loadTasks();
}