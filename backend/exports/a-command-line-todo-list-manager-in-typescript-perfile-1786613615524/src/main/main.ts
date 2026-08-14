export interface Task {
  id: number;
  description: string;
  completed: boolean;
}

export class TaskStore {
  private tasks: Task[] = [];

  add(task: Task) {
    this.tasks.push(task);
  }

  list(): Task[] {
    return this.tasks;
  }

  delete(index: number) {
    if (index >= 0 && index < this.tasks.length) {
      this.tasks.splice(index, 1);
    }
  }

  edit(index: number, newTask: Task) {
    if (index >= 0 && index < this.tasks.length) {
      this.tasks[index] = newTask;
    }
  }

  complete(index: number) {
    if (index >= 0 && index < this.tasks.length) {
      this.tasks[index].completed = true;
    }
  }

  clear() {
    this.tasks = [];
  }
}

export class InputHandler {
  private onInput: (command: (command: string) => void) => void;

  constructor(onInput: (command: (command: string) => void) => void) {
    this.onInput = onInput;
  }

  onInputStart() {
    this.onInput((command: string) => {
      const parts = command.split(' ');
      const commandName = parts[0];
      const args = parts.slice(1);

      switch (commandName) {
        case 'add':
          if (args.length < 1) {
            console.error('Missing task description');
            return;
          }
          this.onAdd(args[0]);
          break;
        case 'list':
          this.onList();
          break;
        case 'delete':
          if (args.length < 1) {
            console.error('Missing task index');
            return;
          }
          this.onDelete(parseInt(args[0], 10));
          break;
        case 'edit':
          if (args.length < 2) {
            console.error('Missing task index and new task description');
            return;
          }
          this.onEdit(parseInt(args[0], 10), { description: args[1], completed: false });
          break;
        case 'complete':
          if (args.length < 1) {
            console.error('Missing task index');
            return;
          }
          this.onComplete(parseInt(args[0], 10));
          break;
        case 'clear':
          this.onClear();
          break;
        default:
          console.error('Unknown command:', commandName);
      }
    });
  }

  private onAdd(description: string) {
    const task: Task = { id: this.tasks.length, description, completed: false };
    this.tasks.push(task);
    console.log('Task added:', description);
  }

  private onList() {
    if (this.tasks.length === 0) {
      console.log('No tasks available.');
      return;
    }
    this.tasks.forEach((task, index) => {
      console.log(`- ${task.description} (${task.completed ? 'Completed' : 'Incomplete'})`);
    });
  }

  private onDelete(index: number) {
    if (index < 0 || index >= this.tasks.length) {
      console.error('Invalid task index.');
      return;
    }
    this.tasks.splice(index, 1);
    console.log(`Task ${index} deleted.`);
  }

  private onEdit(index: number, newTask: Task) {
    if (index < 0 || index >= this.tasks.length) {
      console.error('Invalid task index.');
      return;
    }
    this.tasks[index] = newTask;
    console.log(`Task ${index} edited.`);
  }

  private onComplete(index: number) {
    if (index < 0 || index >= this.tasks.length) {
      console.error('Invalid task index.');
      return;
    }
    this.tasks[index].completed = true;
    console.log(`Completed task ${index}.`);
  }

  private onClear() {
    this.tasks = [];
    console.log('All tasks cleared.');
  }
}

export function start() {
  const taskStore = new TaskStore();
  const inputHandler = new InputHandler((program) => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    readline.on('line', (input) => {
      program(input);
      readline.close();
    });
  });

  inputHandler.onInputStart((command) => {
    const parts = command.split(' ');
    const commandName = parts[0];
    const args = parts.slice(1);

    switch (commandName) {
      case 'add':
        if (args.length < 1) {
          console.error('Missing task description');
          return;
        }
        taskStore.add({ id: taskStore.tasks.length, description: args[0], completed: false });
        console.log('Task added:', args[0]);
        break;
      case 'list':
        taskStore.list();
        break;
      case 'delete':
        if (args.length < 1) {
          console.error('Missing task index');
          return;
        }
        taskStore.delete(parseInt(args[0], 10));
        break;
      case 'edit':
        if (args.length < 2) {
          console.error('Missing task index and new task description');
          return;
        }
        taskStore.edit(parseInt(args[0], 10), { description: args[1], completed: false });
        break;
      case 'complete':
        if (args.length < 1) {
          console.error('Missing task index');
          return;
        }
        taskStore.complete(parseInt(args[0], 10));
        break;
      case 'clear':
        taskStore.clear();
        console.log('All tasks cleared.');
        break;
      default:
        console.error('Unknown command:', commandName);
    }
  });
}