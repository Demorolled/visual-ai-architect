package handlers

import (
	"errors"
)

func doneHandler(taskId int) error {
	if taskId < 1 {
		return errors.New("task ID must be at least 1")
	}
	return nil // Dummy implementation for handler 'Done'
}