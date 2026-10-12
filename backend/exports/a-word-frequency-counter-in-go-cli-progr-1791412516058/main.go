package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

func countWords(filename string) (map[string]int, error) {
	file, err := os.Open(filename)
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	wordCount := make(map[string]int)

	for scanner.Scan() {
		line := strings.Fields(scanner.Text())
		for _, word := range line {
			word = strings.ToLower(strings.ReplaceAll(word, ".", ""))
			word = strings.ToLower(strings.ReplaceAll(word, ",", ""))
			word = strings.ToLower(strings.ReplaceAll(word, "!", ""))
			word = strings.ToLower(strings.ReplaceAll(word, "?", ""))
			word = strings.ToLower(strings.ReplaceAll(word, ";", ""))
			word = strings.ToLower(strings.ReplaceAll(word, ":", ""))
			word = strings.ToLower(strings.ReplaceAll(word, "\"", ""))
			word = strings.ToLower(strings.ReplaceAll(word, "'", ""))

			if word != "" && len(word) > 2 {
				wordCount[word]++
			}
		}
	}

	return wordCount, nil
}

func main() {
	if len(os.Args) != 2 {
		fmt.Println("Usage: go run . <input-file>")
		os.Exit(1)
	}

	filePath := os.Args[1]
	wordCount, err := countWords(filePath)
	if err != nil {
		fmt.Printf("Error reading file: %v\n", err)
		os.Exit(1)
	}

	for word, count := range wordCount {
		fmt.Printf("%s: %d\n", word, count)
	}
}