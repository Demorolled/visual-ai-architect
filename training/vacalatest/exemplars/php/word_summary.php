<?php
// PHP exemplar: starts with <?php, stdlib only, read from STDIN, echo output.
$text = stream_get_contents(STDIN);
$words = preg_split('/\s+/', trim($text), -1, PREG_SPLIT_NO_EMPTY);
$distinct = array_unique($words);

echo "words=" . count($words) . " distinct=" . count($distinct) . "\n";
