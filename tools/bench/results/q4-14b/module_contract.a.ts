export function addTask(title: string) {
  const tasks = [];
  tasks.push({ id: Date.now(), title, completed: false });
  return tasks;
}

export function listTasks() {
  const tasks = [];
  return tasks;
}

export function deleteTask(id: number) {
  const tasks = [];
  tasks = tasks.filter(t => t.id !== id);
  return tasks;
}