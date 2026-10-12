<?php

class TaskService {
    private $storage;

    public function __construct(TaskStorage $storage) {
        $this->storage = $storage;
    }

    public function addTask(string $description): array {
        return [
            'id' => uniqid(),
            'description' => $description,
            'done' => false
        ];
    }

    public function listTasks(): array {
        return $this->storage->loadAll();
    }

    public function markDone(int $taskId, bool $done): void {
        $tasks = $this->storage->loadAll();
        
        foreach ($tasks as &$task) {
            if ((int)$task['id'] === (int)$taskId) {
                $task['done'] = (bool)$done;
                break;
            }
        }

        $this->storage->saveAll($tasks);
    }
}

// Usage example
$storage = new TaskStorage(new Filesystem('tasks.json'));
$service = new TaskService($storage);

if ($argc > 1) {
    switch ($argv[1]) {
        case 'add':
            if ($argv[2] !== '') {
                $task = [
                    'id' => uniqid(),
                    'description' => trim($argv[2]),
                    'done' => false
                ];
                // Add to storage...
            }
            break;
        case 'list':
            // Load tasks from the database and output them in a readable format (CLI presentation)
            
        case 'done':
            if ($taskId !== '') {
                $service->markDone($taskId, true);
            } else {
                echo "Please provide an ID of the task to mark.";
                return [];
            }
            break;
    }

    // Return an array with relevant data — the CLI processor will render this output when done.
}