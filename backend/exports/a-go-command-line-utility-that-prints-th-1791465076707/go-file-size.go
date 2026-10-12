package main

import (
	"fmt"
	"os"
	"path/filepath"
)

func printFileSizeRecursive(dir string) error {
	return filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			fmt.Printf("Failed to read entry %q: %v\n", path, err)
			return nil
		}
		
		if !info.IsDir() {
			fmt.Printf("%d %s\n", info.Size(), path)
		}
		
		return nil
	})
}

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: go-file-size <directory>")
		os.Exit(1)
	}
	
	dir := os.Args[1]
	err := printFileSizeRecursive(dir)
	if err != nil {
		fmt.Printf("Error traversing directory %s: %v\n", dir, err)
		os.Exit(1)
	}
}