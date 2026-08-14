export class TaskStore {
  private tasks: string[];

  constructor() {
    this.tasks = [];
  }

  addTask(task: string): void {
    if (!task || !/\w/.test(task)) {
      throw new Error('Invalid task name');
    }
    this.tasks.push(task);
  }

  getTasks(): string[] {
    return [...this.tasks];
  }
}

export function handleInput(input: string): void {
  const trimmed = input.trim();
  const taskStore = new TaskStore();

  if (trimmed === 'ADD') {
    console.log('Add a task');
  } else if (trimmed === 'LIST') {
    const tasks = taskStore.getTasks();
    tasks.forEach(task => console.log(task));
  } else if (trimmed.startsWith('EXIT')) {
    console.log('Exiting program...');
    process.exit();
  } else {
    try {
      taskStore.addTask(trimmed);
      console.log(`Added: ${trimmed}`);
    } catch (error) {
      console.error(error.message);
    }
  }
}

export function main(): void {
  handleInput('ADD');
  handleInput('LIST');
  handleInput('EXIT');
}