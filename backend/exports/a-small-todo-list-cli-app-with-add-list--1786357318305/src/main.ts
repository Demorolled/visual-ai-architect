export const run = () => {
    const tasks: string[] = [];
    let taskCount = 0;

    const add = (task: string) => {
        tasks.push(task);
        taskCount++;
    };

    const list = () => {
        tasks.forEach((task, index) => {
            console.log(`${index + 1}: ${task}`);
        });
    };

    const complete = (index: number) => {
        if (index >= 1 && index <= taskCount) {
            tasks.splice(index - 1, 1);
            taskCount--;
        }
    };

    const main = () => {
        while (true) {
            console.log("\n1. Add task\n2. List tasks\n3. Complete task\n4. Exit");
            const choice = parseInt(prompt("Enter your choice:"));

            switch (choice) {
                case 1:
                    add(prompt("Enter the task:"));
                    break;
                case 2:
                    list();
                    break;
                case 3:
                    const index = parseInt(prompt("Enter the task number to complete:"));
                    complete(index);
                    break;
                case 4:
                    return;
                default:
                    console.log("Invalid choice. Try again.");
            }
        }
    };

    main();
};

export const main = run;