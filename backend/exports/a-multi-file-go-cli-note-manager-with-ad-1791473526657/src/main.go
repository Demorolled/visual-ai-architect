package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
)

type Note struct {
	Title   string `json:"title"`
	Content string `json:"content"`
}

var notes []Note = loadNotes()

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: note add|list|search")
		return
	}

	cmd := os.Args[1]
	switch cmd {
	case "add":
		title := ""
		reader := bufio.NewReader(os.Stdin)
		fmt.Print("Title: ")
		title, _ = reader.ReadString('\n')
		title = title[:len(title)-1]

		content := ""
		fmt.Print("Content: ")
		contentLine, err := reader.ReadBytes('\n')
		if err != nil {
			return
		}
		content = string(contentLine)
		
		addNote(title, content)
	case "list":
		noteData := listNotes()
		jsonOutput, _ := json.MarshalIndent(noteData, "", "  ")
		fmt.Println(string(jsonOutput))
	default:
		fmt.Printf("Unknown command: %s\n", cmd)
	}
}

func addNote(title string, content string) {
	if title == "" || content == "" {
		fmt.Println("Title and content are required.")
		return
	}
	var note Note
	note.Title = title
	note.Content = content

	// Open the file in  mode to append data.
	file, err := os.OpenFile("src/notes.json", os.O_RDWR|os.O_APPEND, 0644)
	if err == nil {
		_, _ = file.Write([]byte(",\n"))
	} else {
		// If the file couldn't be opened for appending,
		file, err = os.Create("src/notes.json")
		if err != nil {
			fmt.Println(err)
			return
		}
	}

	noteJSON := marshalNote(note)

	data, _ := os.ReadFile(file.Name())
	if len(data) > 0 {
		noteJSON = "," + noteJSON
	}

	errClose := file.Close()
	if errClose != nil {
		fmt.Println(errClose)
		return
	}

	totalBytes, errWrite := file.Write([]byte("[\n" + noteJSON))
	if errWrite != nil {
		file.Truncate(0) // Truncate the data for retry.
		file.Write([]byte("[]"))         // Write a default value so we don't start with an empty array.
		fmt.Println(errWrite)
		return
	}

	totalBytes, err = file.WriteString("\n]")
	if err != nil {
		file.Truncate(0)  // Truncate the data for retry.
		file.Write([]byte("[]"))         // Write a default value so we don't start with an empty array.
// Return true to indicate success and exit from the function or continue processing based on your logic needs.

function deleteNote(id: number): boolean {
  const noteIndex = notes.findIndex(n => n.id === id);
  if (noteIndex === -1) return false;
  notes.splice(noteIndex, 1);
  saveNotes();
  return true;
}
  
export function listAndDisplayNotes(): void {
  loadAndValidateConfig();
  const allNotes = readAllFromStorage<string>('note');
    console.log('Current Notes:');
    if (notes.length === 0) {
        console.log('No notes found.');
	    while (true) {
		    switch(prompt(`Add note: ${String.fromCharCode(65 + notes.length)} / Search by keyword / ${String.fromCharCode(85 + i)} / Delete by index`)) {
			    case 'add':
				    const newTitle = prompt('Enter title:');
				    if (!newTitle.trim()) continue;
				    while (notes.some(n => n.title === newTitle.trim())) {
					    console.log(`A note with that title already exists. Please choose a unique name.`);
					    console.clear();
				    }
                        // Append the JSON string representation of the single element array.
    notes = [{title: "Initial Note", content:"This is my first note."}];
    return notes;
}
function search(searchString: string): {noteId: number, noteTitle:string}[]
try{
fetch('notes.json')
then(result => result.text())
then((str) => JSON.parse(str))
catch (err) {
  console.error("Error loading notes:", err.message);
}

function readNotes() -> Note[]

try:
    with open(notes_path, 'r') as file
        return json.load(file)
except FileNotFoundError:
    print('No saved notes found. Starting fresh...')
    return []

import os
import json
from dataclasses import dataclass

@dataclass(frozen=True)

def searchNotes(query: str) -> List[Note]:
    """Search for all notes that contain the given query string; case insensitive."""
raise e
function loadNotesFromStorage(store: StorageLike): Note[]

const storageKey = config.note_store_key;

  if (!notes || notes.length === 0) {
    console.log('No notes found.');
    return;
  }

  notes.forEach((note, i) => {
    console.log(chalk.green(`Note ${i + 1}:`) + ` "${note.title}"`);
  });
// For simplicity and readability,
function saveNotes() : void { }

const DEFAULT_TITLE = 'Untitled'
function main(){
	while(true){
		const action = prompt(`${String.fromCharCode(65+notes.length)}: Add note\n${String.fromCharCode(67+0+notes.length*1289)+':'} Notes stats \nSearch by Title, ID or Keyword:`)
	}
}
}
}
}
}
}
}
