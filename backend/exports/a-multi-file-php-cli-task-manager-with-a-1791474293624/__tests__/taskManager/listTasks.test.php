<?php

// __tests__/taskManager/listTasks.test.php
use PHPUnit\Framework\TestCase;

class ListTaskTest extends TestCase {
    protected $dataDir = '/tmp';

    public function setUp(): void {
        if (!file_exists($this->dataDir)) {
            mkdir($this->dataDir);
        }

        // Create initial test data file
        copy(__DIR__ . '/../../src/tasks.json', __DIR__ . '/../tasks.json');
    }

    public function tearDown(): void {
        unlink(__DIR__ . '/../tasks.json');
    }

    /**
     * Lists all tasks from a JSON file.
     *
     * @param string $jsonFilePath The path to the JSON file storing the tasks
     * @return array An array of task objects, each with properties id, description, and done
 */
public function listTasks($jsonFilePath): array {
        // Read tasks from the JSON file

        $fileData = file_get_contents($jsonFilePath);
  
        if ($fileData === false) {
            return [];
        }

        $tasks = json_decode($fileData, true);

// Utility function to read tasks from JSON file
function readTasks($jsonFilePath): array {
    if (!file_exists($jsonFilePa

Please try again.
}
}
}
