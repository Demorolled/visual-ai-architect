import { Task } from './types.ts';

const TASK_FILE = './tasks.json';

export function loadTasks(): Task[] {
  try {
    const data = Deno.readTextFileSync(TASK_FILE);
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function saveTasks(tasks: Task[]): void {
  Deno.writeTextFileSync(TASK_FILE, JSON.stringify(tasks, null, 2));
}