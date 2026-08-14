export interface Task {
  title: string;
  completed: boolean;
  priority: number;
  dueDate?: Date;
}

export class TaskList {
  private tasks: Task[] = [];

  constructor() {}

  addTask(title: string, priority: number, dueDate?: Date) {
    if (this.findTaskByTitle(title)) {
      throw new Error(`Task with title '${title}' already exists`);
    }
    this.tasks.push({ title, completed: false, priority, dueDate });
  }

  findTaskByTitle(title: string): Task | undefined {
    return this.tasks.find((task) => task.title === title);
  }

  updateTaskCompletion(title: string, completed: boolean) {
    const task = this.findTaskByTitle(title);
    if (task) {
      task.completed = completed;
      return task;
    }
    return undefined;
  }

  deleteTask(title: string) {
    this.tasks = this.tasks.filter((task) => task.title !== title);
  }

  getAllTasks(): Task[] {
    return this.tasks;
  }
}