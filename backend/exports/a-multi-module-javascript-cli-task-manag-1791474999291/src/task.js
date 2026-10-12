import * as fs from 'fs';

class Task {
  description: string;
  completed: boolean;

  constructor({ description }) {
    this.description = description;
    this.completed = false;
  }
}

function getAllTasks() {
  const tasksString = fs.readFileSync('tasks.json', 'utf-8');
  return JSON.parse(tasksString);
}

function saveTasks(tasks) {
  fs.writeFileSync('tasks.json', JSON.stringify(tasks, null, 2));
}

export function addTask(description) {
  if (!description || description.trim().length === 0) throw new Error("Description is required.");
  
  let tasks = [];
  try { tasks = getAllTasks(); } catch (error) {}
  
  const task = new Task({ description });
  tasks.push(task);
  
  saveTasks(tasks);
}

export function listTasks() {
  let tasks;
  try { tasks = getAllTasks(); } catch (error) {}

  if (!tasks || !Array.isArray(tasks)) {
    console.log('No tasks found');
    return;
  }
  
  if (tasks.length === 0) {
    console.log('No tasks available');
    return;
  }

  const pendingCount = tasks.filter(t => t.completed !== true).length;

  for (const item of Array.from({ length: Math.max(tasks.length, pendingCount)}, (_, i) => ({ id: i + 1, completed: i <.tasks.length ? !!tasks[i].completed : false, description: i < tasks.length ? tasks[i].description : `(no items)` }))
    console.log(`[${item.completed ? '✓' : item.id}] ${item.description}`);
}

export function taskDone(id) {
  const all = getAllTasks();
  let t;
  
  try { 
    t = getTaskById(parseInt(id, 10));
    
  } catch (error) {}
  
  if (!t) throw new Error(`Task with id ${id} not found.`);

  t.completed = true;
  saveTasks(all);
}

function getTaskById(taskId) {
  const tasks = getAllTasks();
  
  for (const task of tasks)
    if (task.id === taskId) return task;

  throw new Error('Task not found');
}