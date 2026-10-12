<?php
// Config Constants (src/main.php)
define('TASK_DB_PATH', __DIR__ . '/tasks.json'); // Database location
define('DEFAULT_CACHE_DIR', sys_get_temp_dir());  // Default cache directory

// Environment Variables (not used in this example but can be populated if needed)
putenv("TASK_DB_PATH=" . TASK_DB_PATH);