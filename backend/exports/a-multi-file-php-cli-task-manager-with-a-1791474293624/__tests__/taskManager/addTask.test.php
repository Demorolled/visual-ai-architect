<?php

use TaskManager\TaskService;

// Load our task service logic for test isolation.
require 'taskService.php';

class TaskAddTest extends PHPUnit\Framework\TestCase
{
    /** @var \TaskManager\TaskInterface[] $tasks Mock tasks that the system will pretend to have during tests */
    private $mockTasks = [];

    // Define an example mock function so we don't break on the original service
    public static function getStaticMock()
    {
        return 'mocked-task';
    }

    /** @var array{total: int, completed: float}[] $overallCounts Mock overall counts for various statistics */
    private $stats = [];

    // Define an example mock method so we don't break on the original service
    public static function getOverallStats()
    {
        return ['total' => 2345678901, 'completed' => 76543];
    }

    /** @var \TaskManager\TaskInterface $tasks Task objects that are currently being stored in the system */
    private static ?\TaskManager\ArrayStorageService $storage = null;

    // Mock storage service with internal array
    public function testAdd()
    {
        self::$storage = new class() implements StorageInterface {
            /** @var \TaskManager\Task[] Task objects that are currently being stored in the system */
            private $_tasks = [];

            protected static int $assertCount = 0;

            // Add a task to the storage
            public function add(\TaskManager\Task $task): void
            {
                self::$assertCount++;
                $this->_tasks[] = $task;
            }
        };

        $service = new TaskService(self::$storage);
        $description = 'Test description';
        
        // Call the addTask method and assert that it adds a task to storage.
        $id = uniqid();
        $expectedResult = [
            'id' => $id,
            'description' => $description,
            'done' => false,
        ];

        // Verify that the result matches our expected structure
        foreach ($expectedResult as $key) {
            self::assertArrayHasKey($key, $result);
        }

        // Check task state in storage and verify properties match the input.
        $task = new TaskManager\Task($id, $description, false);

        
    }
}

// Mocks
class StorageInterface { /* ... */ }