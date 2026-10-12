<?php

// Import necessary functions
require_once './todos.php';

function main($argv) {
    $command = isset($argv[1]) ? $argv[1] : null;
    $tasksFile = 'tasks.json';

    switch ($command ?? '') {
        case 'add':
            if (isset($argv[2])) {
                add_task($argv[2], $tasksFile);
            } else {
                echo "Error: No task provided.\n";
                exit(1);
            }
            break;
        case 'list':
            list_tasks($tasksFile, false);
            break;
        case 'done':
            if (isset($argv[2])) {
                mark_done((int)$argv[2], $tasksFile);
            } else {
                echo "Error: No task ID provided.\n";
                exit(1);
            }
            break;
        case 'remove':
            if (isset($argv[2])) {
                remove_task((int)$argv[2], $tasksFile);
}
}
}
