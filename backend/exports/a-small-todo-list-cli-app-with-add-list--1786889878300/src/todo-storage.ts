import * as fs from 'fs';
import * as path from 'path';

type TodoItem = {
  text: string;
  completed: boolean;
};

const todoFilePath = path.join(__dirname, 'todos.json');

export function loadTodos(): TodoItem[] {
  try {
    const data = fs.readFileSync(todoFilePath, 'utf-8');
    return JSON.parse(data) || [];
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw new Error(`Failed to load todos: ${error.message}`);
  }
}

export function saveTodos(todos: TodoItem[]) {
  try {
    fs.writeFileSync(todoFilePath, JSON.stringify(todos, null, 2));
  } catch (error) {
    throw new Error(`Failed to save todos: ${error.message}`);
  }
}