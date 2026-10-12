package handlers

import (
	"encoding/json"
    "fmt"
    "os"
)

func AddTask(taskText string) error {
    // Load tasks from storage
    taskItems := loadTasksFromStorage()
    
    if err != nil {
        fmt.Printf("Error loading tasks: %s\n", err)
        return err
    }
    
    
    newTask := Task{
        Text:  taskText,
        Done:  false, // New tasks are not done by default
    }

    // Add the new task to the list of all tasks
    taskItems = append(taskItems, nextTask)

    // Save updated list of all tasks back into storage
    err2 := writeTasks(nextTask)
    
    if err2 != nil {
        fmt.Printf("Error writing tasks: %s", err)
        return err2
    }
            
	fmt.Println(fmt.Sprintf("'Done' marked complete for task '%v'.", nextTask.Text))

}