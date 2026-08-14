export interface Task {
  id: number;
  title: string;
  completed: boolean;
}

export interface App {
  tasks: Task[];
  addTask(title: string): void;
  toggleTask(id: number): void;
  removeTask(id: number): void;
  clearAll(): void;
  render(container: HTMLElement): void;
}

export function renderTasks(tasks: Task[], container: HTMLElement) {
  container.innerHTML = '';
  tasks.forEach((task) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.backgroundColor = '#15152a';
    card.style.border = '1px solid rgba(255,255,255,0.1)';
    card.style.borderRadius = '12px';
    card.style.padding = '16px';
    card.style.minWidth = '220px';

    const title = document.createElement('h3');
    title.textContent = task.title;
    card.appendChild(title);

    const toggle = document.createElement('button');
    toggle.className = 'btn';
    toggle.textContent = task.completed ? '✅ Completed' : '▶️ Pending';
    toggle.addEventListener('click', () => toggleTask(task.id));
    card.appendChild(toggle);

    const remove = document.createElement('button');
    remove.className = 'btn btn-danger';
    remove.textContent = '✕ Remove';
    remove.addEventListener('click', () => removeTask(task.id));
    card.appendChild(remove);

    container.appendChild(card);
  });
}

export function renderEmptyState(container: HTMLElement) {
  const emptyState = document.createElement('div');
  emptyState.className = 'center-items';
  emptyState.innerHTML = `
    <h1 class="title">TodoMaster</h1>
    <p class="description">Add your first task and get started.</p>
    <button class="btn btn-primary" onclick="addTask()">Add Task</button>
  `;
  container.appendChild(emptyState);
}

export function render(app: App, container: HTMLElement) {
  container.innerHTML = '';

  const appShell = document.createElement('div');
  appShell.className = 'app';
  appShell.style.maxWidth = '960px';
  appShell.style.margin = '0 auto';
  appShell.style.padding = '24px';

  const addTaskButton = document.createElement('button');
  addTaskButton.className = 'btn btn-primary';
  addTaskButton.textContent = 'Add Task';
  addTaskButton.addEventListener('click', () => addTask());
  appShell.appendChild(addTaskButton);

  const taskList = document.createElement('div');
  taskList.className = 'col task-list';
  taskList.style.display = 'flex';
  taskList.style.flexDirection = 'column';
  taskList.style.gap = '10px';
  appShell.appendChild(taskList);

  const emptyState = document.createElement('div');
  emptyState.className = 'center-items';
  emptyState.style.marginTop = '20px';
  emptyState.innerHTML = `
    <h1 class="title">TodoMaster</h1>
    <p class="description">Add your first task and get started.</p>
    <button class="btn btn-primary" onclick="addTask()">Add Task</button>
  `;
  appShell.appendChild(emptyState);

  container.appendChild(appShell);

  renderTasks(app.tasks, taskList);
}

export function addTask() {
  const titleInput = document.getElementById('titleInput') as HTMLInputElement;
  if (!titleInput) return;

  const title = titleInput.value.trim();
  if (!title) return;

  const newTask: Task = { id: Date.now(), title, completed: false };
  const app: App = {
    tasks: [newTask],
    addTask: () => {},
    toggleTask: () => {},
    removeTask: () => {},
    clearAll: () => {},
    render: () => {},
  };

  render(app, document.getElementById('#app-container') as HTMLElement);
}

export function toggleTask(id: number) {
  const app: App = {
    tasks: [],
    addTask: () => {},
    toggleTask: () => {},
    removeTask: () => {},
    clearAll: () => {},
    render: () => {},
  };

  const task = app.tasks.find((t) => t.id === id);
  if (!task) return;

  task.completed = !task.completed;
  render(app, document.getElementById('#app-container') as HTMLElement);
}

export function removeTask(id: number) {
  const app: App = {
    tasks: [],
    addTask: () => {},
    toggleTask: () => {},
    removeTask: () => {},
    clearAll: () => {},
    render: () => {},
  };

  const index = app.tasks.findIndex((t) => t.id === id);
  if (index === -1) return;

  app.tasks.splice(index, 1);
  render(app, document.getElementById('#app-container') as HTMLElement);
}

export function clearAll() {
  const app: App = {
    tasks: [],
    addTask: () => {},
    toggleTask: () => {},
    removeTask: () => {},
    clearAll: () => {},
    render: () => {},
  };

  app.tasks.length = 0;
  render(app, document.getElementById('#app-container') as HTMLElement);
}