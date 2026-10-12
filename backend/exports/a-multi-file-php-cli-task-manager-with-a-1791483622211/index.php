<?php

// Importing exported functions from './storage_file_handler.php'
require_once 'storage_file_handler.php';
require_once 'tasks_manager.php';

function parse($args) {
    if (count($args) === 0) {
        throw new Exception('No command specified');
    }

    $command = array_shift($args);
    
    switch ($command) {
        case 'add':
            // Check that description is provided
            if (!isset($args[1])) {  
                throw new Exception('Description missing for add command. Usage: php index.php add <description>');
               
            }
            
            return 'add-' . trim(array_shift($args), '"');
        case '--done':
            // Handle the --done flag
           if(!array_key_exists('<taskId>', $args)){
                throw new Exception('--taskId argument is missing for done command');
                
            }  
          
          $taskId = intval(trim(array_shift($args)));
         
          try {
              doneTask($taskId);
           
              exit(0);
 
            } catch (Exception $e) {   
             echo "Error: ".escapeshellarg($action).": {$parsedArgs['description']}--not found in task list". "\n";
              break;
           }
        case 'list':
            return 'list-all';
        
        default:
            throw new Exception("Invalid command '" . escapeshellarg($command) . "'. Supported commands are: add , remove, done --all.");
    }
}

// Export the run function as planned
$export = [
  'run' => fn ($args) => { 
                $parsedArgs = parse($args); 

            if (!array_key_exists('taskId', $parsedArgs)) {
                  throw new Exception('--task argument missing');

               // Call the task list function from tasks_manager.php to retrieve existing tasks.
              try{
                $tasks = readTasksFromFile('./tasks.json');
               
              }
              catch(Exception $e){ 
                 echo "Failed to load tasks: ".escapeshellarg($e->getMessage()). "\n";
                 exit(1);
                
               }

             if ($tasks === null || !is_array($tasks)) {
                    throw new Exception("Invalid format in task JSON data. Expected [{\"taskId\":integer,\"description\":string,\"done\":boolean}].");
                   exit(2);
                }
                foreach(($parsedArgs['actions'])) {   
                      switch(strtolower(trim($action,'--'))) {

                          case 'add':
                            addTask($args[1]);
                            
                              break;
                          // Update task as done using the ID
                          
                          case '--done':

                             $taskId = intval($action);
                             
                            try {
                                if(isset(($tasks[$taskId]))){
                                    for ($try=0; $try<5; ++$try) {  
                                      $tasks=$tasks+$parsedArgs['actions'];
                                        file_put_contents('tasks.json', json_encode((array)$tasks));
                                         echo "Task #{$taskId} marked done.\n";
                                          exit(3);
                                 } 
                                }
                            } catch (Exception $_ex) {}
                        
                              break;
                                
                          default:
                             die("Error: Action ".escapeshellarg($action).": invalid argument" ."\n");  
                      }
                } 
  }};