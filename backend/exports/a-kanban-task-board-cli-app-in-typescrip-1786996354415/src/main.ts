import { loadTasks, saveTasks } from './taskStorage.ts';

interface Task {
  id: number;
  description: string;
  column: 'todo' | 'doing' | 'done';
}

let tasks: Task[] = [];

async function run() {
  tasks = await loadTasks();
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: node main.ts <add|move|list>');
    return;
  }

  const command = args[0];
  switch (command) {
    case 'add':
      if (args.length < 3) {
        console.log('Usage: node main.ts add <description> <column>');
        return;
      }
      const description = args[1];
      const column = args[2] as 'todo' | 'doing' | 'done';
      tasks.push({ id: tasks.length + 1, description, column });
      await saveTasks(tasks);
      console.log(`Task "${description}" added to ${column}.`);
      break;
    case 'move':
      if (args.length < 3) {
        console.log('Usage: node main.ts move <taskId> <column>');
        return;
      }
      const taskId = parseInt(args[1], 10);
      const targetColumn = args[2] as 'todo' | 'doing' | 'done';
      const task = tasks.find(t => t.id === taskId);
      if (!task) {
        console.log(`Task ${taskId} not found.`);
        return;
      }
      task.column = targetColumn;
      await saveTasks(tasks);
      console.log(`Task ${taskId} moved to ${targetColumn}.`);
      break;
    case 'list':
      tasks.forEach(task => console.log(`${task.id}: ${task.description} - ${task.column}`));
      break;
    default:
      console.log('Unknown command. Use "add", "move", or "list".');
      break;
  }
}

run();