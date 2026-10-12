import { loadTasks, saveTasks } from './storage.ts';
import { Task } from './types.ts';

export function run(): void {
  const args = Deno.args;
  if (args.length === 0) {
    console.log('Usage: kanban add <description>');
    Deno.exit(1);
  }

  const task = { id: Date.now().toString(), description: args[0], column: 'todo' };
  const tasks = loadTasks();
  tasks.push(task);
  saveTasks(tasks);

  console.log('Task added:', task.description);
}

export function main(): void {
  run();
}

if (import.meta.main) {
  main();
}