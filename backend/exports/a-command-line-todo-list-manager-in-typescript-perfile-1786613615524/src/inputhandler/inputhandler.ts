import { ProcessCommand } from '../businesslogic/businesslogic.ts';
import { TaskStore, handleInput, main } from '../tests/tests.ts';

export function handleCommand(command: string) {
    const { type, payload } = determineCommandType(command);
    switch (type) {
        case 'ADD':
            addTask(payload.title);
            break;
        case 'LIST':
            listTasks();
            break;
        case 'COMPLETE':
            completeTask(payload.taskId);
            break;
        case 'DELETE':
            deleteTask(payload.id);
            break;
        default:
            throw new Error('Unknown command type');
    }
}

function determineCommandType(command: string) {
    const parts = command.split(' ');
    if (parts.length < 2) {
        throw new Error('Invalid command format');
    }
    const type = parts[0];
    const payload = { title: '', taskId: '', id: '' };
    if (type === 'ADD') {
        payload.title = parts.slice(1).join(' ');
    } else if (type === 'COMPLETE') {
        payload.taskId = parts[1];
    } else if (type === 'DELETE') {
        payload.id = parts[1];
    }
    return { type, payload };
}

const tasks: { id: string; title: string; completed: boolean }[] = [];

function addTask(title: string) {
    const id = Math.random().toString(36).slice(2);
    tasks.push({ id, title, completed: false });
    console.log(`Added task: ${title}`);
}

function listTasks() {
    tasks.forEach((task) => {
        const completed = task.completed ? '✓' : '';
        console.log(`${task.id}: ${task.title} ${completed}`);
    });
}

function completeTask(taskId: string) {
    const task = tasks.find((t) => t.id === taskId);
    if (task) {
        task.completed = true;
        console.log(`Completed task: ${taskId}`);
    } else {
        console.error('Task not found');
    }
}

function deleteTask(id: string) {
    tasks = tasks.filter((t) => t.id !== id);
    console.log(`Deleted task with ID: ${id}`);
}