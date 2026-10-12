<?php

function run() {
    if (count($argv) < 2) {
        echo 'Usage: php cli.php <target-directory> {--html|--json}';
        return;
    }

    $targetDir = $argv[1];
    $outputFormat = $argv[2] ?? '--html';

    if (!is_dir($targetDir)) {
        echo "Directory not found";
        return 1;
    }

    list($files, $_) = dirlist_recursive($targetDir);

    ksort($files, SORT_STRING);
    foreach ($files as $filePath => $fileStat) {
        if (substr(basename($item['path']), -3) === 'php') {
            continue;
        }
        
        $fileSize = filesize($item['path']);
        echo "$filePath – {$sizes[$item['bytes']]}\n";
    }

    printf("Total files: %s\n", get_readable_num(count($files)));
    printf("Total size:  %s\n", human_file_size(array_sum(array_map('filesize', $fpaths))));
}

function dirlist_recursive($targetDir) {
    static $res = []; static $depth = 0;
    $res[] = [
        'path' => str_replace(ROOT_PATH, '', $targetFile),
    }
}