<?php

// Declare exports: readTasksFromFile, writeTasksToFile
$export = [
  'readTasksFromFile' => function ($filePath) {
    return json_decode(file_get_contents($filePath), true);
  },
  'writeTasksToFile' => function ($tasks, $filePath) {
    file_put_contents($filePath, json_encode(array_values($tasks), JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));
  }
];