package main

import (
	"fmt"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: go run . (add|list|search)")
		return
	}

	switch os.Args[1] {
	case "add":
		if len(os.Args) != 3 {
			fmt.Println("Usage:go run . add \"Your note here\"")
			return
		}
		note := os.Args[2]
		addNote(note)
	case "list":
		listNotes()
	case "search":
		if len(os.Args) < 3 {
			fmt.Println("Usage: go run . search \"term\"")
			return
		}
		searchTerm := os.Args[2]
		searchNotes(searchTerm)
	default:
		fmt.Println("Unknown command. Run 'go run .' for help.")
	}
}

func addNote(note string) {
	fmt.Println("Adding note:", note)
}

func listNotes() {
	fmt.Println("Listing all notes")
}

func searchNotes(term string) {
	fmt.Printf("Searching for notes containing '%s'\n", term)
}