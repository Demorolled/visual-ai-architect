import { describe, it, expect } from 'vitest';
import { detectTodoIntent } from '../utils/todoIntent';

describe('detectTodoIntent', () => {
  it('detects requests to see the todo list', () => {
    expect(detectTodoIntent('can you open the todo list')).toBe(true);
    expect(detectTodoIntent('show me the todo list')).toBe(true);
    expect(detectTodoIntent('open your todo list')).toBe(true);
    expect(detectTodoIntent('show your todos')).toBe(true);
    expect(detectTodoIntent('display the todo list')).toBe(true);
    expect(detectTodoIntent('let me see the todo list')).toBe(true);
    expect(detectTodoIntent("what's on the todo list")).toBe(true);
    expect(detectTodoIntent('can you pull up the todo list')).toBe(true);
  });

  it('never fires for app-build requests', () => {
    expect(detectTodoIntent('build me a todo app')).toBe(false);
    expect(detectTodoIntent('make a todo list app with deadlines')).toBe(false);
    expect(detectTodoIntent('can you build a todo app for my family')).toBe(false);
  });

  it('never fires for write/update requests to the list', () => {
    expect(detectTodoIntent("add 'fix login bug' to the todo list")).toBe(false);
    expect(detectTodoIntent('mark 2.1 as done on the todo list')).toBe(false);
    expect(detectTodoIntent('check off item 8.1')).toBe(false);
    expect(detectTodoIntent('update the todo list with the new item')).toBe(false);
  });

  it('does not fire on unrelated messages', () => {
    expect(detectTodoIntent('hello')).toBe(false);
    expect(detectTodoIntent('how do I make a pomodoro timer')).toBe(false);
    expect(detectTodoIntent('')).toBe(false);
  });
});
