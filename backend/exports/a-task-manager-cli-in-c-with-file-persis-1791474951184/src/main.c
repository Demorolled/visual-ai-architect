#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_TASKS 100

typedef struct {
    char description[256];
    int done;
} Task;

int taskCount = 0;
Task tasks[MAX_TASKS];

void add(const char *description);
void list(void);
void toggle(int index);
void remove_(int index);

int main() {
    printf("Task Manager\n");
    
    // Add some initial tasks
    add("Buy groceries");
    add("Pay bills");
    add("Walk the dog");

    // List all tasks
    printf("\nAll Tasks:\n");
}
