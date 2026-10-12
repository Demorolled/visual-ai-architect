<?php

function parse($args) {
    if (count($args) === 0) {
        throw new Exception('No command specified');
    }

    $command = array_shift($args);
    
    switch ($command) {
        case 'add':
            // Check that description is provided
            if (!isset($args[1])) {
                throw new Exception('Description missing for add command. Usage: php parser.php add <description>');
            }
            
            return 'add-' . trim(array_shift($args), '"');

        case 'list':
            return 'list-all';
        
        case 'done':
           // Check that taskId is provided
           if (!isset($args[1])) {
                throw new Exception('taskId missing for done command');
           }
           
           $taskId = intval(trim(array_shift($args)));
          
          // TODO: mark the task as done and write back to tasks.json

            return 'done-' . $taskId;

        default:
            throw new Exception("Unsupported command '" . escapeshellarg($command) . "'. Supported commands are add, list, and done.");
    }
}