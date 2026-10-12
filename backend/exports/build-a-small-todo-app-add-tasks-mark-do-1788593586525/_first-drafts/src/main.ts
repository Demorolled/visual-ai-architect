import { addTask, toggleTaskDone, deleteTask, getTasks } from './todo';
const taskListElement = document.getElementById('task-list')!;
const newTaskInput = document.getElementById('new-task-input') as HTMLInputElement;
const addTaskButton = document.getElementById('add-task-button')!;

function renderTasks() {
taskListElement.innerHTML = '';
const tasks = getTasks();
tasks.forEach(task => {
const taskElement = document.createElement('li');
taskElement.className = 'flex justify-between items-center py-2';
taskElement.textContent = task.text;
const doneClass = task.done ? 'line-through text-green-500' : 'text-white';
taskElement.classList.add(doneClass);

const doneButton = document.createElement('button');
doneButton.className = `btn mr-2 ${task.done ? 'btn-success' : 'btn-primary'}`;
doneButton.textContent = task.done ? 'Undo' : 'Done';
doneButton.addEventListener('click', () => {
toggleTaskDone(task.id);
renderTasks();
});

const deleteButton = document.createElement('button');
deleteButton.className = 'btn btn-error';
deleteButton.textContent = 'Delete';
deleteButton.addEventListener('click', () => {
deleteTask(task.id);
renderTasks();
});

taskElement.appendChild(doneButton);
taskElement.appendChild(deleteButton);
taskListElement.appendChild(taskElement);
});
}

addTaskButton.addEventListener('click', () => {
const text = newTaskInput.value.trim();
if (text === '') return;
addTask(text);
newTaskInput.value = '';
renderTasks();
});

document.addEventListener('DOMContentLoaded', () => {
renderTasks();
});