import { TodoItem } from './types';
import fs from 'fs';

type Config = {
  dataPath: string;
};

const config: Config = (require('./config') as typeof import('./config')).Config;

export function loadTodos(): TodoItem[] {
  try {
    const todosPath = path.join(config.dataPath, 'todos.json');
    const data = fs.readFileSync(todosPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

export function saveTodos(todos: TodoItem[]): void {
  try {
    const todosPath = path.join(config.dataPath, 'todos.json');
    fs.writeFileSync(todosPath, JSON.stringify(todos, null, 2));
  } catch (error) {
    console.error('Unable to save todos:', error);
  }
}