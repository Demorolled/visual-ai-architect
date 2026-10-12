package src

import (
	"fmt"
	"os"
)

func GetDirectorySize(dirPath string) error {
	dirEntries, err := os.ReadDir(dirPath)
	if err != nil {
		return err
	}

	for _, entry := range dirEntries {
		if !entry.IsDir() {
			size, err := entry.Info()
			if err != nil {
				return err
			}
			fmt.Printf("%s: %d bytes\n", entry.Name(), size.Size())
		}
	}

	return nil
}