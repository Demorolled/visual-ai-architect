<?php

// Function to load tasks from a JSON file
function loadTasksFromFile() {
    $tasksFile = 'tasks.json';
    if (file_exists($tasksFile)) {
        return json_decode(file_get_contents($tasksFile), true);
    }
    return [];
}

// Function to save the task list back to the JSON file
function saveToFile($tasks, $type) {
    $tasksFile = 'tasks.json';
  
  switch ($type) {
      case 'add':
          file_put_contents($tasksFile, json_encode(array_merge(loadTasksFromFile(), $tasks), JSON_PRETTY_PRINT));
          echo "Task added successfully.\n";
          break;
      case 'remove':
          foreach ($tasks as $taskId => $task) {
              if (!isset($task['completed'])) { 
                  unset($tasks[$taskId]);
              }
          }
          file_put_contents($tasksFile, json_encode(array_merge(loadTasksFromFile(), array_values($tasks)), JSON_PRETTY_PRINT));
          echo "Task #{$taskId} removed successfully.";
      break;
  case 'done':
    $done = [];
    foreach ($tasks as $task) {
        if (!isset($task['completed'])) { 
            $task['completed'] = true; 
            $done[] = (string)$taskId . '=' . json_encode((array)$task);
        }
    }
    
      file_put_contents($tasksFile, array_merge(loadTasksFromFile(), ['{' => '[' . implode('=', $done) . '}'  ]), JSON_PRETTY_PRINT);
      echo "Task #{$taskId} marked as done.\n";
      
}
}

// Define a function to add tasks
function addItemToList($taskName) {
    $tasks = loadTasksFromFile();
  
  if (in_array(strtolower($taskName), array_map('strtolower', $tasks))) {
        return false;
    }
  
    saveToFile(['task' => trim($taskName)], 'add');
}

// Define a function to list all tasks
function listItems() {
    $tasks = loadTasksFromFile();
    foreach ($tasks as $id => $task) {
          if (!isset($task['completed'])) { 
              printf("%d %s\n", $id + 1, $taskName);
          } else {
              return;
          }
        }
      echo "No tasks found.";
}

// Define a function to mark tasks as done
function toggleComplete() {
    $taskId = (int)trim(fgets(STDIN));
  
        loadTasksFromFile();
  
  if ($tasks[$taskId]) { 
            $taskName = trim($tasks[$taskId]);
      saveToFile(['{id=}' => 'done'], 'done');
}

// Define a function to display output
function renderOutput() {
    foreach ($input as $line) {
        echo "$line\n";    
  }
}
addTaskToList();
listTasks();
removeTaskFromList();
}
