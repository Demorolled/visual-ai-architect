let taskIdCounter = 0;
let todoItemContainer: HTMLElement | null = null;
const tasks = [
    { id: taskIdCounter++, text: 'Learn React', completed: true },
    { id: taskIdCounter++, text: 'Build a habit', completed: true },
    { id: taskIdCounter++, text: 'Meditate for 2m', completed: true },
];