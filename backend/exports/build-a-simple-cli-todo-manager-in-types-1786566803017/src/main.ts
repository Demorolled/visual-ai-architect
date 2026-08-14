export async function run(): Promise<void> {
    const todos = [];
    const added = await import('./src/todo').then(m => m.addTodo(todos, 'Buy milk'));
    const list = await import('./src/todo').then(m => m.listTodos(todos, added));
    console.log(list.join('\n'));
}
export function main(): void {
    run().catch(err => console.error('Failed to run:', err));
}
export {};