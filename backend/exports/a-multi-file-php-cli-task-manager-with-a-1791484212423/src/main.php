<?php

require_once 'task_manager.php';

function run() {
    $argv = $_SERVER['argv'];
    if (count($argv) < 2) {
        echo "Usage: php main.php {add,list,done}\n";
        exit(1);
    }

    $command = $argv[1];
    $tm = new TaskManager();

    switch ($command) {
        case 'add':
            if (count($argv) < 3) {
                echo "Usage: php main.php add TASK_NAME\n";
                exit(1);
            }
            $taskName = implode(' ', array_slice($argv, 2));
            $tm->addTask($taskName);
            echo "Added task '$taskName'.\n";
            break;

        case 'list':
            $tasks = $tm->listTasks();
            foreach ($tasks as $task) {
                echo sprintf("%s - %s\n", $task['id'], is_null($task['completed']) ? '-' : $task['description']);
            }
            if (count($tasks) === 0) {
                echo "No tasks found.\n";
            }
            break;

        case 'done':
            if (count($argv) < 3) {
                echo "Usage: php main.php done ID\n";
                exit(1);
            }
            $taskId = intval($argv[2]);
            $tm->markTaskDone($taskId);
            echo "Marked task '$taskId' as done.\n";
            break;

        default:
             echo "Unknown command. Supported commands are 'add', 'list', and 'done'.\n";
             exit(1);

         }
    }

run();