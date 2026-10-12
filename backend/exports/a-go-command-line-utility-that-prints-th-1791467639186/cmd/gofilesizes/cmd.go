package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
)

func printFileSizes(root string) {
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return fmt.Errorf("unable to read directory %s: %v", path, err)
		}
		if !d.Type().IsDir() {
			fileInfo, err := d.Info()
			if err != nil {
				log.Printf("failed to get size for file %s: %v", path, err)
				return nil
			}
			fmt.Printf("%s\t%d\n", path, fileInfo.Size())
		}
		return nil
	})
	if err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
}

func main() {
	root := "."
	if len(os.Args) > 2 && (os.Args[1] == "-h" || os.Args[1] == "--help") {
		fmt.Fprintln(os.Stderr, "gofilesizes")
		fmt.Fprintln(os.Stderr)
		fmt.Fprintf(os.Stderr, "\t gofilesizes [directory]. The directory is optional and defaults to the current directory.")
		os.Exit(0)
	}
	if len(os.Args) > 1 && os.Args[1] != "" {
		root = os.Args[1]
	}

	printFileSizes(root)

	os.Exit(0)
}