export const run = () => {
    const addTodo = (title: string) => { };
    const listTodos = (todos: string[]) => { };
    const saveTodos = (todos: string[]) => { };
    const loadTodos = () => [];
    const todos = loadTodos();
    addTodo('Buy milk');
    addTodo('Walk the dog');
    listTodos(todos);
    saveTodos(todos);
};