<?php
function loadTasks()
{
    if (!file_exists('tasks.json')) {
        return [];
    }
    $content = file_get_contents('tasks.json');
    return json_decode($content, true) ?? [];
}

function saveTasks(array $tasks)
{
   file_put_contents('tasks.json', json_encode($tasks, JSON_PRETTY_PRINT));
}

function run()
{
    global $_SERVER;
    $args = array_slice($_SERVER['argv'], 1);
    
    if (in_array('-h', $args) || in_array('--help', $args)) {
        main();
        return;
    }
    
    if ($args[0] === 'add') {
        addTask($args);
    } elseif ($args[0] === 'list') {
        listTasks('all');
    } elseif ($args[0] === 'done' && isset($args[1])) {
        doneTask((int)$args[1]);
    } elseif ($args[0] === 'remove' && isset($args[1])) {
        removeTask((int)$args[1]);
    }
}

function main()
{
    echo "\n";
    echo "+----------+\n";
    echo "| Task CLI |\n";
    echo "+----------+\n\n";
    
    if (count(array_slice($_SERVER['argv'], 1)) === 0) {
        listTasks('all');
        return;
    }

    $cmd = array_slice($_SERVER['argv'], 1)[0];

    switch ($cmd) {
        case 'add':
            echo "Enter the task description: ";
            $handle = fopen("php://stdin", "r");
            $input = fgets($handle); fclose($handle);
            if (trim($input)) {
                $tasks[] = [
                    'description' => trim($input),
                    'done' => false
                ];
                saveTasks($tasks);
                echo "[OK] Task added\n";
            } else {
                echo "Description cannot be empty.\n";
            }
            break;
        case 'list':
            listTasks('all');
            break;
        default:
            echo "Unknown command\n";
    }
}

function addTask($args)
{
    if (!isset($args[1])) {
        echo "Usage: {$args[0]} [description]\n";
        exit(1);
    }

    $tasks = loadTasks();
    
    $taskIndex = count($tasks) + 1;
    
    try {
        $taskId = generateTaskId($args);
        
        if (array_key_exists($taskId, $tasks)) {
            throw new RuntimeException("Task ID '{$taskId}' already exists");
        }
        
        $description = implode(' ', array_slice($args, 1));
        
        validateDescription($description);
        
        $isDone = false;
        
        $addedAt = getFormattedDate();
        
        array_push(
            $tasks,
            [
                'taskID' => (int)$taskId,
                'description' => substr(escapeshellarg(cleanString($args[1])), 1, -2),
                'done' => json_decode('false')
            ]
        );
        
        saveTasks($tasks);
        
        echo "Task {$taskId} added successfully.\n";
    } catch (RuntimeException $e) {
        echo "[ERROR] Task '{$taskId}' could not be added: {$e->getMessage()}\n";
    }
}

function listTasks(string $filter)
{
    global $_SERVER;

    // load tasks from storage
    if (!file_exists('tasks.json')) {
        file_put_contents('tasks.json', '[]');
    }

    $tasks = json_decode(file_get_contents('tasks.json'), true);

    // initialize task count container
    $taskCount = 0;
    
    try {
        
        foreach ($tasks as $i => &$t)
            if (isset($t['done']))
                $t['done'] = filter_var($t['done'], FILTER_VALIDATE_BOOLEAN);
        // Check for empty tasks array
        if (!$tasks || count(array_filter($tasks)) === 0) {
            echo '[WARN] No pending or completed tasks\n';
            return;
        }

        // Filter the list based on the argument passed to 'list'
        $sortedTasks = [];
        
        switch ($filter) {
            
            case 'all':
                $sortedTasks = array_filter($tasks);
                break;

            case 'undo':  // undo (check for undoable tasks)
                if (!isset($args[2]))
                    throw new RuntimeException('Please provide a task ID to check for undo');
                
                foreach ($sortedTasks as $i => $_v) {
                    
                    try {
                        // Retrieve the current status of each task
                        $task = $tasks[$_v];
                        
                        // Check whether the task is done or not based on its description
                
                        if (!isset($task['done']))
                            throw new RuntimeException('[ERROR] Task is missing \'description\' key');
                        
                        echo ($task['done']) ? 'Completed' : 'Pending';
                    } catch (RuntimeException $_e) {
                        echo $_e->getMessage();
                    }
                }

                return;

            case 'done':   // done (completed tasks)
                
                $sortedTasks = array_filter($tasks, function ($_v) use ($taskMap) { return isset($taskMap[$_v]) && !$taskDone[$taskMap[$_v]]; });
                break;
            
            default:
                throw new RuntimeException('Invalid argument passed to \'list\'. Please choose from \'all\', \'done\' or \'pending\'.');
        }

        
    } catch (Throwable $_t) {
        
        echo '[ERROR] failed task list generation: ' . $_t->getMessage();
       
        return;
    
    }
    
}

function doneTask(int $taskId)
{
    global $_SERVER;

    // check command arguments
    if (!isset($_SERVER['argv'][2]) || !ctype_digit($_SERVER['argv'][2])) {
        echo "Usage: {$argv[0]} done <task_id>\n";
        exit(1);
    }
   
   // retrieve task id from the third argument of command line input (index starts at 1)
    $taskId = (int)$_SERVER['argv'][2];
 
    if ($taskId === null || !is_numeric($taskId))
       {
           throw new InvalidArgumentException('[ERROR] task id must be a numeric integer');
        }
    
    // convert to string format for consistency with stored keys
    $id = (string)$taskId;
     
   // ensure that the key exists in the task array or exit immediately 
    if (!array_key_exists($id, array_values(json_decode(file_get_contents('tasks.json')))))
        {
            throw new RuntimeException('[ERROR] failed status update: no active tasks for id');
        }
    
   // save updated tasks back to file
    try {
       $taskData = (object)array_values(json_decode(file_get_contents('tasks.json')));
      } catch (Throwable $_t) {}
       
    if ($taskId === null || !isset($taskData->done)) {
            echo '[ERROR] cannot find task';
            exit(1);
        }
        
     // update done property based on current value  
      
    $taskData->done = filter_var((string)$completed, FILTER_VALIDATE_BOOL); 
   
   file_put_contents('tasks.json', json_encode($taskData));
    
}

function removeTask(int $taskId)
{
    if (!ctype_digit($_SERVER['argv'][2])) {
        echo "Usage: {$argv[0]} <TASK_ID>\n";
        exit(1);  
    }
}