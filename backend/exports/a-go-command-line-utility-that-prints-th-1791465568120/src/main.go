package main

import (
	"fmt"
	"os"
	"path/filepath"

)

func main() {
	dir := "."
	if len(os.Args) > 1 {
		dir = os.Args[1]
	}
.GetFilesAndSizes(dir)
	
}

func GetFilesAndSizes(dir string){
	err:= filepath.Walk(dir, func(path string, info os.FileInfo, err error) error{
	if err != nil {
			return err
		}
		fmt.Printf("%s:%d bytes\n", path, info.Size())
	})
}