/**
 * storage.ts — File-based JSON storage for todos.
 *
 * Todos persist to a JSON file so `add` and `list` share state across
 * invocations. Default location: ~/.todo-cli/todos.json
 * Override with the TODO_FILE environment variable.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { TodoItem } from './todo.js';

export function defaultStoreFile(): string {
  if (process.env.TODO_FILE) return process.env.TODO_FILE;
  return path.join(os.homedir(), '.todo-cli', 'todos.json');
}

export function loadTodos(storeFile: string = defaultStoreFile()): TodoItem[] {
  try {
    const raw = fs.readFileSync(storeFile, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as TodoItem[];
  } catch {
    return [];
  }
}

export function saveTodos(todos: TodoItem[], storeFile: string = defaultStoreFile()): void {
  // If the store exists but is unparseable, preserve it rather than silently
  // overwriting a potentially recoverable file.
  if (fs.existsSync(storeFile)) {
    try {
      JSON.parse(fs.readFileSync(storeFile, 'utf-8'));
    } catch {
      const backup = `${storeFile}.corrupt-${Date.now()}`;
      try {
        fs.copyFileSync(storeFile, backup);
        console.warn(`Warning: previous store was unreadable — backed up to ${backup}`);
      } catch {
        /* best-effort backup */
      }
    }
  }
  fs.mkdirSync(path.dirname(storeFile), { recursive: true });
  fs.writeFileSync(storeFile, JSON.stringify(todos, null, 2), 'utf-8');
}
