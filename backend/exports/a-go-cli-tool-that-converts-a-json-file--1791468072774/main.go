package main

import (
	"encoding/json"
	"fmt"
	"os"

	"gopkg.in/yaml.v2"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: json-to-yaml [json-file]")
		os.Exit(1)
	}

	jsonFile := os.Args[1]
	data, err := os.ReadFile(jsonFile)
	if err != nil {
		fmt.Printf("Error reading json file %s: %v\n", jsonFile, err)
		os.Exit(1)
	}

	var jsonData map[string]interface{}
	err = json.Unmarshal(data, &jsonData)
	if err != nil {
		fmt.Printf("Error parsing JSON data from file %s: %v\n", jsonFile, err)
		os.Exit(1)
	}

	yamlData, err := yaml.Marshal(jsonData)
	if err != nil {
		fmt.Printf("Error converting JSON to YAML: %v\n", err)
		os.Exit(1)
	}

	err = os.WriteFile(jsonFile+".yaml", append(yamlData, '\n'), 0644)
	if err != nil {
		fmt.Printf("Error writing converted YAML data: %v\n", err)
		os.Exit(1)
	}
}