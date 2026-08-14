import { renderCLIPrompt } from '../uifunctions/uifunctions.ts';

export function runApp(container: HTMLElement) {
    let tasks: { id: number; title: string; completed: boolean }[] = [];

    function renderCLIPrompt() {
        const row = document.createElement('div');
        row.className = 'row';
        const col = document.createElement('div');
        col.className = 'col';
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Add a new task';
        const addBtn = document.createElement('button');
        addBtn.className = 'btn';
        addBtn.textContent = 'Add Task';
        addBtn.addEventListener('click', addTask);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addTask();
        });
        col.appendChild(input);
        col.appendChild(addBtn);
        row.appendChild(col);
        container.appendChild(row);
    }

    function addTask() {
        const title = document.querySelector('#taskInput') as HTMLInputElement;
        const titleValue = title?.value.trim();
        if (!titleValue) return;
        tasks.push({ id: tasks.length + 1, title: titleValue, completed: false });
        title.value = '';
        renderTasks();
    }

    function renderTasks() {
        const listContainer = document.querySelector('#taskList') as HTMLElement;
        listContainer.innerHTML = '';
        tasks.forEach((task) => {
            const card = document.createElement('div');
            card.className = 'card';
            card.style.backgroundColor = '#1e293b';
            card.style.border = '1px solid rgba(255,255,255,0.1)';
            card.style.borderRadius = '12px';
            card.style.padding = '16px';
            const title = document.createElement('h3');
            title.textContent = task.title;
            card.appendChild(title);
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'btn';
            toggleBtn.textContent = task.completed ? 'Completed' : 'In Progress';
            toggleBtn.addEventListener('click', () => toggleTask(task.id));
            card.appendChild(toggleBtn);
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn btn-danger';
            removeBtn.textContent = 'Remove';
            removeBtn.addEventListener('click', () => removeTask(task.id));
            card.appendChild(removeBtn);
            listContainer.appendChild(card);
        });
    }

    function toggleTask(id: number) {
        const task = tasks.find((t) => t.id === id);
        if (task) {
            task.completed = !task.completed;
            renderTasks();
        }
    }

    function removeTask(id: number) {
        tasks = tasks.filter((t) => t.id !== id);
        renderTasks();
    }

    renderCLIPrompt();
}