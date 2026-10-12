import { TodoItem } from './todoItem';
import { addTodo, listTodos, completeTodo, deleteTodo } from './todo';

interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

class TodoList {
  private todos: Todo[];

  constructor() {
    this.todos = [];
  }

  addTodo(todo: TodoItem): void {
    this.todos.push(todo);
  }

  listTodos(): Todo[] {
    return this.todos;
  }

  completeTodo(todoId: number): void {
    const todo = this.todos.find(todo => todo.id === todoId);
    if (todo) {
      todo.completed = true;
    }
  }

  deleteTodo(todoId: number): void {
    const index = this.todos.findIndex(todo => todo.id === todoId);
    if (index !== -1) {
      this.todos.splice(index, 1);
    }
  }
}

// Example usage:
const todoList = new TodoList();
todoList.addTodo(new TodoItem('Create a new project'));
todoList.addTodo(new TodoItem('Implement a todo list API'));
todoList.listTodos();
todoList.completeTodo(1);
todoList.deleteTodo(2);
todoList.listTodos();