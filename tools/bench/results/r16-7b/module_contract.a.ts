// ============= task_store.ts =============
export function addTask(task: string): void {
  tasks.push(task);
}

export function listTasks(): string[] {
  return tasks.slice();
}

export function deleteTask(index: number): void {
  tasks.splice(index, 1);
}

const tasks: string[] = [];