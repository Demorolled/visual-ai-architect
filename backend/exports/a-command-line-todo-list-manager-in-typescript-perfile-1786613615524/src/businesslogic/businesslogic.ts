import { handleCommand } from '../inputhandler/inputhandler.ts';
import '../tests/tests.ts';

export class ProcessCommand {
  constructor(private taskStore: { tasks: { id: number; description: string; completed: boolean }[] }) {}

  async processCommand(command: { type: string; id?: number; description?: string }): Promise<void> {
    try {
      switch (command.type) {
        case 'ADD':
          if (!command.description) throw new Error('Missing task description');
          this.taskStore.tasks.push({ id: this.taskStore.tasks.length + 1, description: command.description, completed: false });
          break;
        case 'LIST':
          return this.listTasks();
        case 'COMPLETE':
          if (!command.id) throw new Error('Missing task ID');
          this.taskStore.tasks = this.taskStore.tasks.map(task => (task.id === command.id ? { ...task, completed: true } : task));
          break;
        case 'DELETE':
          if (!command.id) throw new Error('Missing task ID');
          this.taskStore.tasks = this.taskStore.tasks.filter(task => task.id !== command.id);
          break;
        default:
          throw new Error('Unknown command type');
      }
    } catch (err) {
      console.error(err);
    }
  }

  private listTasks(): void {
    const tasksList = document.createElement('ul');
    this.taskStore.tasks.forEach(task => {
      const taskItem = document.createElement('li');
      taskItem.className = 'task';
      taskItem.textContent = `${task.description} — ${task.completed ? 'Completed' : 'Pending'}`;
      tasksList.appendChild(taskItem);
    });
    document.body.appendChild(tasksList);
  }
}