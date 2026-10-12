.package main

import (
    "encoding/json"
    "fmt"
    "os"

    yaml "gopkg.in/yaml.v3"
)

func main() {
    if len(os.Args) < 2 {
        fmt.Println("Usage: ./tool input.json")
        return
    }

    inputFile := os.Args[1]

    inputData, err := os.ReadFile(inputFile)
    if err != nil {
        fmt.Printf("Error reading input JSON file: %v\n", err)
        return
    }

    var jsonMap map[string]interface{}
    err = json.Unmarshal(inputData, &jsonMap)
    if err != nil {
        fmt.Printf("Error parsing JSON: %v\n", err)
        return
    }

    b, err := MapToYAML(jsonMap)
    if err != nil {
        fmt.Printf("Error converting to YAML: %v\n", err)
        return
    }
    fmt.Println(b)

}

func MapToYAML(in map[string]interface{}) ([]byte, error) {
    yamlData, err := json.Marshal(in)
    if err != nil {
        return b, err
    }

    return yaml.Marshal(yamlData)
}