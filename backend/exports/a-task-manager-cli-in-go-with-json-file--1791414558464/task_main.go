package main

import (
	"fmt"
	"os"

	"database"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: go run task_main.go [add|list]")
		return
	}

	cmd := os.Args[1]

	switch cmd {
	case "add":
		if len(os.Args) < 3 {
			fmt.Println("Usage: go run task_main.go add 'description'")
			return
		}
		description := os.Args[2]
		database.AddTask(description)
		fmt.Printf("Added task: %s\n", description)
	case "list":
		tasks := database.ListTasks()
		if len(tasks) == 0 {
			fmt.Println("No tasks found.")
			return
		}
		for _, task := range tasks {
			fmt.Printf("%d. %s (done: %t)\n", task.ID, task.Description, task.Done)
		}
	default:
		fmt.Println("Unknown command. Use 'add' or 'list'.")
	}
}