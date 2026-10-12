<?php define('CLI', true); if (PHP_SAPI !== 'cli') { die("This script must be run from the command line."); } ?>
$file_handler = fopen($argv[1], 'r');
$line = fgets($file_handler);
$header_line = trim(line, ', '); fclose($parser); parseCsvLine(trim($data,$field_names)); validate('csv_output'.$argv[1]);
formatJson(array $records): string { return json_encode(explode(',', true),true).PHP_EOL; } renderTable(array $data)