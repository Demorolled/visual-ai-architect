import { runApp } from '../ui/ui.ts';
import { Task, App, renderTasks, renderEmptyState, render, addTask, toggleTask, removeTask, clearAll } from '../guilayout/guilayout.ts';

export function renderCLIPrompt() {
  try {
    const input = prompt('Enter a command: ');
    executeCommand(input);
  } catch (error) {
    handleError(error.message);
  }
}

function executeCommand(command: string) {
  switch (command.toLowerCase()) {
    case 'add':
      addTask();
      break;
    case 'list':
      listTasks();
      break;
    case 'done':
      handleDoneTask(parseInt(command.split(' ')[1]));
      break;
    case 'clear':
      clearAll();
      break;
    case 'exit':
      process.exit();
      break;
    default:
      console.log('Unknown command. Try add, list, done, clear, or exit.');
  }
}

function addTask() {
  const title = prompt('Enter a task title: ');
  if (!title) return;
  const task = { id: Date.now(), title, completed: false };
  tasks.push(task);
  saveTasks();
  console.log(`Task added: ${task.title}`);
}

function listTasks() {
  if (tasks.length === 0) {
    console.log('No tasks to display.');
    return;
  }
  tasks.forEach((task) => {
    const mark = task.completed ? '[x]' : '[ ]';
    console.log(`${mark} ${task.title}`);
  });
}

function handleDoneTask(index: number) {
  if (index < 1 || index > tasks.length) {
    console.log('Invalid task index.');
    return;
  }
  tasks[index - 1].completed = true;
  saveTasks();
  console.log(`Task marked as done: ${tasks[index - 1].title}`);
}

function clearAll() {
  tasks.length = 0;
  saveTasks();
  console.log('All tasks cleared.');
}

function saveTasks() {
  const tasksData = tasks.map((task) => ({ id: task.id, title: task.title, completed: task.completed }));
  const tasksJson = JSON.stringify(tasksData);
  const fs = require('fs');
  fs.writeFileSync('tasks.json', tasksJson);
}

function loadTasks() {
  try {
    const data = fs.readFileSync('tasks.json', 'utf-8');
    const tasksData = JSON.parse(data) as { id: number; title: string; completed: boolean }[];
    tasksData.forEach((taskData) => {
      const task = { id: taskData.id, title: taskData.title, completed: taskData.completed };
      tasks.push(task);
    });
  } catch (error) {
    console.error('Failed to load tasks:', error);
  }
}

function handleError(message: string) {
  console.error(`Error: ${message}`);
}

const tasks: { id: number; title: string; completed: boolean }[] = [];

loadTasks();