package pkg

import (
	"fmt"
	"os"
	"path/filepath"

	math "math"
)

func printDirectorySizes(root string) {
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			fmt.Printf("Error reading path %s: %v\n", path, err)
			return nil // Continue walking
		}
		if !info.IsDir() {
			sizeBytes := info.Size()
			fmt.Printf("%s\t%d bytes\n", path, sizeBytes)
		}
		return nil
	})
	if err != nil {
		fmt.Printf("Error walking directory %s: %v\n", root, err)
	}

	filesToProcess := []string{"test1.txt", "test2.txt"}
	for _, f := range filesToProcess {
		filePath := filepath.Join(root, f)

// ... (truncated)
}
}
