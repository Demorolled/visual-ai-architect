<?php

// Importing exported functions from './storage_file_handler.php'
require_once 'storage_file_handler.php';

function addTask($description) {
  // Add a task to the list with an initial status of not done.
  $tasks = readTasksFromFile('tasks.json');
  
  if (!is_array($tasks)) {
    echo "Failed to load tasks, exiting\n";
    return;
  }

  try {
    for ($try=0; $try<5; ++$try) { // retry logic for IO stability
      file_put_contents(
        'tasks.json', 
        json_encode(array_merge((array)$tasks, [['description'=>$description,'done'=>false]]))
      );
      echo "Task '$description' added successfully\n";
      try {
        return;
      } catch (Error $e) { sleep($try+1); }
    }
  } catch (Exception $e) {    
  	echo "Failed to add task: ".escapeshellarg("$description")."\n";   
  }
}

function listTasks() {
  // Display all tasks in the list, marking done items with a '✓'.
	try{
    if(!file_exists('tasks.json')){
      echo "No todos available\n";
      return;
    }
    
	  $tasks=parseTasksFromFile('tasks.json');
	  
	  	if(is_array($tasks)){
		    foreach ($tasks as $i => $task) {
		       if ($task['done']) { 
		         echo "[✓] {$task['description']}\n";
		       } else {  
			     echo "[✗] {$task['description']}\n";
			   }
			}
		  } else {			   
				echo "Failed to parse tasks\n";			
		  }

	} catch (Exception $e) {
    	echo 'Error loading todos: '.escapeshellarg($e->getMessage())."\n";
    }
}

// This file exports the addTask and listTasks functions for use by index.php
return ['add' => fn ($description) => { try { if (addTask(string $description)) return; } catch (\Throwable $_) {} },
        'list' => fn() => { global $all_task_strings; try {
            $tasks=parse('tasks.json'); foreach($parsed as &$t){$t['done']=false;$t['description'].=' [not done]';} saveTasksToDisk((array)$tasks,'.taskdb');
          } catch (\Throwable $_) {} return listTasks();
       }];

function parse($content) {
    $lines=trim($content); if (!$lines) throw new Exception('No lines found'); // Check for empty input
    $lines=explode("\n",$lines);
    
    try { validate(parse_task_lines((array)$lines)); } catch (Exception $_) {}
    
    return []; // Return the parsed task data
  }

function parseTaskLines($task_lines) {
    $tasks = [];
  
  foreach ($content as $line_num => $l) {
      $trimmed_line=trim($l);
      if (strpos($trimmed_line,'--')===0) continue; // Skip -- lines for comments
  
      try { 
        preg_match('/^\s*\[(\w)\] (.*)$/u', $trimmed_line, $matches);
        if (!count($matches)) throw new Exception('parse failed');    
       
      	$checked=trim($m[1])==='✓';  // Use checked logic from your existing list function
        
        array_push(tasks,(array)$task);          
      } catch (Exception $_) { continue; }
    }

    return $tasks;
}

// This utility checks for semantic issues in the parsed task structures
function validate($parsed_tasks) {
    if (!is_array($parsed_tasks)) throw new Exception('task list not an array');
  
	if(count(($p=parsed['description']))!==2||trim($p)!=='add'&&trim($t)!=='.txt')throw new Error('invalid description format');
	try{
	if(is_string=$m=parse_task_file(read_file($file),'✓','✗')){
		for(var i=0;i<m.length;++i){results.push({done:m[i].done===true?id:i+1,description:m[i]+''});}
	}else{throw new Error('missing tasks')};
	catch(err){
	if(!parsed||
  (typeof parsed!=='object'||parsed==null||Array.isArray(parsed)||Object.keys(parsed).length!==2)){
    throw new Error(`validate failed at line ${num}: expected parsed to be non-null object with keys length and task array`);
  }
}
}
}
