package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"

	yaml "gopkg.in/yaml.v2"
)

func convertJSONToYAML(jsonPath string) error {
	jsonFile, err := os.Open(jsonPath)
	if err != nil {
		return fmt.Errorf("failed to open JSON file: %v", err)
	}
	defer jsonFile.Close()

	jsonData, err := ioutil.ReadAll(jsonFile)
	if err != nil {
		return fmt.Errorf("failed to read JSON file: %v", err)
	}

	var decodedJSON interface{}
	err = json.Unmarshal(jsonData, &decodedJSON)
	if err != nil {
		return fmt.Errorf("failed to decode JSON: %v", err)
	}

	yamlOut, err := yaml.Marshal(decodedJSON)
	if err != nil {
		return fmt.Errorf("failed to convert JSON to YAML: %v", err)
	}

	fmt.Println(string(yamlOut))
	return nil
}

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage:", os.Args[0], "<input-json>")
		os.Exit(1)
	}
	jsonPath := os.Args[1]

	err := convertJSONToYAML(jsonPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err.Error())
		os.Exit(1)
	}
}