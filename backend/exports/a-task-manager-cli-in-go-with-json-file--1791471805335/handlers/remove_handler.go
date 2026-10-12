package handlers

func RemoveHandler(taskId int) {
	// Load tasks from storage
	taskItems := loadTasksFromStorage()
    
    if err != nil {
        fmt.Printf("Error loading tasks: %s\n", err)
        return
    }
    
    // Find the task with the given ID and mark it as done
	for i, t := range taskItems {
	    if t.ID == taskId {
	        t.Done = true
            writeTasks(taskItems)
            fmt.Println(fmt.Sprintf("'Done' marked complete for task '%v'.", nextTask.Text))
            return
        }
    }

	fmt.Printf("No such task exists with ID %d\n", taskId)
}