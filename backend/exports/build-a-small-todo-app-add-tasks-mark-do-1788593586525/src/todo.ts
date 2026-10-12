import { v4 as uuidv4 } from 'uuid';

interface Task {
    id: string;
    text: string;
    done: boolean;
}

const KEY = 'todos-v1';

export function addTask(text: string): void {
    const task = { id: uuidv4(), text, done: false };
    const tasks = getTasks();
    tasks.push(task);
    saveTasks(tasks);
}

export function toggleTaskDone(id: string): void {
    const tasks = getTasks();
    const taskIndex = tasks.findIndex(t => t.id === id);
    if (taskIndex !== -1) {
        tasks[taskIndex].done = !tasks[taskIndex].done;
        saveTasks(tasks);
    }
}

export function deleteTask(id: string): void {
    const tasks = getTasks();
    saveTasks(tasks.filter(t => t.id !== id));
}

export function getTasks(): Task[] {
    const tasksStr = localStorage.getItem(KEY);
    return tasksStr ? JSON.parse(tasksStr) : [];
}

function saveTasks(tasks: Task[]): void {
    localStorage.setItem(KEY, JSON.stringify(tasks));
}