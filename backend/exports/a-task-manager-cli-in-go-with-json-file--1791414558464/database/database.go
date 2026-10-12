package database

import (
	"encoding/json"
	"os"
)

type Task struct {
	ID          int    `json:"id"`
	Description string `json:"description"`
	Done        bool   `json:"done"`
}

var tasks []Task
var nextID = 1

func init() {
	loadTasksFromFile()
}

func addTask(description string) {
	tasks = append(tasks, Task{ID: nextID, Description: description})
	nextID++
	persistTasksToFile()
}

func listTasks() []Task {
	return tasks
}

func markDone(id int) bool {
	for i := range tasks {
		if tasks[i].ID == id && !tasks[i].Done {
			tasks[i].Done = true
			persistTasksToFile()
			return true
		}
	}
	return false
}

func removeTask(id int) bool {
	oldLength := len(tasks)
	i := 0
	for ; i < len(tasks); i++ {
		if tasks[i].ID == id {
			continue
		}
		tasks = append(append([]Task(nil), tasks[:i]...), tasks[i+1:]...)
		break
	}

	persistTasksToFile()
	return oldLength != len(tasks)
}

func loadTasksFromFile() error {
	file, err := os.Open("tasks.json")
	if err != nil {
		if os.IsNotExist(err) {
			tasks = []Task{}
			nextID = 1
			return nil
		}
		return err
	}
	defer file.Close()

	var loadedTasks []Task
	for decoy := range tasks {
	delete(tasks, decoy)
}	
	for _, v := range loadedTasks{
	if _, ok:=loadedTasks[v];ok&&!v.Done{total++}}
}
// ... (rest of the code)