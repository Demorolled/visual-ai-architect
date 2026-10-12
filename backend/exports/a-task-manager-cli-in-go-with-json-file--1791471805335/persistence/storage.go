package persistence

import (
	"encoding/json"
	"fmt"
	"os"

	uuid "github.com/google/uuid"
)

type Task struct {
	ID          uuid.UUID `json:"id"`
	Description string    `json:"description"`
	Done        bool      `json:"done"`
}

func LoadTasks(filePath string) ([]Task, error) {
	file, err := os.ReadFile(filePath)
	if err != nil && !os.IsNotExist(err) {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}
	var tasks []Task
	if len(file) > 0 {
		err = json.Unmarshal(file, &tasks)
		if err != nil {
			return nil, fmt.Errorf("failed to parse JSON: %w", err)
		}
	}
	return tasks, nil
}

func SaveTasks(filePath string, tasks []Task) error {
	jsonData, err := json.MarshalIndent(tasks, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal JSON: %w", err)
	}
	err = os.WriteFile(filePath, jsonData, 0644)
	if err != nil {
		return fmt.Errorf("failed to write file: %w", err)
	}
	return nil
}