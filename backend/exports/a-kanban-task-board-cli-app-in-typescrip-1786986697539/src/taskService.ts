import { loadTasks, saveTasks } from './storage';
import { Task, Column } from './types';

export function addTask(description: string): Task {
  const task: Task = { id: Date.now().toString(), description, column: 'todo' };
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