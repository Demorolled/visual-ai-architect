export const todos = [];
export const addTodo = (title: string) => { todos.push({ title, completed: false }); };
export const listTodos = () => todos.map(t => t.title).join('\n');
export const processTodoCommand = () => {
    const [cmd, ...args] = process.argv.slice(2);
    try {
        switch (cmd) {
            case 'add':
                if (args.length < 1) throw new Error('Usage: ts-node index.ts add "Task description"');
                addTodo(args.join(' '));
                break;
            case 'list':
                console.log(listTodos());
                return;
            default:
                console.error('Unknown command');
                return;
        }
    } catch (e) { console.error(e.message); }
};