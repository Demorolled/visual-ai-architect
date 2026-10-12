<?php

class Task {
    public $id;
    public $description;
    public $completed;

    function __construct($id, $description, $completed = false) {
        $this->id = $id;
        $this->description = $description;
        $this->completed = $completed;
    }
}

class TaskManager {
    private $tasksFile;

    function __construct($tasksFile = 'tasks.json') {
        if (!file_exists($tasksFile)) {
            file_put_contents($tasksFile, json_encode([]));
        }
        $this->tasksFile = $tasksFile;
    }

    function listTasks() {
        return $this->loadTasks();
    }

    function addTask($description) {
        $tasks = $this->loadTasks();
        $id = max(array_map(function($task) { return $task['id']; }, $tasks)) + 1 ?: 1;
        array_push($tasks, ['id' => (int)$id, 'description' => trim((string)$description), 'completed' => false]);
        $this->saveTasks([]);
    }

    private function loadTasks() {
        return json_decode(file_get_contents($this->tasksFile) ?? '{ }', true);
    }
}