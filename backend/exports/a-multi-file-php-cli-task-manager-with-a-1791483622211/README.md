<!--

    Title of project: CLI Task Manager
    
    Language used:
    
    What this program accomplishes:
        -   The index.php contains the entry point for the PHP CLI task manager.
            It parses command-line arguments and orchestrates the flow of operations based on the requested commands like add, list, done -- all of them are simple and don't require complex validation. 
        -   The parser.php handles argument parsing: it reads the input parameters passed from the user's terminal (index.php) then maps those to predefined tasks according to their respective positions within each command string after splitting by whitespace; finally, these tokens will determine what action is being invoked next which can be one among 'add', 'list' or 'delete'. 
        -   storage_file_handler.php defines a class which takes care of managing task data persisted within an external JSON file structure: it opens that file path and loads tasks stored on disk into memory as objects, converts them back onto the disk when changes occur throughout execution time and guarantees transactional updates during runtime to avoid corruption or loss. 
        -   Lastly, there is a 'tasks_manager.php' where all high-level state management happens; it maintains an internal representation for tasks being manipulated per session including adding new ones with timestamps plus updating their status based on whether the done flag has been set or not before writing out any changes into storage.

-->