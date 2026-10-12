export class DataStore {
  private storage: Record<string, { title: string; description: string; tags: string[]; status: string; priority: number; createdAt: string; updatedAt: string; items: Array<{ id: number; name: string; completed: boolean }> }> = {};
  private nextId = 1;

  constructor() {
    this.initData();
  }

  private initData() {
    const sampleItems = [
      { id: this.nextId++, name: 'Task 1', completed: false },
      { id: this.nextId++, name: 'Task 2', completed: false },
      { id: this.nextId++, name: 'Task 3', completed: true },
      { id: this.nextId++, name: 'Task 4', completed: false },
    ];
    this.storage = {
      'task-list': {
        title: 'Task List',
        description: 'A list of tasks to be completed',
        tags: ['task', 'list', 'todo'],
        status: 'active',
        priority: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        items: sampleItems,
      },
    };
  }

  public addTask(title: string, description: string, tags: string[], status: string, priority: number): void {
    this.storage[title] = {
      title,
      description,
      tags,
      status,
      priority,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: [],
    };
  }

  public updateTask(title: string, update: { title?: string; description?: string; tags?: string[]; status?: string; priority?: number }): void {
    if (!this.storage[title]) return;
    this.storage[title] = {
      ...this.storage[title],
      ...update,
      updatedAt: new Date().toISOString(),
    };
  }

  public deleteTask(title: string): void {
    delete this.storage[title];
  }

  public getTasks(): Record<string, { title: string; description: string; tags: string[]; status: string; priority: number; createdAt: string; updatedAt: string; items: Array<{ id: number; name: string; completed: boolean }> }> {
    return this.storage;
  }

  public getTask(title: string): { title: string; description: string; tags: string[]; status: string; priority: number; createdAt: string; updatedAt: string; items: Array<{ id: number; name: string; completed: boolean }> } | undefined {
    return this.storage[title];
  }

  public addLap(title: string, lap: { id: number; name: string; completed: boolean }): void {
    if (!this.storage[title]) return;
    this.storage[title].items.push(lap);
  }

  public updateLap(title: string, lapId: number, update: { name?: string; completed?: boolean }): void {
    const task = this.storage[title];
    if (!task) return;
    const lap = task.items.find((l) => l.id === lapId);
    if (!lap) return;
    lap.name = update.name ?? lap.name;
    lap.completed = update.completed ?? lap.completed;
    task.updatedAt = new Date().toISOString();
  }

  public deleteLap(title: string, lapId: number): void {
    const task = this.storage[title];
    if (!task) return;
    task.items = task.items.filter((l) => l.id !== lapId);
    task.updatedAt = new Date().toISOString();
  }

  public getLaps(title: string): Array<{ id: number; name: string; completed: boolean }> {
    const task = this.storage[title];
    return task ? task.items : [];
  }
}