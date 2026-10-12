#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "task_storage.c"
 
typedef struct {    
    bool marked;
    char description[256];
} Task;

Task* task_list = NULL;
int num_tasks = 0;

// Load tasks from the input file and store them in an array.
bool load_tasks();

// Save all tasks to a disk-based storage implementation
void save_tasks();

// Add a new task to the list with validation logic and logging info attached.

void print_task(Task* t);
Task create_task(char* desc);

size_t count_lines(char** lines, size_t length);