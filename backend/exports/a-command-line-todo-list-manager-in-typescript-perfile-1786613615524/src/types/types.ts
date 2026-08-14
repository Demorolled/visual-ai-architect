import '../tests/tests.ts';

export interface Task {
    title: string;
    completed?: boolean;
    priority?: number;
    dueDate?: Date;
}

export enum Command {
    ADD = 'ADD',
    LIST = 'LIST',
    COMPLETE = 'COMPLETE',
    DELETE = 'DELETE',
}

export class TaskList {
    private tasks: Task[] = [];

    addTask(task: Task): void {
        this.tasks.push(task);
    }

    listTasks(): Task[] {
        return this.tasks;
    }

    completeTask(index: number): void {
        if (index >= 0 && index < this.tasks.length) {
            this.tasks[index].completed = true;
        }
    }

    deleteTask(index: number): void {
        if (index >= 0 && index < this.tasks.length) {
            this.tasks.splice(index, 1);
        }
    }

    clearCompletedTasks(): void {
        this.tasks = this.tasks.filter(task => !task.completed);
    }
}