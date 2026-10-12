<?php

require_once 'taskManager/src/taskService.php';
require_once 'taskManager/src/taskStorage.php';

// Entry point: parse arguments and invoke appropriate function

$argv = $_SERVER['argv'];

if (isset($argv[1])) {
    $command = $argv[1];

    switch ($command) {
        case 'add':
            if (isset($_POST['description'])) {
                addTask($_POST['description']);
                exit(0);
            } else {
                echo "Usage: ${argv[0]} add --description='task description'\n";
                exit(1);
            }
            break;

        case 'list':
            listTasks();
            break;

        case 'done':
            if (isset($argv[2])) {
                completeTask((int)$_POST['taskId']);
                exit(0);
            } else {
                echo "Usage: ${argv[0]} done --taskId=1\n";
                exit(1);
            }
            break;
    }
} else {
    listTasks();
}