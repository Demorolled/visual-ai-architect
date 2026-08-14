export function run() {
    const args = process.argv.slice(2);
    let todoList: string[] = [];
    switch (args[0]) {
        case 'list':
            console.log(todoList.join('\n'));
            break;
        case 'add':
            if (args.length < 2) process.exit(1);
            todoList.push(args.slice(1).join(' '));
            console.log('Added todo: ' + args.slice(1).join(' '));
            break;
        default:
            process.exit(1);
    }
}