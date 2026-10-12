package main

import (
	"encoding/json"
	"fmt"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Printf("Usage: %s <json_file>\n", os.Args[0])
		return
	}

	jsonFile := os.Args[1]
	yamlData, err := ConvertJSONToYAML(jsonFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error converting JSON to YAML: %v\n", err)
		os.Exit(1)
	}

	fmt.Println(string(yamlData))
}