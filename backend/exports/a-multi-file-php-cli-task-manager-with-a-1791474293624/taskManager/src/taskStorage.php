<?php

class TaskStorage {
    private $filePath = 'src/tasks.json';

    public function loadTasks(): array {
        if (!file_exists($this->filePath)) {
            return [];
        }
        $data = file_get_contents($this->filePath);
        return json_decode($data, true) ?? [];
    }

    public function saveTasks(array $tasks): bool {
        $jsonData = json_encode($tasks, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if ($jsonData === false) {
            return false;
        }
        file_put_contents($this->filePath, $jsonData);
        return true;
    }
}